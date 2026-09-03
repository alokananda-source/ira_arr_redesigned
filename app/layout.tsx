import type { Metadata } from "next";

import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "IRA ARR/MRR Dashboard",
  description: "Live revenue dashboard for Rumik Ira, sourced from the IRA ARR Google Sheet.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
