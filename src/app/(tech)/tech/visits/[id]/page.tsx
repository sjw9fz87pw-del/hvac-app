import { VisitView } from "@/components/visit/visit-view";

export default async function TechVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VisitView id={id} />;
}
