// Dragging the text: left = forward, right = rewind.
// While dragging, auto-scroll is held (playback stays "playing" and continues on release).

import { getChunkCount } from "./chunks.js";
import { scrollByPx, setDragging } from "./display.js";

export function initDrag(reader) {
    let dragging = false;
    let lastX = 0;

    reader.addEventListener("pointerdown", (event) => {
        if (getChunkCount() === 0 || event.button !== 0) return;
        dragging = true;
        setDragging(true);
        lastX = event.clientX;
        reader.setPointerCapture(event.pointerId); // keep receiving moves even if the pointer leaves the reader
    });

    reader.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const dx = event.clientX - lastX;
        lastX = event.clientX;
        scrollByPx(-dx); // text follows the pointer
    });

    const endDrag = () => {
        dragging = false;
        setDragging(false);
    };
    reader.addEventListener("pointerup", endDrag);
    reader.addEventListener("pointercancel", endDrag);
}
