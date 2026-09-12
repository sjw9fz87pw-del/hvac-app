import { redirect } from "next/navigation";

/** Command-center rows link by visit id; the visit view is the same for everyone. */
export default async function ScheduleVisitRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tech/visits/${id}`);
}
