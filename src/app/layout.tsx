import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Offcut — offline video editor",
  description: "Offcut is a free, browser-based video editor that works offline. Your files never leave your computer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* browser extensions (e.g. ColorZilla) inject attributes into <body> before React hydrates */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
