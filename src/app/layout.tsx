import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavProgress } from "@/components/ui/nav-progress";

export const metadata: Metadata = {
  title: "Equipment Care",
  description: "Preventive maintenance, equipment records and proof of service for restaurants.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The keyboard shrinks the content instead of sliding a fixed layout around.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={null}><NavProgress /></Suspense>
        {children}
      </body>
    </html>
  );
}
