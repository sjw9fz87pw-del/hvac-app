/**
 * Photos on Netlify: always the site-wide store, and photos left in old
 * deploys' stores (before the Nov 2, 2026 fix) found and moved across.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Entry = { data: ArrayBuffer; metadata: Record<string, unknown> };
const stores = new Map<string, Map<string, Entry>>();
const lookups: string[] = [];

function fakeStore(name: string) {
  if (!stores.has(name)) stores.set(name, new Map());
  const blobs = stores.get(name)!;
  return {
    async set(key: string, data: ArrayBuffer, opts: { metadata?: Record<string, unknown> } = {}) {
      blobs.set(key, { data, metadata: opts.metadata ?? {} });
    },
    async getWithMetadata(key: string) {
      lookups.push(`${name}:${key}`);
      const entry = blobs.get(key);
      return entry ? { data: entry.data, metadata: entry.metadata } : null;
    },
    async getMetadata(key: string) {
      const entry = blobs.get(key);
      return entry ? { metadata: entry.metadata } : null;
    },
  };
}

vi.mock("@netlify/blobs", () => ({
  getStore: ({ name }: { name: string }) => fakeStore(`site:${name}`),
  getDeployStore: ({ name, deployID }: { name: string; deployID?: string }) => fakeStore(`deploy:${deployID ?? "current"}:${name}`),
}));

const { NetlifyBlobStore } = await import("@/lib/photos/netlify-store");
const { LEGACY_DEPLOY_IDS } = await import("@/lib/photos/legacy-deploys");

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

beforeEach(() => {
  stores.clear();
  lookups.length = 0;
});

describe("photo storage on Netlify", () => {
  it("saves new photos to the site-wide store, never a deploy's own", async () => {
    const saved = await new NetlifyBlobStore().put(Buffer.from("jpeg"), { contentType: "image/jpeg", prefix: "equipment" });
    expect(stores.get("site:equipment-photos")?.has(saved.key)).toBe(true);
    expect([...stores.keys()].some((name) => name.startsWith("deploy:"))).toBe(false);
  });

  it("finds a photo left in an old deploy's store and moves it across", async () => {
    const key = "equipment/0c7d180c-2534-49ed-a1ed-05f2dd3aee79.jpg";
    await fakeStore(`deploy:${LEGACY_DEPLOY_IDS[5]}:equipment-photos`).set(key, bytes("old photo"), { metadata: { contentType: "image/jpeg" } });

    const store = new NetlifyBlobStore();
    const first = await store.get(key);
    expect(first?.data.toString()).toBe("old photo");
    expect(first?.contentType).toBe("image/jpeg");
    // Now in the site-wide store, so the next view is an ordinary read.
    expect(stores.get("site:equipment-photos")?.has(key)).toBe(true);

    lookups.length = 0;
    expect((await store.get(key))?.data.toString()).toBe("old photo");
    expect(lookups).toEqual([`site:equipment-photos:${key}`]);
  });

  it("does not search the old deploys again for a photo that is nowhere", async () => {
    const key = "equipment/a651e28f-c8f9-41ff-9dd5-d82de1eef577.jpg";
    const store = new NetlifyBlobStore();
    expect(await store.get(key)).toBeNull();
    const searched = lookups.length;
    expect(searched).toBe(1 + LEGACY_DEPLOY_IDS.length);

    lookups.length = 0;
    expect(await store.get(key)).toBeNull();
    expect(lookups).toEqual([`site:equipment-photos:${key}`]);
  });

  it("never looks up a key that could escape its folder", async () => {
    expect(await new NetlifyBlobStore().get("../secrets.jpg")).toBeNull();
    expect(lookups).toEqual([]);
  });
});
