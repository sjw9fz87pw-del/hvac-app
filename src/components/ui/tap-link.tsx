"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * The app's link: it starts loading the next page the moment a finger
 * touches it, instead of in the background as it scrolls into view.
 *
 * Two reasons. Long lists would otherwise be hundreds of background requests.
 * And a background fetch that gets cut off when you move on quickly (as they
 * do) could leave a later tap on that link hanging until something else
 * redrew the screen: up to 12 seconds, measured. A fetch started by the touch
 * itself never hung. The gap between touching and lifting is a tenth of a
 * second or more, and this spends it fetching.
 *
 * The bottom tabs are the one exception: there are five of them, so they are
 * fetched in full ahead of time (see nav.tsx).
 */
export function TapLink({ href, onPointerDown, ...rest }: Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string }) {
  const router = useRouter();
  return (
    <Link
      {...rest}
      href={href}
      prefetch={false}
      onPointerDown={(event) => {
        router.prefetch(href);
        onPointerDown?.(event);
      }}
    />
  );
}
