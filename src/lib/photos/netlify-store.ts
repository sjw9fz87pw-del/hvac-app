/**
 * Netlify Blobs implementation of the BlobStore port.
 *
 * Serverless filesystems are ephemeral: a photo written to local disk survives
 * only until that function instance is recycled, so on Netlify the local store
 * would silently lose every piece of service proof. Blobs is durable object
 * storage with the same lifetime as the project.
 *
 * Every photo goes to one site-wide store. It used to go there only when
 * `CONTEXT` read "production", with a deploy-scoped store otherwise; but
 * `CONTEXT` is set while the site builds, not while it runs, so on the live
 * site every photo went into the store of the deploy that took it, and the
 * next deploy hid it. Photos from that time are found and moved across on
 * first view (see `recover`). There are no preview deploys to keep apart: all
 * deploys are production, on the production database.
 */
import { createHash, randomUUID } from "node:crypto";
import type { BlobStore, StoredBlob } from "./storage";
import { LEGACY_DEPLOY_IDS } from "./legacy-deploys";

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
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: STORE_NAME, consistency: "strong" });
}

type Found = { data: ArrayBuffer; metadata: Record<string, unknown> };

/** Keys already looked for in the old deploy stores and not there, so a broken photo costs one search, not one per view. */
const notInOldDeploys = new Map<string, number>();
const SEARCH_AGAIN_AFTER_MS = 10 * 60_000;

/**
 * A photo taken before the fix: look for it in the stores of earlier deploys
 * and copy it to the site-wide store, so every later view is an ordinary read.
 * The original copy is left where it is.
 */
async function recover(key: string): Promise<Found | null> {
  const searched = notInOldDeploys.get(key);
  if (searched && Date.now() - searched < SEARCH_AGAIN_AFTER_MS) return null;

  const { getDeployStore } = await import("@netlify/blobs");
  const results = await Promise.all(LEGACY_DEPLOY_IDS.map(async (deployID) => {
    try {
      const found = await getDeployStore({ name: STORE_NAME, deployID, consistency: "strong" })
        .getWithMetadata(key, { type: "arrayBuffer" });
      return found?.data ? { data: found.data as ArrayBuffer, metadata: found.metadata ?? {} } : null;
    } catch {
      return null;
    }
  }));
  // Newest first, in case the same key was ever written twice.
  const found = results.find((r): r is Found => r !== null) ?? null;
  if (!found) {
    notInOldDeploys.set(key, Date.now());
    return null;
  }
  await (await store()).set(key, found.data, { metadata: found.metadata });
  return found;
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
    const found = result?.data ? { data: result.data as ArrayBuffer, metadata: result.metadata ?? {} } : await recover(key);
    if (!found) return null;
    return {
      data: Buffer.from(found.data),
      contentType: String((found.metadata as { contentType?: string }).contentType ?? "application/octet-stream"),
    };
  }

  async exists(key: string) {
    if (!isSafeKey(key)) return false;
    if ((await (await store()).getMetadata(key)) !== null) return true;
    return (await recover(key)) !== null;
  }
}
