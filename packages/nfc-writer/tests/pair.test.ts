import { describe, expect, it } from "vitest";
import { pairTagToUnit, replaceUnitTag, payloadFromReadBack, pairPhaseLabel, type PairPhase } from "../src";
import { fakeApi, fakeWriter, BASE, type Log } from "./fakes";

const ORG = "org_1";
const UNIT = "unit_42";

function setup(writerOpts = {}, apiOpts = {}) {
  const log: Log = [];
  return { log, writer: fakeWriter(log, writerOpts), api: fakeApi(log, apiOpts) };
}

describe("pairing a tag to an existing unit", () => {
  it("mints, writes, reads back, verifies, links, then locks, in that order", async () => {
    const { log, writer, api } = setup();
    const outcome = await pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api });

    expect(outcome).toEqual({ tagId: "tag_1", lockNote: null });
    expect(log).toEqual([
      `server:mint ${ORG}`,
      `radio:write ${BASE}/t/v1.hint.token1.mac`,
      "radio:read",
      "server:verify tag_1",
      `server:pair tag_1 -> ${UNIT}`,
      "radio:lock",
      "server:record-lock tag_1 locked",
    ]);
  });

  it("sends the server only the payload part of what was read back", async () => {
    const { writer, api } = setup();
    await pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: false, writer, api });
    expect(api.verifiedPayloads).toEqual(["v1.hint.token1.mac"]);
  });

  it("reports each phase once, in order", async () => {
    const { writer, api } = setup();
    const phases: PairPhase[] = [];
    await pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api, onPhase: (p) => phases.push(p) });
    expect(phases).toEqual(["minting", "writing", "verifying", "pairing", "locking"]);
    for (const p of phases) expect(pairPhaseLabel(p)).not.toBe("");
  });

  it("never locks when locking was not asked for", async () => {
    const { log, writer, api } = setup();
    await pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: false, writer, api });
    expect(log).not.toContain("radio:lock");
    expect(api.locks).toEqual([]);
  });

  it("refuses without a unit, before anything is minted", async () => {
    const { log, writer, api } = setup();
    await expect(pairTagToUnit({ organizationId: ORG, unitId: "", lock: true, writer, api }))
      .rejects.toThrow(/unit that already exists/);
    expect(log).toEqual([]);
  });

  it("does not mint a tag on a device that cannot write one", async () => {
    const { log, writer, api } = setup({ supported: false, blocker: "ios" });
    await expect(pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api }))
      .rejects.toThrow(/cannot write NFC/);
    expect(log).toEqual([]);
  });

  it("links nothing and records the failure when the write fails", async () => {
    const { log, writer, api } = setup({ writeFails: "Tag moved away" });
    await expect(pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api }))
      .rejects.toThrow("Tag moved away");

    expect(api.writeFailures).toEqual([{ tagId: "tag_1", error: "Tag moved away" }]);
    expect(log.some((l) => l.startsWith("server:pair"))).toBe(false);
    expect(log).not.toContain("radio:lock");
  });

  it("links nothing and records the failure when the read-back fails", async () => {
    const { log, writer, api } = setup({ readFails: "No tag detected" });
    await expect(pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api }))
      .rejects.toThrow("No tag detected");

    expect(api.writeFailures[0].error).toMatch(/Read-back failed: No tag detected/);
    expect(log.some((l) => l.startsWith("server:pair"))).toBe(false);
  });

  it("links nothing when the read-back does not verify", async () => {
    const { log, writer, api } = setup(
      { readBack: () => `${BASE}/t/v1.hint.someOtherTag.mac` },
      { verifyFails: "Read-back did not match" },
    );
    await expect(pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api }))
      .rejects.toThrow("Read-back did not match");

    expect(log.some((l) => l.startsWith("server:pair"))).toBe(false);
    expect(log).not.toContain("radio:lock");
  });

  it("never locks a tag whose link was refused, so it can be written again", async () => {
    const { log, writer, api } = setup({}, { pairFails: "Unit already has a tag" });
    await expect(pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api }))
      .rejects.toThrow("Unit already has a tag");
    expect(log).not.toContain("radio:lock");
  });

  it("keeps the link when locking fails, and says why", async () => {
    const { writer, api } = setup({ lockOutcome: { locked: false, reason: "Tag moved away before locking finished" } });
    const outcome = await pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api });

    expect(outcome.lockNote).toBe("Tag moved away before locking finished");
    expect(api.locks).toEqual([{ tagId: "tag_1", outcome: { locked: false, reason: "Tag moved away before locking finished" } }]);
  });

  it("records a device that cannot lock as unsupported, not as a failure to pair", async () => {
    const reason = "This browser cannot lock tags. The tag works, but can still be rewritten.";
    const { writer, api } = setup({ canLock: false, lockOutcome: { locked: false, unsupported: true, reason } });
    const outcome = await pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api });

    expect(outcome).toEqual({ tagId: "tag_1", lockNote: reason });
    expect(api.locks[0].outcome).toMatchObject({ unsupported: true });
  });

  it("still succeeds when the lock cannot be recorded on the server", async () => {
    const { writer, api } = setup({}, { recordLockFails: true });
    await expect(pairTagToUnit({ organizationId: ORG, unitId: UNIT, lock: true, writer, api }))
      .resolves.toEqual({ tagId: "tag_1", lockNote: null });
  });
});

describe("replacing a unit's tag", () => {
  it("verifies the new tag before the old one is replaced, then locks", async () => {
    const { log, writer, api } = setup();
    const outcome = await replaceUnitTag({
      organizationId: ORG, unitId: UNIT, reason: "Cracked", lock: true, writer, api,
    });

    expect(outcome).toEqual({ tagId: "tag_1", lockNote: null });
    expect(log).toEqual([
      `server:mint ${ORG}`,
      `radio:write ${BASE}/t/v1.hint.token1.mac`,
      "radio:read",
      "server:verify tag_1",
      `server:replace ${UNIT} with tag_1 (Cracked)`,
      "radio:lock",
      "server:record-lock tag_1 locked",
    ]);
  });

  it("leaves the old tag alone when the new one does not verify", async () => {
    const { log, writer, api } = setup({}, { verifyFails: "Read-back did not match" });
    await expect(replaceUnitTag({ organizationId: ORG, unitId: UNIT, reason: "Cracked", lock: true, writer, api }))
      .rejects.toThrow("Read-back did not match");
    expect(log.some((l) => l.startsWith("server:replace"))).toBe(false);
  });

  it("gives a default reason so the audit log is never blank", async () => {
    const { log, writer, api } = setup();
    await replaceUnitTag({ organizationId: ORG, unitId: UNIT, reason: "", lock: false, writer, api });
    expect(log).toContain(`server:replace ${UNIT} with tag_1 (Tag replaced)`);
  });
});

describe("payloadFromReadBack", () => {
  it.each([
    [`${BASE}/t/v1.abc.def.ghi`, "v1.abc.def.ghi"],
    [`${BASE}/t/v1.abc.def.ghi/`, "v1.abc.def.ghi"],
    [`  ${BASE}/t/v1.abc.def.ghi  `, "v1.abc.def.ghi"],
    ["v1.abc.def.ghi", "v1.abc.def.ghi"],
    ["app.example.com/t/v1.abc.def.ghi", "v1.abc.def.ghi"],
  ])("%s -> %s", (input, expected) => {
    expect(payloadFromReadBack(input)).toBe(expected);
  });
});
