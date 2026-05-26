import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SageLab",
  description: "Research lab agent interface",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
