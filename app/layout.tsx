import type { Metadata } from "next";
import { Inter, Cinzel } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "MLBB Forge – Min-Max Sandbox",
  description:
    "A professional-grade MLBB theorycrafting tool. Simulate hero builds, compare Effective HP vs DPS, and discover item synergies.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://forge.sanchez.ph"
  ),
  manifest: "/manifest.json",
  icons: [
    { rel: "icon", url: "/icon.svg" },
    { rel: "apple-touch-icon", url: "/icon-512.svg", sizes: "512x512" },
  ],
  openGraph: {
    title: "MLBB Forge – Min-Max Sandbox",
    description:
      "A professional-grade MLBB theorycrafting tool. Simulate hero builds, compare Effective HP vs DPS, and discover item synergies.",
    siteName: "MLBB Forge",
    type: "website",
    images: [
      {
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://forge.sanchez.ph"}/api/og?slug=default`,
        width: 1200,
        height: 630,
        alt: "MLBB Forge",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MLBB Forge – Min-Max Sandbox",
    description:
      "A professional-grade MLBB theorycrafting tool. Simulate hero builds, compare Effective HP vs DPS, and discover item synergies.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${cinzel.variable} antialiased`}>
        <SessionProvider>
          {children}
          <ServiceWorkerRegister />
        </SessionProvider>
      </body>
    </html>
  );
}
