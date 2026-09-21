"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SectionTitle } from "@/components/ui/primitives";
import { ConditionPicker } from "@/components/ui/condition-picker";
import { conditionCopy, type Condition } from "@/components/ui/condition";

export function EditCondition({ equipmentId, condition, canEdit }: {
  equipmentId: string;
  condition: Condition;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Condition>(condition);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(next: Condition) {
    setValue(next);
    setBusy(true);
    setError(null);
    setSaved(false);
    const response = await fetch(`/api/v1/equipment/${equipmentId}/condition`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ condition: next }),
    });
    setBusy(false);
    if (!response.ok) {
      setValue(condition);
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "That did not save");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  const copy = conditionCopy(value);

  return (
    <>
      <SectionTitle>Condition</SectionTitle>
      <Card>
        {canEdit ? (
          <>
            <ConditionPicker value={value} onChange={save} disabled={busy} />
            <p style={{ color: "var(--ink-faint)", fontSize: 12.5, marginTop: 10, lineHeight: 1.5 }}>
              {copy.hint}. Saved as soon as you tap — the previous value is kept in the
              audit trail, so how a unit has changed over time stays readable.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 14.5 }}>{copy.label} — {copy.hint}</p>
        )}

        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, marginTop: 8 }} role="alert">{error}</p> : null}
        {saved && !error ? <p style={{ color: "var(--good)", fontSize: 13.5, marginTop: 8 }}>Saved</p> : null}
      </Card>
    </>
  );
}
