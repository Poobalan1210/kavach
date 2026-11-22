"use client";

import { LayoutDashboard, Smartphone, UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Shield } from "@/components/Shield";

const VIEWS = [
  { href: "/console/", label: "Shield Console", icon: LayoutDashboard },
  { href: "/senior/", label: "Kamala's phone", icon: Smartphone },
  { href: "/senior/?household=hh-priya", label: "Priya's phone", icon: Smartphone },
  { href: "/approver/", label: "Arjun's app", icon: UserCheck },
];

/** The live demo's top bar: back to the site, and one tap to switch between the people in the story. */
export function DemoBar() {
  const [here, setHere] = useState("");
  useEffect(() => setHere(window.location.pathname + window.location.search), []);
  const active = (href: string) => (href.includes("?") ? here === href : here.replace(/\?.*/, "") === href && !here.includes("household="));
  return (
    <div className="bg-navy-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <a href="/" className="flex items-center gap-2 font-extrabold tracking-tight">
          <Shield size={24} /> Kavach
          <span className="ml-1 rounded-full bg-safe/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-safe">Live demo</span>
        </a>
        <nav className="-mx-1 flex gap-1 overflow-x-auto" aria-label="Demo views">
          {VIEWS.map(({ href, label, icon: Icon }) => (
            <a key={href} href={href} aria-current={active(href) ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${active(href) ? "bg-white text-navy-950" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
              <Icon className="h-4 w-4" /> {label}
            </a>
          ))}
        </nav>
        <span className="hidden text-xs text-white/45 xl:inline">Mock money only</span>
      </div>
    </div>
  );
}
