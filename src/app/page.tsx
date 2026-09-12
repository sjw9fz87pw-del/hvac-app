import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/routing";

/** One entry point; the role decides which product you land in. */
export default async function RootPage() {
  const actor = await currentActor();
  if (!actor) redirect("/signin");
  redirect(homeFor(actor));
}
