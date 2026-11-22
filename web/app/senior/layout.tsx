import type { Metadata } from "next";

export const metadata: Metadata = { title: "Kamala's phone" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
