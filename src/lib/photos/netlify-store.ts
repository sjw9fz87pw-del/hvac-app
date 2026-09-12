/**
 * Netlify Blobs implementation of the BlobStore port.
 *
 * Serverless filesystems are ephemeral: a photo written to local disk survives
 * only until that function instance is recycled, so on Netlify the local store
 * would silently lose every piece of service proof. Blobs is durable object
 * storage with the same lifetime as the project.
 *
 * Production writes to a global store; anything else writes to a deploy-scoped
 * store, so preview and test photos never land in the production bucket.
 */
import { createHash, randomUUID } from "node:crypto";
import type { BlobStore, StoredBlob } from "./storage";

const STORE_NAME = "equipment-photos";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 12 * 1024 * 1024;

function extensionFor(contentType: string): string {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[contentType] ?? "bin";
}

/** Keys are generated server-side; a key arriving from a client is never trusted. */
function isSafeKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]+$/i.test(key) && !key.includes("..");
}

async function store() {
  const { getStore, getDeployStore } = await import("@netlify/blobs");
  const isProduction = process.env.CONTEXT === "production";
  return isProduction
    ? getStore({ name: STORE_NAME, consistency: "strong" })
    : getDeployStore({ name: STORE_NAME, consistency: "strong" });
}

export class NetlifyBlobStore implements BlobStore {
  async put(data: Buffer, opts: { contentType: string; prefix?: string }): Promise<StoredBlob> {
    if (!ALLOWED_TYPES.has(opts.contentType)) throw new Error(`Unsupported content type ${opts.contentType}`);
    if (data.byteLength > MAX_BYTES) throw new Error("File is too large");

    const prefix = (opts.prefix ?? "misc").replace(/[^a-z0-9-]/gi, "");
    const key = `${prefix}/${randomUUID()}.${extensionFor(opts.contentType)}`;

    // The content type travels as metadata so reads can serve it back correctly.
    await (await store()).set(key, new Uint8Array(data).buffer as ArrayBuffer, {
      metadata: { contentType: opts.contentType, bytes: data.byteLength },
    });

    return {
      key,
      bytes: data.byteLength,
      contentType: opts.contentType,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  }

  async get(key: string) {
    if (!isSafeKey(key)) return null;
    const result = await (await store()).getWithMetadata(key, { type: "arrayBuffer" });
    if (!result?.data) return null;
    return {
      data: Buffer.from(result.data as ArrayBuffer),
      contentType: String((result.metadata as { contentType?: string })?.contentType ?? "application/octet-stream"),
    };
  }

  async exists(key: string) {
    if (!isSafeKey(key)) return false;
    return (await (await store()).getMetadata(key)) !== null;
  }
}
