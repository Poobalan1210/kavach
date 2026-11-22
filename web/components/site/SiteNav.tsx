import { Shield } from "@/components/Shield";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#scenarios", label: "See it decide" },
  { href: "/#results", label: "Results" },
  { href: "/#fits", label: "Where it fits", wide: true },
  { href: "/benchmark/", label: "Benchmark" },
];

/** The site's top navigation, on a dark background. Same on every marketing page. */
export function SiteNav({ current }: { current?: string }) {
  return (
    <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
      <a href="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight"><Shield size={30} /> Kavach</a>
      <div className="flex items-center gap-6 text-sm font-semibold">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} aria-current={current === l.href ? "page" : undefined}
            className={`hidden hover:text-white ${l.wide ? "lg:inline" : "md:inline"} ${current === l.href ? "text-white" : "text-white/70"}`}>
            {l.label}
          </a>
        ))}
        <a href="/demo/" className="rounded-full bg-white px-4 py-2 text-navy-950 hover:bg-white/90">Live demo</a>
      </div>
    </nav>
  );
}
