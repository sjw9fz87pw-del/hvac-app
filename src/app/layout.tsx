import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import { NavProgress } from "@/components/ui/nav-progress";

export const metadata: Metadata = {
  title: "Axios Equipment Care",
  description: "People. Equipment. A stronger tomorrow. Preventive maintenance, equipment records and proof of service for restaurants.",
  applicationName: "Axios Equipment Care",
  appleWebApp: { title: "Axios" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The keyboard shrinks the content instead of sliding a fixed layout around.
  interactiveWidget: "resizes-content",
  // The app is light whatever the phone's setting, so the browser bars match it.
  themeColor: "#ffffff",
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
