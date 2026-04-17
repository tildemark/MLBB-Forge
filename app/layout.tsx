import type { Metadata } from "next";
import { Inter, Cinzel } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "MLBB Forge – Min-Max Sandbox",
  description:
    "A professional-grade MLBB theorycrafting tool. Simulate hero builds, compare Effective HP vs DPS, and discover item synergies.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://forge.sanchez.ph"
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${cinzel.variable} antialiased`}>{children}</body>
    </html>
  );
}
