/**
 * Blob storage behind a port.
 *
 * Local disk today. Swapping in S3/R2 later means implementing `BlobStore` and
 * changing one factory - nothing that stores a photo knows where photos live.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";

export interface StoredBlob {
  key: string;
  bytes: number;
  contentType: string;
  sha256: string;
}

export interface BlobStore {
  put(data: Buffer, opts: { contentType: string; prefix?: string }): Promise<StoredBlob>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
  exists(key: string): Promise<boolean>;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 12 * 1024 * 1024;

/** Keys are generated server-side; a key from a client is never trusted as a path. */
function safeKeyToPath(root: string, key: string): string | null {
  if (!/^[a-z0-9/_-]+\.[a-z0-9]+$/i.test(key)) return null;
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) return null;
  return resolved;
}

function extensionFor(contentType: string): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[contentType] ?? "bin";
}

export class LocalBlobStore implements BlobStore {
  constructor(private root: string) {}

  async put(data: Buffer, opts: { contentType: string; prefix?: string }): Promise<StoredBlob> {
    if (!ALLOWED_TYPES.has(opts.contentType)) throw new Error(`Unsupported content type ${opts.contentType}`);
    if (data.byteLength > MAX_BYTES) throw new Error("File is too large");

    const prefix = (opts.prefix ?? "misc").replace(/[^a-z0-9-]/gi, "");
    const key = `${prefix}/${randomUUID()}.${extensionFor(opts.contentType)}`;
    const target = safeKeyToPath(this.root, key);
    if (!target) throw new Error("Invalid blob key");

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    await writeFile(`${target}.type`, opts.contentType, "utf8");

    return {
      key, bytes: data.byteLength, contentType: opts.contentType,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  }

  async get(key: string) {
    const target = safeKeyToPath(this.root, key);
    if (!target) return null;
    try {
      const [data, contentType] = await Promise.all([
        readFile(target),
        readFile(`${target}.type`, "utf8").catch(() => "application/octet-stream"),
      ]);
      return { data, contentType: contentType.trim() };
    } catch {
      return null;
    }
  }

  async exists(key: string) {
    const target = safeKeyToPath(this.root, key);
    if (!target) return false;
    try { await stat(target); return true; } catch { return false; }
  }
}

let store: BlobStore | undefined;

/**
 * Local disk in development, Netlify Blobs when deployed.
 *
 * This is the whole reason storage sits behind a port: a serverless filesystem
 * is ephemeral, so the local implementation would silently lose service proof in
 * production. Swapping to S3/R2 later is another implementation of `BlobStore`,
 * not a refactor of anything that stores a photo.
 */
export function blobStore(): BlobStore {
  if (store) return store;

  const onNetlify = Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT);
  if (onNetlify) {
    // Required lazily so local runs and tests never load the Netlify SDK.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NetlifyBlobStore } = require("./netlify-store") as typeof import("./netlify-store");
    store = new NetlifyBlobStore();
  } else {
    store = new LocalBlobStore(process.env.BLOB_DIR ?? "./.data/blobs");
  }
  return store;
}
