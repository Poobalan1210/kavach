import type { Metadata } from "next";
import { Noto_Sans, Noto_Sans_Devanagari, Noto_Sans_Tamil, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", weight: ["500", "600", "700", "800"] });
const noto = Noto_Sans({ subsets: ["latin"], variable: "--font-noto", weight: ["400", "600", "700"] });
const tamil = Noto_Sans_Tamil({ subsets: ["tamil"], variable: "--font-noto-tamil", weight: ["400", "600", "700"] });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], variable: "--font-noto-deva", weight: ["400", "600", "700"] });

const DESCRIPTION =
  "A UPI payments agent on Amazon Bedrock AgentCore that follows the family's rules even when a scammer coaches the user. 0 of 40 coached scams moved money.";

export const metadata: Metadata = {
  metadataBase: new URL("https://main.d3fjay6nf7qqoi.amplifyapp.com"),
  title: { default: "Kavach · the payments agent a scammer can't talk around", template: "%s · Kavach" },
  description: DESCRIPTION,
  openGraph: {
    title: "Kavach · the payments agent a scammer can't talk around",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${noto.variable} ${tamil.variable} ${deva.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
