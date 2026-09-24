"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Pill } from "@/components/ui/primitives";
import { blockerMessage, pairTagToUnit, pairPhaseLabel, type NfcBlocker, type PairPhase } from "@pmops/nfc-writer";
import { tagApi, tagWriter } from "@/lib/nfc/writer";
import { PrepareTag } from "./prepare-tag";

/**
 * Pair a blank tag to a unit that already exists.
 *
 * Rapid inventory tags a unit as it is created; everything inventoried before
 * the tags arrived had no way to get one, which is most of a real restaurant.
 *
 * Writing a chip from a browser is Chrome-on-Android only — no iOS browser can
 * write NFC at all. Rather than show a button that cannot work on the phone
 * looking at it, an iPhone is told plainly what to do instead.
 */
export function PairTag({ equipmentId, organizationId, unitName }: {
  equipmentId: string;
  organizationId: string;
  unitName: string;
}) {
  const router = useRouter();
  const [capable, setCapable] = useState<boolean | null>(null);
  const [blocker, setBlocker] = useState<NfcBlocker>(null);
  const [phase, setPhase] = useState<PairPhase | null>(null);
  const [lock, setLock] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockNote, setLockNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Detected after mount: the server cannot know what the phone can do.
  useEffect(() => {
    const writer = tagWriter();
    setCapable(writer.isSupported());
    setBlocker(writer.blocker());
  }, []);

  async function pair() {
    setError(null);
    setLockNote(null);
    try {
      const outcome = await pairTagToUnit({
        organizationId, unitId: equipmentId, lock, writer: tagWriter(), api: tagApi, onPhase: setPhase,
      });
      setLockNote(outcome.lockNote);
      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pairing failed");
    } finally {
      setPhase(null);
    }
  }

  if (done) {
    return (
      <div style={{ marginTop: 10 }}>
        <Pill tone="good">Tag paired</Pill>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8 }}>
          Tapping it now opens {unitName}. {lockNote ? `The tag could not be locked: ${lockNote}` : null}
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <Pill tone="warn">No tag paired</Pill>

      {capable === false ? (
        <>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.5 }}>
            {blockerMessage(blocker)}
          </p>
          {blocker === "ios" ? <PrepareTag equipmentId={equipmentId} organizationId={organizationId} /> : null}
        </>
      ) : (
        <>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 8, lineHeight: 1.5 }}>
            Hold a blank tag against the back of the phone. It gets written,
            checked by reading it back, and only then linked to this unit.
          </p>

          <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10, fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} style={{ width: 18, height: 18 }} />
            <span>Lock the tag so it cannot be rewritten <span style={{ color: "var(--ink-faint)" }}>— permanent</span></span>
          </label>

          <div style={{ marginTop: 12, maxWidth: 210 }}>
            <Button onClick={pair} disabled={phase !== null || capable === null}>
              {phase ? pairPhaseLabel(phase) : "Pair a tag"}
            </Button>
          </div>
        </>
      )}

      {error ? (
        <div style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 10 }}>
          {error}
          <div style={{ color: "var(--ink-faint)", marginTop: 4 }}>
            Nothing was linked — the unit is unchanged. Try again with the tag flat against the phone.
          </div>
        </div>
      ) : null}
    </div>
  );
}
