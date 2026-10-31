/**
 * The units either side of one, in the same area, for the previous / next bar.
 *
 * Ordered the way the restaurant lists them (Refrigerator 2 before 10), and
 * labelled without the area in front, so "Kitchen Refrigerator 3" in the
 * Kitchen is "Refrigerator 3": the part that tells units apart is what fits.
 */
export interface UnitNeighbours {
  prev: { id: string; name: string; label: string } | null;
  next: { id: string; name: string; label: string } | null;
  position: number;
  total: number;
}

export function unitNeighbours(
  siblings: { id: string; name: string }[],
  currentId: string,
  areaName: string | null,
): UnitNeighbours | null {
  const sorted = [...siblings].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const index = sorted.findIndex((s) => s.id === currentId);
  if (index < 0 || sorted.length < 2) return null;
  const prefix = areaName ? `${areaName} `.toLowerCase() : null;
  const label = (name: string) =>
    prefix && name.toLowerCase().startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : name;
  const at = (i: number) => (sorted[i] ? { ...sorted[i], label: label(sorted[i].name) } : null);
  return { prev: at(index - 1), next: at(index + 1), position: index + 1, total: sorted.length };
}
