import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homelab Backups",
  description:
    "Schedule and monitor incremental rdiff-backup jobs for your homelab.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
