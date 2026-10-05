import { describe, expect, it } from "vitest";
import { createHttpTagApi } from "../src";

interface Call { url: string; method?: string; headers: Record<string, string>; body: unknown }

function fakeFetch(respond: (url: string) => { status?: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const { status = 200, body = {} } = respond(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetch };
}

describe("HTTP tag API", () => {
  it("mints through the mint endpoint and returns the URL to write", async () => {
    const { calls, fetch } = fakeFetch(() => ({ status: 201, body: { tagId: "t1", url: "https://a/t/p", payload: "p" } }));
    const api = createHttpTagApi({ fetch, baseUrl: "https://a/" });

    await expect(api.mint("org_1")).resolves.toEqual({ tagId: "t1", url: "https://a/t/p" });
    expect(calls[0]).toMatchObject({ url: "https://a/api/v1/tags/mint", method: "POST", body: { organizationId: "org_1" } });
    expect(calls[0].headers["content-type"]).toBe("application/json");
  });

  it("surfaces the server's own error message", async () => {
    const { fetch } = fakeFetch(() => ({ status: 403, body: { error: "You cannot tag for this customer" } }));
    await expect(createHttpTagApi({ fetch }).mint("org_1")).rejects.toThrow("You cannot tag for this customer");
  });

  it("falls back to a plain message when the server says nothing useful", async () => {
    const fetch = async () => new Response("<html>502</html>", { status: 502 });
    await expect(createHttpTagApi({ fetch }).pair("t1", "u1")).rejects.toThrow("Pairing failed");
  });

  it("verifies with the read-back payload", async () => {
    const { calls, fetch } = fakeFetch(() => ({ body: { verified: true } }));
    await expect(createHttpTagApi({ fetch }).verify("t1", "v1.a.b.c")).resolves.toEqual({ verified: true, reason: undefined });
    expect(calls[0]).toMatchObject({ url: "/api/v1/tags/verify", body: { tagId: "t1", readBackPayload: "v1.a.b.c" } });
  });

  it("treats a refused verify request as not verified", async () => {
    const { fetch } = fakeFetch(() => ({ status: 404, body: { error: "Tag not found" } }));
    await expect(createHttpTagApi({ fetch }).verify("t1", "v1.a.b.c")).resolves.toEqual({ verified: false, reason: "Tag not found" });
  });

  it("reports a write failure through the verify endpoint, which records it", async () => {
    const { calls, fetch } = fakeFetch(() => ({ body: { verified: false } }));
    await createHttpTagApi({ fetch }).reportWriteFailure("t1", "x".repeat(900));
    expect(calls[0].url).toBe("/api/v1/tags/verify");
    expect((calls[0].body as { writeError: string }).writeError).toHaveLength(500);
  });

  it("pairs with an idempotency key, so a retried tap cannot pair twice", async () => {
    const { calls, fetch } = fakeFetch(() => ({ body: {} }));
    await createHttpTagApi({ fetch, newIdempotencyKey: () => "key-1" }).pair("t1", "unit_9");
    expect(calls[0]).toMatchObject({
      url: "/api/v1/tags/pair",
      body: { tagId: "t1", equipmentId: "unit_9", verified: true },
      headers: { "idempotency-key": "key-1" },
    });
  });

  it("replaces with the reason for the audit log", async () => {
    const { calls, fetch } = fakeFetch(() => ({ body: {} }));
    await createHttpTagApi({ fetch }).replace("unit_9", "t2", "Cracked");
    expect(calls[0]).toMatchObject({
      url: "/api/v1/tags/replace",
      body: { equipmentId: "unit_9", newTagId: "t2", reason: "Cracked", verified: true },
    });
  });

  it("records a lock either way", async () => {
    const { calls, fetch } = fakeFetch(() => ({ body: {} }));
    const api = createHttpTagApi({ fetch });
    await api.recordLock("t1", { locked: true });
    await api.recordLock("t1", { locked: false, reason: "No makeReadOnly", unsupported: true });
    expect(calls.map((c) => c.body)).toEqual([
      { tagId: "t1", locked: true, reason: null, unsupported: false },
      { tagId: "t1", locked: false, reason: "No makeReadOnly", unsupported: true },
    ]);
  });
});
