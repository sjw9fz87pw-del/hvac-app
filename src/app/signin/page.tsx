import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth/session";
import { homeFor } from "@/lib/auth/routing";
import { SignInForm } from "./form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await currentActor();
  const { next } = await searchParams;
  if (actor) redirect(next || homeFor(actor));
  return <SignInForm next={next ?? null} />;
}
