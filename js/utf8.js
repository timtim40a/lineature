// UTF-8 helpers shared by the book and chunk code.
// A "character" here is one Unicode code point (an emoji counts as 1, like [...str].length).
// In UTF-8 every character starts with a byte that is NOT a continuation byte (10xxxxxx),
// so counting characters = counting non-continuation bytes.

export const utf8decoder = new TextDecoder(); // default 'utf-8'
export const utf8encoder = new TextEncoder();

export const isContinuationByte = (b) => (b & 0xC0) === 0x80;

export function countChars(bytes) {
    let n = 0;
    for (let i = 0; i < bytes.length; i++) {
        if (!isContinuationByte(bytes[i])) n++;
    }
    return n;
}
