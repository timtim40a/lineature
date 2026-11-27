// The scrolling text: rendering chunks into the track, moving it, and the play/pause loop.
//
// The text runs along one line inside the reader element. The track holds one <span> per chunk, for
// consecutive chunks, and is moved with translateX. Spans are added ahead of the visible area and removed
// once far behind it, so only a few chunks are ever in the DOM.
//
// Positions are in "track coordinates": px from the left edge of the first span in the track.
// trackPos is the track coordinate under the reading anchor (READING_ANCHOR of the way across the reader).
// The chunk under the anchor is the current chunk, and prevChunk/currentChunk/nextChunk follow it.

import {
    book, currentChunkNumber, getChunk, getChunkCount,
    setChunkWindow, goToNextChunk, goToPrevChunk,
} from "./chunks.js";

const READING_ANCHOR = 0.25;        // where the reading position sits, as a fraction of the reader's width
const TRACK_BUFFER_PX = 800;        // how far beyond each edge of the reader spans are kept rendered
let paragraphSeparator = "  ¶  "; // shown in place of each "\n", since the text is a single line

export let scrollSpeed = 15;   // characters per second (~180 words per minute)
export let isScrolling = false;
let isDragging = false;        // while true, the loop keeps running but doesn't auto-scroll

let reader = null;
let track = null;
let resizeObserver = null;

let trackSpans = [];    // [{ n, el, chars, width }] for consecutive chunk numbers, left to right
let trackPos = 0;
let readerWidth = 0;
let frameId = null;
let lastFrameTime = null;

const playStateListeners = [];

// Call once with the #reader element and the #track element inside it
export function initDisplay(readerEl, trackEl) {
    reader = readerEl;
    track = trackEl;
    readerWidth = reader.clientWidth;

    // Font, size or window changes alter the widths: re-measure and keep the same spot under the anchor
    resizeObserver = new ResizeObserver(() => remeasureTrack());
    resizeObserver.observe(reader);
}

// ---------- playback ----------

// fn(isScrolling) is called whenever playback starts or stops (including at the end of the book)
export function onPlayStateChange(fn) {
    playStateListeners.push(fn);
}

export function startScrolling() {
    if (isScrolling || !book) return;
    isScrolling = true;
    lastFrameTime = null;
    frameId = requestAnimationFrame(scrollFrame);
    for (const fn of playStateListeners) fn(true);
}

export function stopScrolling() {
    isScrolling = false;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    for (const fn of playStateListeners) fn(false);
}

export function togglePlayPause() {
    if (isScrolling) stopScrolling();
    else startScrolling();
}

// Characters per second; non-positive values are ignored
export function setScrollSpeed(charsPerSecond) {
    if (charsPerSecond > 0) scrollSpeed = charsPerSecond;
}

// What each "\n" is shown as; redraws at the same reading position
export function setParagraphSeparator(separator) {
    paragraphSeparator = separator;
    refreshDisplay();
}

export function setDragging(dragging) {
    isDragging = dragging;
}

function scrollFrame(time) {
    if (!isScrolling) return;

    // seconds since the last frame, capped so a backgrounded tab doesn't jump ahead when it returns
    const dt = lastFrameTime === null ? 0 : Math.min((time - lastFrameTime) / 1000, 0.1);
    lastFrameTime = time;

    // the pointer is moving the text; keep the loop (and frame timing) alive without auto-scrolling
    if (isDragging) {
        frameId = requestAnimationFrame(scrollFrame);
        return;
    }

    // speed is in characters, so convert using the current chunk's average character width
    const { span } = getReadingLocation();
    const pxPerChar = span.chars > 0 ? span.width / span.chars : 0;

    if (!scrollByPx(scrollSpeed * pxPerChar * dt)) {
        stopScrolling(); // reached the end of the book
        return;
    }
    frameId = requestAnimationFrame(scrollFrame);
}

// ---------- moving and jumping ----------

// Moves the text by dx px (positive = forward through the book, negative = back).
// Returns false if it hit the start or end of the book, true otherwise.
export function scrollByPx(dx) {
    if (trackSpans.length === 0) return false;

    trackPos += dx;
    fillTrack();

    let moved = true;
    const last = trackSpans[trackSpans.length - 1];
    if (trackSpans[0].n === 0 && trackPos < 0) {
        trackPos = 0;
        moved = false;
    } else if (last.n === getChunkCount() - 1 && trackPos > getTrackWidth()) {
        trackPos = getTrackWidth();
        moved = false;
    }

    syncChunkWindow();
    applyTrackTransform();
    return moved;
}

// Jump anywhere: decodes chunk n and its two neighbours, and redraws the scrolling text so that
// the reading anchor sits `fraction` of the way through chunk n (0 = its first character)
export function loadChunk(n, fraction = 0) {
    n = Math.max(0, Math.min(n, getChunkCount() - 1));
    setChunkWindow(n);
    renderTrack(n, fraction);
}

