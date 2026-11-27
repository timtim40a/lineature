// The loaded book and the three decoded chunks around the reading position.
// Chunks are numbered across the whole book (chapter 0's chunks, then chapter 1's, ...),
// so next/prev move between chapters seamlessly.
//
// The exported `let`s are live: importers always see the current value, but can't assign to them,
// so changes go through the functions below.

import { utf8decoder } from "./utf8.js";

export let book = null;            // { chapters, chunks, chapterStarts } from buildBook
export let currentChunkNumber = 0; // index into book.chunks

// The three decoded chunks around the reading position (null past the start/end of the book)
export let prevChunk = null;
export let currentChunk = null;
export let nextChunk = null;

// Number of space characters appended to the last chunk of every chapter
export let spaceGap = 0;

export function setBook(newBook) {
    book = newBook;
}

export function setSpaceGap(n) {
    spaceGap = n;
}

// Decoded text of chunk n, or null if out of range.
// The last chunk of each chapter gets `spaceGap` spaces appended.
export function getChunk(n) {
    if (!book || n < 0 || n >= book.chunks.length) return null;
    const { chapter, start, end } = book.chunks[n];
    const ch = book.chapters[chapter];
    const text = utf8decoder.decode(ch.bytes.subarray(start, end));

    const isLastInChapter = n === ch.firstChunk + ch.chunkCount - 1;
    return isLastInChapter ? text + " ".repeat(spaceGap) : text;
}

export function getChunkCount() {
    return book ? book.chunks.length : 0;
}

// Index of the chapter the current chunk belongs to
export function getCurrentChapter() {
    return book?.chunks[currentChunkNumber]?.chapter ?? null;
}

// Updates prevChunk/currentChunk/nextChunk without touching the display.
// To jump and redraw, use loadChunk / goToChapter from display.js.
export function setChunkWindow(n) {
    currentChunkNumber = n;
    prevChunk = getChunk(n - 1);
    currentChunk = getChunk(n);
    nextChunk = getChunk(n + 1);
}

// Step forward one chunk, reusing the two already-decoded chunks and decoding only the new one
export function goToNextChunk() {
    if (nextChunk === null) return false;
    currentChunkNumber++;
    prevChunk = currentChunk;
    currentChunk = nextChunk;
    nextChunk = getChunk(currentChunkNumber + 1);
    return true;
}

export function goToPrevChunk() {
    if (prevChunk === null) return false;
    currentChunkNumber--;
    nextChunk = currentChunk;
    currentChunk = prevChunk;
    prevChunk = getChunk(currentChunkNumber - 1);
    return true;
}
