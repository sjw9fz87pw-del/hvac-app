"use client";

import { Button } from "@/components/ui/primitives";

export function SignOutButton() {
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await fetch("/api/v1/auth/logout", { method: "POST" });
        window.location.href = "/signin";
      }}
    >
      Sign out
    </Button>
  );
}
