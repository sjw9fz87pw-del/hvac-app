/**
 * How many bytes does one of our tags actually need?
 *
 * The answer decides which NFC chip to buy, and buying the wrong one is
 * expensive at 50 tags per restaurant. This measures a real minted token rather
 * than estimating, and prints the margin against each candidate chip.
 *
 *   npx tsx scripts/ndef-size.ts [baseUrl]
 */
import { mintTagToken, buildTagUrl } from "@pmops/nfc-core";

/** NDEF URI identifier codes strip a common prefix to save bytes on the chip. */
const URI_PREFIXES: [number, string][] = [
  [0x04, "https://"], [0x03, "http://"], [0x02, "https://www."], [0x01, "http://www."],
];

/** NDEF user-memory capacity in bytes, per NXP datasheets. */
const CHIPS = [
  { name: "NTAG210", ndefBytes: 48 },
  { name: "NTAG212", ndefBytes: 128 },
  { name: "NTAG213", ndefBytes: 144 },
  { name: "NTAG215", ndefBytes: 504 },
  { name: "NTAG216", ndefBytes: 888 },
];

function ndefSize(url: string): { total: number; prefix: string; remainder: string } {
  const match = URI_PREFIXES
    .filter(([, prefix]) => url.startsWith(prefix))
    .sort((a, b) => b[1].length - a[1].length)[0];
  const prefix = match?.[1] ?? "";
  const remainder = url.slice(prefix.length);
  const bytes = Buffer.byteLength(remainder, "utf8");

  // NDEF record: header + type-length + payload-length + type('U') + URI code + URI
  const record = 4 + 1 + bytes;
  // NDEF TLV on the tag: 0x03, length, <record>, 0xFE terminator
  const total = record + 3;
  return { total, prefix: prefix || "(none)", remainder };
}

const baseUrl = process.argv[2] ?? process.env.APP_BASE_URL ?? "https://care.example.com";
const secret = process.env.NFC_TAG_SECRET ?? "measurement-only-secret-thirty-two-chars!";
const token = mintTagToken(secret, { tenantId: "measurement-tenant" });
const url = buildTagUrl(baseUrl, token.payload);
const { total, prefix, remainder } = ndefSize(url);

console.log(`\nBase URL      ${baseUrl}`);
console.log(`Token payload ${token.payload}  (${token.payload.length} chars)`);
console.log(`Tag URL       ${url}`);
console.log(`NDEF prefix   ${prefix}  → ${Buffer.byteLength(remainder)} bytes stored`);
console.log(`\nNDEF message on chip: ${total} bytes\n`);

for (const chip of CHIPS) {
  const fits = total <= chip.ndefBytes;
  const headroom = chip.ndefBytes - total;
  console.log(
    `  ${fits ? "✓" : "✗"} ${chip.name.padEnd(9)} ${String(chip.ndefBytes).padStart(3)} bytes` +
    `  ${fits ? `${headroom} spare (${Math.round((total / chip.ndefBytes) * 100)}% used)` : `${-headroom} bytes short`}`,
  );
}

// The host name is the only part of the URL we control the length of, so show
// how much room a longer domain would eat.
console.log("\nHeadroom by host length (NTAG213, 144 bytes):");
for (const host of ["care.co", "care.clearline.com", "equipment.clearlinecare.example.com"]) {
  const size = ndefSize(`https://${host}/t/${token.payload}`).total;
  console.log(`  ${host.padEnd(36)} ${String(size).padStart(3)} bytes  →  ${144 - size} spare`);
}
console.log();