// Jump to the first chunk of chapter i
export function goToChapter(i) {
    if (!book || i < 0 || i >= book.chapterStarts.length) return false;
    loadChunk(book.chapterStarts[i]);
    return true;
}

// Re-decodes and redraws the chunks on screen at the same reading position
// (e.g. after spaceGap or the paragraph separator changes, which alters the chunk text itself)
export function refreshDisplay() {
    if (getChunkCount() > 0) loadChunk(currentChunkNumber, getReadingFraction());
}

// How far through the current chunk the reading anchor is (0..1)
export function getReadingFraction() {
    return trackSpans.length > 0 ? getReadingLocation().fraction : 0;
}

// ---------- track internals ----------

// Clears the track and builds it around chunk n, with the anchor `fraction` of the way through it
function renderTrack(n, fraction = 0) {
    for (const s of trackSpans) resizeObserver.unobserve(s.el);
    trackSpans = [];
    track.replaceChildren();
    if (getChunkCount() === 0) return;

    readerWidth = reader.clientWidth;
    appendSpan(n);
    trackPos = Math.max(0, Math.min(fraction, 1)) * trackSpans[0].width;
    fillTrack();
    applyTrackTransform();
}

// Adds spans until the reader plus the buffer on both sides is covered, and drops spans far outside it
function fillTrack() {
    const anchorX = readerWidth * READING_ANCHOR;
    const visibleLeft = () => trackPos - anchorX;
    const visibleRight = () => trackPos - anchorX + readerWidth;
    const last = () => trackSpans[trackSpans.length - 1];

    while (trackSpans[0].n > 0 && visibleLeft() < TRACK_BUFFER_PX) prependSpan(trackSpans[0].n - 1);
    while (last().n < getChunkCount() - 1 && getTrackWidth() < visibleRight() + TRACK_BUFFER_PX) appendSpan(last().n + 1);

    while (trackSpans.length > 1 && trackSpans[0].width < visibleLeft() - TRACK_BUFFER_PX) removeFirstSpan();
    while (trackSpans.length > 1 && getTrackWidth() - last().width > visibleRight() + TRACK_BUFFER_PX) removeLastSpan();
}

function createSpan(n) {
    const text = getChunk(n).replaceAll("\n", paragraphSeparator);
    const el = document.createElement("span");
    el.className = "chunk";
    el.dataset.chunk = n;
    el.textContent = text;
    return { n, el, chars: [...text].length, width: 0 };
}

function appendSpan(n) {
    const s = createSpan(n);
    track.append(s.el);
    s.width = s.el.getBoundingClientRect().width;
    resizeObserver.observe(s.el);
    trackSpans.push(s);
}

function prependSpan(n) {
    const s = createSpan(n);
    track.prepend(s.el);
    s.width = s.el.getBoundingClientRect().width;
    resizeObserver.observe(s.el);
    trackSpans.unshift(s);
    trackPos += s.width; // everything shifted right by the new span
}

function removeFirstSpan() {
    const s = trackSpans.shift();
    resizeObserver.unobserve(s.el);
    s.el.remove();
    trackPos -= s.width; // everything shifted left by the removed span
}

function removeLastSpan() {
    const s = trackSpans.pop();
    resizeObserver.unobserve(s.el);
    s.el.remove();
}

function getTrackWidth() {
    let w = 0;
    for (const s of trackSpans) w += s.width;
    return w;
}

// The span under the anchor, its index in trackSpans, its left edge, and how far through it the anchor is (0..1)
function getReadingLocation() {
    let left = 0;
    for (let i = 0; i < trackSpans.length; i++) {
        const span = trackSpans[i];
        if (trackPos < left + span.width || i === trackSpans.length - 1) {
            const fraction = span.width > 0 ? Math.max(0, Math.min((trackPos - left) / span.width, 1)) : 0;
            return { span, index: i, left, fraction };
        }
        left += span.width;
    }
    return null;
}

// Keeps prevChunk/currentChunk/nextChunk on the chunk under the anchor
function syncChunkWindow() {
    const target = getReadingLocation().span.n;
    const diff = target - currentChunkNumber;
    if (diff === 1) goToNextChunk();
    else if (diff === -1) goToPrevChunk();
    else if (diff !== 0) setChunkWindow(target);
}

function remeasureTrack() {
    if (trackSpans.length === 0) {
        readerWidth = reader.clientWidth;
        return;
    }
    const { index, fraction } = getReadingLocation(); // with the old widths

    readerWidth = reader.clientWidth;
    let left = 0;
    for (let i = 0; i < trackSpans.length; i++) {
        trackSpans[i].width = trackSpans[i].el.getBoundingClientRect().width;
        if (i < index) left += trackSpans[i].width;
    }
    trackPos = left + fraction * trackSpans[index].width;

    fillTrack();
    syncChunkWindow();
    applyTrackTransform();
}

function applyTrackTransform() {
    const x = readerWidth * READING_ANCHOR - trackPos;
    track.style.transform = `translate3d(${x}px, 0, 0)`;
}
