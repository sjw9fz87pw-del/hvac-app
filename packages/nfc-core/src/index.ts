/**
 * @pmops/nfc-core
 *
 * Framework-free NFC tag identity, lifecycle, resolution and QR fallback.
 * Depends on nothing but the Node standard library: no web framework, no ORM,
 * no HTTP layer. The host application supplies persistence and auditing through
 * the ports in `./ports`, which is what allows this same package to back a
 * different service without modification.
 */
export * from "./token";
export * from "./lifecycle";
export * from "./encoding";
export * from "./ports";
export * from "./resolve";
