import type { Metadata } from "next";

export const metadata: Metadata = { title: "Arjun's app" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
