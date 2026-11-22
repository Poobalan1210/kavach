import { SiteNav } from "@/components/site/SiteNav";

export default function NotFound() {
  return (
    <div className="hero-bg relative flex min-h-dvh flex-col overflow-hidden text-white">
      <div className="grid-lines absolute inset-0" aria-hidden />
      <SiteNav />
      <main className="relative mx-auto flex max-w-6xl flex-1 flex-col justify-center px-5 pb-24">
        <p className="text-sm font-bold uppercase tracking-widest text-sky">Page not found</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">Nothing here. Nothing paid, either.</h1>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="/" className="rounded-full bg-safe px-6 py-3 font-bold text-navy-950">Back to Kavach</a>
          <a href="/console/" className="glass rounded-full px-6 py-3 font-semibold">Open the live demo</a>
        </div>
      </main>
    </div>
  );
}
