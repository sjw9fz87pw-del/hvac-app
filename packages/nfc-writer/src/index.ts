/**
 * @pmops/nfc-writer
 *
 * Everything involved in physically putting a tag on a unit: talking to the
 * phone's NFC radio, explaining why a phone cannot, and running the
 * mint → write → read back → verify → link → lock sequence in the one order
 * that is safe. No React, no Next.js, no database. The radio comes in through
 * `TagWriter` and the server through `TagApi`, so the whole thing can be tested
 * with fakes, and a native iPhone writer can be added later without touching
 * the flow.
 */
export * from "./writer";
export * from "./blocker";
export * from "./web-nfc";
export * from "./desk-reader";
export * from "./tag-api";
export * from "./pair";
