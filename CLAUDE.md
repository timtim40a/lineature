# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Lineature is a browser-only EPUB reader whose main feature is reading the book along a horizontal scrolling line. It is plain HTML + JavaScript with no framework, no bundler and no build step. `index.html` loads `js/main.js` as `<script type="module">`, and the rest of `js/` is ES modules imported from there.

## Running

- Serve the folder over HTTP, e.g. `npx serve` or VS Code Live Server. ES module scripts do not load from `file://`.
- There is no build, lint or test setup. The `npm test` script in `package.json` is a placeholder and does not run anything meaningful.
- **Deploying.** The site is fully static: `index.html` plus `js/`, with nothing to build. It deploys to Vercel with framework preset "Other", no build command, and the project root as output. It doesn't need `node_modules` at runtime.

## Imports

There is no bundler, so the browser resolves imports itself:

- **Dependencies are vendored.** They are copied into `js/vendor/` and imported by relative path, e.g. `import { unzipSync } from './vendor/fflate.js'`. Never import from `node_modules`, which isn't deployed. Bare specifiers like `'fflate'` fail in the browser.
- **Updating fflate.** fflate stays in `package.json` only as the source for the vendored copy. After updating it, run `npm install` and then `npm run vendor`, which recopies `esm/browser.js` and its LICENSE.
- **`package.json` type.** `"type": "commonjs"` has no effect on the browser code. It does matter in Node, which treats the `js/` files as CommonJS and can't import them; see Testing.

## Modules

Dependencies only point downward in this list, and there are no circular imports:

- `main.js`: the entry point. It connects the page elements to the modules and opens the chosen book (`openBook`).
- `controls.js`: the play/pause button, spacebar, speed input and space gap input.
- `settings.js`: reader customisation (see below).
- `drag.js`: pointer dragging on the reader.
- `display.js`: the scrolling display. It renders chunks into the track, runs the animation loop, and handles play/pause and jumps (`loadChunk`, `goToChapter`).
- `chunks.js`: the loaded book, `prevChunk` / `currentChunk` / `nextChunk`, and `spaceGap`. It knows nothing about the display.
- `book.js`: text extraction and chunking (`buildBook`).
- `epub.js`: unzipping and reading the OPF (`readEpub`).
- `utf8.js`: shared UTF-8 helpers.

Modules export their state as live `let` bindings. Importers always see the current value but cannot assign to it, so every change goes through a setter (`setBook`, `setSpaceGap`, `setScrollSpeed`, `setDragging`). DOM elements are passed in through `init*` functions rather than looked up inside the modules.

## How a book is processed

1. `readEpub` unzips the file into `{ [pathInZip]: Uint8Array }`.
2. `META-INF/container.xml` gives the path of the OPF file. Never hardcode the OPF name or folder.
3. `getMetadata` parses the OPF for title, manifest items and spine order.
4. `getTextFiles` follows the spine and keeps only XHTML/HTML documents. Manifest hrefs are relative to the OPF's folder: `resolvePath` joins them and handles `..`, and hrefs go through `decodeURIComponent` before the lookup.
5. `buildBook` strips the markup from each chapter with `extractText`. It keeps each chapter's plain text as **its own UTF-8 `Uint8Array`**; chapters are never joined together. Chapters with no text are skipped, so `book.chapters` indexes don't always match spine positions. Use `chapters[i].id` to map back.
6. Each chapter is split into equal chunks:
   - `chooseChunkCount` picks how many chunks: the size is kept within 400–600 characters when possible, and as close to 512 as it can be.
   - `chunkByteOffsets` turns the split into byte offsets. Sizes differ by at most one character, and the first chunks get the leftover characters.
   - 400–600 is impossible for chapters under 400 characters or of 601–799 characters; those fall back to the size closest to 512.
7. `book.chunks` is one flat list for the whole book: chapter 0's chunks, then chapter 1's, and so on. Each entry is `{ chapter, start, end }`, a byte range in that chapter's bytes. `book.chapterStarts[i]` is the index of chapter `i`'s first chunk.
8. `main.js` calls `setBook`, then `loadChunk(0)`.

## Scrolling display (`display.js`)

