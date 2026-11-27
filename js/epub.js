// Opening an .epub: unzip it, find the OPF, and collect the chapter files in reading order.

// fflate is vendored (copied in) so the site needs no node_modules when deployed; refresh with `npm run vendor`
import { unzipSync } from './vendor/fflate.js';
import { utf8decoder } from "./utf8.js";

// Reads a File from an <input type="file">.
// Returns { metadata, textFiles } where textFiles[i] = { id, path, bytes } (raw XHTML bytes, in spine order).
export async function readEpub(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const files = unzipSync(buffer);

    const opfPath = getOpfFromContainer(files["META-INF/container.xml"]);
    const metadata = getMetadata(files[opfPath]);
    const textFiles = getTextFiles(files, opfPath, metadata);
    return { metadata, textFiles };
}

// Returns the book's content documents (chapters) in reading order, still as raw bytes.
// Each entry: { id, path, bytes } where bytes is the Uint8Array from the zip.
function getTextFiles(files, opfPath, metadata) {
    // manifest hrefs are relative to the folder the OPF sits in
    const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

    const manifestById = new Map();
    for (const item of metadata.items) {
        manifestById.set(item.getAttribute("id"), item);
    }

    const textFiles = [];
    for (const idref of metadata.spine) {
        const item = manifestById.get(idref);
        if (!item) continue;

        const mediaType = item.getAttribute("media-type");
        if (mediaType !== "application/xhtml+xml" && mediaType !== "text/html") continue;

        const path = resolvePath(opfDir, decodeURIComponent(item.getAttribute("href")));
        const bytes = files[path];
        if (!bytes) {
            console.warn(`Spine item "${idref}" points to missing file: ${path}`);
            continue;
        }

        textFiles.push({ id: idref, path, bytes });
    }
    return textFiles;
}

// Joins a base folder and a relative href, collapsing "." and ".." segments
function resolvePath(baseDir, href) {
    const parts = (baseDir + href).split("/");
    const out = [];
    for (const part of parts) {
        if (part === "..") out.pop();
        else if (part !== "." && part !== "") out.push(part);
    }
    return out.join("/");
}

function getOpfFromContainer(bytes) {
    const dcContainer = utf8decoder.decode(bytes)
    const docContainer = new DOMParser().parseFromString(dcContainer, "application/xml");
    const opfPath = docContainer.querySelector("rootfile").getAttribute("full-path");
    return opfPath
}

function getMetadata(path) {
    const opfText = utf8decoder.decode(path);
    const opfDoc = new DOMParser().parseFromString(opfText, "application/xml");
    console.log(path, opfDoc);

    const title = opfDoc.querySelector("metadata > *|title")?.textContent;
    const manifestItems = opfDoc.querySelectorAll("manifest > item");
    const spine = [...opfDoc.querySelectorAll("spine > itemref")].map(i => i.getAttribute("idref"));

    let metadata = new Object()
    metadata.title = title
    metadata.items = manifestItems
    metadata.spine = spine

    console.log(metadata)
    return(metadata)

}
