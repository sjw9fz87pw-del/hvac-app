import { redirect } from "next/navigation";

/**
 * A tag tapped with no open task still has to land somewhere useful: the
 * Equipment Passport, which internal staff see with the internal-notes block.
 */
export default async function TechEquipmentRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/equipment/${id}`);
}
