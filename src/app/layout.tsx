import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Forma · Workspace", template: "%s · Forma" },
  description: "The workspace for your education business.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