- **Layout.** The text runs along a single line in `#reader`. `#track` holds one `<span class="chunk">` per chunk for a run of consecutive chunks, and is moved with `translateX`.
- **Rendered spans.** `fillTrack` adds spans ahead of the visible area and removes them once they are `TRACK_BUFFER_PX` behind it, so only a few chunks are in the DOM.
- **Positions.** Positions are "track coordinates", px from the first span's left edge. `trackPos` is the coordinate under the reading anchor, `READING_ANCHOR` of the way across the reader. The chunk under the anchor is the current chunk; `syncChunkWindow` keeps `prevChunk` / `currentChunk` / `nextChunk` on it.
- **Speed.** `scrollSpeed` is in **characters per second**. Each frame converts it to px using the current span's width divided by its character count, so the reading pace doesn't change with the font.
- **Font and size changes.** A `ResizeObserver` on the reader and every span re-measures widths and keeps the same chunk and fraction under the anchor. CSS font changes need no extra call.
- **Changes to the text itself** (`spaceGap`, the paragraph separator) need `refreshDisplay()`, which redraws at the same reading position. `setParagraphSeparator` already calls it.
- **Playback.** `startScrolling()` / `stopScrolling()` / `togglePlayPause()` control the animation. `onPlayStateChange(fn)` is how the UI learns about state changes, including stopping at the end of the book; `controls.js` uses it to set the button's label.
- **Moving.** `scrollByPx(dx)` moves the text by `dx` px and returns `false` at either end of the book; dragging uses it. Every jump must go through `loadChunk(n, fraction)` or `goToChapter(i)`, which rebuild the track. `goToNextChunk` / `goToPrevChunk` in `chunks.js` only update the variables and don't move the display.
- **Dragging** (`drag.js`). Dragging left goes forward and dragging right rewinds. While dragging, `scrollFrame` keeps running but doesn't auto-scroll, so playback stays "playing" and resumes on release without a jump. `#reader` has `touch-action: pan-y` so horizontal touch drags reach the script, and `user-select: none` so dragging doesn't select text.
- **Newlines.** Each `\n` is shown as the paragraph separator, and `.chunk` uses `white-space: pre` so runs of spaces (separators and `spaceGap`) aren't collapsed.

## Customisation (`settings.js`)

- **One schema.** `SETTINGS` lists every option with its default. Most map to a CSS custom property set on `#reader` (`--reader-font-size` and so on), which the `#reader` rule in `index.html` uses with `var()`. Others have an `apply` function, like the paragraph separator.
- **Generic binding.** Any element with `data-setting="<key>"` inside `#settings` is bound automatically. Adding an option means adding a `SETTINGS` entry plus an input with that `data-setting`; no new handler is needed.
- **Input handling.** Number inputs are parsed and clamped to the input's `min` / `max`; empty or half-typed values are ignored.
- **Width-changing settings need no extra call.** Font, size, weight and spacing change the span widths, and the `ResizeObserver` in `display.js` re-measures and keeps the reading position.
- **Saving.** Values are saved to `localStorage` under `lineature.settings`, and only known keys of the right type are restored. All storage access is in `try/catch`.
- **Uploaded fonts.** These are registered with `FontFace` under the name `LineatureCustomFont<n>` and only last for the session. A saved family with that prefix falls back to the default on the next visit.
- **Don't style spans or `#track` directly.** Spans are recreated constantly, and the track's `transform` is rewritten every frame. Add a variable on `#reader` instead.

## Invariants to preserve

- **The book stays encoded.** Chapter text is kept as bytes and decoded one chunk at a time; don't replace it with decoded strings.
- **Sizes count code points.** Chunk sizes count Unicode code points, the same as `[...str].length`. They are not bytes and not UTF-16 units (`str.length`). Chunk byte offsets always fall on a character boundary, so a multi-byte UTF-8 character is never cut in half. A UTF-8 continuation byte matches `(b & 0xC0) === 0x80`. Any new code that slices chapter bytes must respect the same boundaries.
- **Chunk offsets match the stored bytes.** `book.chunks` byte ranges are computed from the exact bytes stored in `chapters[].bytes`. If text extraction changes, the chunks must be recomputed from the new bytes.
- **`spaceGap` is added only when decoding.** `getChunk` appends `spaceGap` spaces to the last chunk of each chapter as it decodes; the stored bytes and chunk ranges don't include them. So a decoded last chunk is `spaceGap` characters longer than its byte range.
- **Chunk variables at the edges are `null`.** Navigation checks for `null` to find the ends of the book.
- **Module state stays out of `window`.** It can't be reached from the DevTools console unless it is deliberately attached to `window`.

## Testing changes

- **Running in Node.** Node can only import the modules as ES modules. Copy `js/` into a scratch folder whose `package.json` is `{"type":"module"}`; the vendored fflate comes along with it.
- **Fake DOM.** Stub `document`, `ResizeObserver`, `requestAnimationFrame` and a minimal `DOMParser` / `NodeFilter`. With those, importing `main.js` runs the real wiring. Check display behaviour from the DOM: span texts, `track.style.transform`, and the chunk under the anchor against `currentChunkNumber`. Check chunk text against `[...text]` slices on text with mixed scripts and emoji.
- **Needs a browser.** Real text extraction, OPF parsing, CSS layout and font measurement need a browser and a real EPUB.
