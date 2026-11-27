// Entry point: connects the page elements to the modules and opens the chosen book.

import { readEpub } from "./epub.js";
import { buildBook } from "./book.js";
import { setBook, prevChunk, currentChunk, nextChunk } from "./chunks.js";
import { initDisplay, loadChunk } from "./display.js";
import { initDrag } from "./drag.js";
import { initControls } from "./controls.js";
import { initSettings } from "./settings.js";

const reader = document.getElementById("reader");

initDisplay(reader, document.getElementById("track"));
initSettings({
    reader,
    container: document.getElementById("settings"),
    fontFileInput: document.getElementById("font_file"),
    resetButton: document.getElementById("reset_settings"),
});
initDrag(reader);
initControls({
    playPauseButton: document.getElementById("play_pause"),
    speedInput: document.getElementById("speed"),
    spaceGapInput: document.getElementById("space_gap"),
});

document.getElementById("file_submit").addEventListener("click", openBook);

async function openBook(event) {
    event.preventDefault();

    const file = document.getElementById("file_input").files[0];
    if (!file) return;

    const { textFiles } = await readEpub(file);
    const book = buildBook(textFiles);
    setBook(book);
    console.log(book);

    loadChunk(0);
    console.log({ prevChunk, currentChunk, nextChunk });
}
