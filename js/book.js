// Turning chapter XHTML into plain text and splitting each chapter into equal-sized chunks.

import { utf8decoder, utf8encoder, isContinuationByte, countChars } from "./utf8.js";

// Each chapter is split into equal-sized chunks: as close to TARGET as possible, kept within MIN..MAX when it can be
const TARGET_CHUNK_CHARS = 512;
const MIN_CHUNK_CHARS = 400;
const MAX_CHUNK_CHARS = 600;

// Block-level tags that should become line breaks in the plain text
const BLOCK_TAGS = "p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, section, article, header, footer, tr, dt, dd, figcaption, hr";

// Strips the markup from every chapter, keeps each chapter's plain text as its own UTF-8 byte array,
// and splits every chapter into equal-sized chunks. Chapters with no text are skipped.
// Returns:
//   chapters[i]   = { id, path, bytes, charCount, firstChunk, chunkCount }
//   chunks[n]     = { chapter, start, end }  -> byte range inside chapters[chapter].bytes
//   chapterStarts = [firstChunk of chapter 0, of chapter 1, ...]  (index into chunks)
export function buildBook(textFiles) {
    const chapters = [];
    const chunks = [];

    for (const { id, path, bytes: xhtmlBytes } of textFiles) {
        const text = extractText(utf8decoder.decode(xhtmlBytes));
        if (!text) continue;

        const bytes = utf8encoder.encode(text);
        const charCount = countChars(bytes);
        const chunkCount = chooseChunkCount(charCount);
        const offsets = chunkByteOffsets(bytes, charCount, chunkCount);

        const chapterIndex = chapters.length;
        const firstChunk = chunks.length;
        for (let j = 0; j < chunkCount; j++) {
            chunks.push({ chapter: chapterIndex, start: offsets[j], end: offsets[j + 1] });
        }
        chapters.push({ id, path, bytes, charCount, firstChunk, chunkCount });
    }

    return { chapters, chunks, chapterStarts: chapters.map(c => c.firstChunk) };
}

// How many chunks a chapter of n characters is split into.
// Prefers a count whose chunk sizes all fall within MIN..MAX; among those (or if none fit),
// picks the one whose chunk size is closest to TARGET.
// None fit when n < MIN (one short chunk) or MAX < n < 2*MIN (one long chunk or two short ones).
function chooseChunkCount(n) {
    if (n <= 0) return 0;

    // the best count is always floor or ceil of n / TARGET
    const lo = Math.max(1, Math.floor(n / TARGET_CHUNK_CHARS));
    const candidates = [lo, lo + 1];

    const fits = (k) => Math.floor(n / k) >= MIN_CHUNK_CHARS && Math.ceil(n / k) <= MAX_CHUNK_CHARS;
    const distance = (k) => Math.abs(n / k - TARGET_CHUNK_CHARS);

    const fitting = candidates.filter(fits);
    const pool = fitting.length > 0 ? fitting : candidates;
    return pool.reduce((best, k) => (distance(k) < distance(best) ? k : best));
}

// Byte offsets splitting `bytes` (charCount characters) into k chunks whose sizes differ by at most 1 character.
// The first (charCount % k) chunks get the extra character: 1300 chars / 3 -> 434, 433, 433.
// Returns k + 1 offsets: chunk j is bytes[offsets[j] .. offsets[j + 1]).
function chunkByteOffsets(bytes, charCount, k) {
    const base = Math.floor(charCount / k);
    const extra = charCount % k;
    const sizeOf = (j) => (j < extra ? base + 1 : base);

    const offsets = [0];
    let chunk = 0;
    let nextBoundary = sizeOf(0); // character position where the next chunk starts
    let chars = 0;

    for (let i = 0; i < bytes.length; i++) {
        if (isContinuationByte(bytes[i])) continue;
        if (chars === nextBoundary) {
            offsets.push(i);
            chunk++;
            nextBoundary += sizeOf(chunk);
        }
        chars++;
    }
    offsets.push(bytes.length);
    return offsets;
}

// Turns one chapter's XHTML into plain text, one line per paragraph/heading
function extractText(xhtml) {
    let doc = new DOMParser().parseFromString(xhtml, "application/xhtml+xml");
    if (doc.querySelector("parsererror")) {
        // malformed XHTML: fall back to the forgiving HTML parser
        doc = new DOMParser().parseFromString(xhtml, "text/html");
    }

    const body = doc.querySelector("body");
    if (!body) return "";

    // collapse the source file's indentation/newlines inside text (except in <pre>)
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement?.closest("pre")) {
            node.data = node.data.replace(/\s+/g, " ");
        }
    }

    // mark where line breaks belong
    for (const br of body.querySelectorAll("br")) br.replaceWith("\n");
    for (const el of body.querySelectorAll(BLOCK_TAGS)) el.append("\n");

    return body.textContent
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join("\n");
}
