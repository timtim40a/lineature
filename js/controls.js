// Page controls: play/pause button, spacebar, speed input, space gap input.

import { setSpaceGap } from "./chunks.js";
import { onPlayStateChange, togglePlayPause, setScrollSpeed, refreshDisplay } from "./display.js";

export function initControls({ playPauseButton, speedInput, spaceGapInput }) {
    // play/pause button; its label follows the playback state (also when the book ends)
    playPauseButton.addEventListener("click", togglePlayPause);
    onPlayStateChange((playing) => {
        playPauseButton.textContent = playing ? "Pause" : "Play";
    });

    // Spacebar toggles play/pause, but only when nothing is focused, so typing in inputs and
    // pressing space on a focused button keep their normal behaviour
    document.addEventListener("keydown", (event) => {
        if (event.code !== "Space") return;
        const focused = document.activeElement;
        if (focused && focused !== document.body && focused !== document.documentElement) return;
        event.preventDefault(); // otherwise space also scrolls the page down
        if (!event.repeat) togglePlayPause(); // holding space doesn't flicker play/pause
    });

    // speed in characters per second; empty/zero/negative is ignored while the user is still typing
    const applySpeed = () => setScrollSpeed(parseFloat(speedInput.value));
    speedInput.addEventListener("input", applySpeed);
    applySpeed();

    // spaces appended to the last chunk of every chapter; the input's value="" is the starting value
    const applySpaceGap = () => {
        const n = parseInt(spaceGapInput.value, 10);
        setSpaceGap(Number.isNaN(n) || n < 0 ? 0 : n);
        refreshDisplay(); // the gap changes the chunk text, so redraw at the same reading position
    };
    spaceGapInput.addEventListener("input", applySpaceGap);
    applySpaceGap();
}
