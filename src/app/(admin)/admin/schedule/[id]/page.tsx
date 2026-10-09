import { VisitView } from "@/components/visit/visit-view";

/** The office's view of a visit: the same visit, inside the admin area, with its controls. */
export default async function AdminVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VisitView id={id} manage />;
}
