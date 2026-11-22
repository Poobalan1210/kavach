import { Brain, ShieldCheck, Video } from "lucide-react";
import claims from "@/lib/scenario-claims.json";

const LOST = `₹${claims.scenarios.arrest.headlineLost.toLocaleString("en-IN")}`;

/**
 * The idea at a glance: one scam message forks into a typical AI agent (money lost) and
 * Kavach (nothing moved, family alerted). The amount is from a real benchmark run (A-DA-02).
 */
export function HeroFork() {
  return (
    <div className="relative mx-auto w-full max-w-md select-none">
      {/* the call */}
      <div className="reveal flex justify-center" style={{ animationDelay: "0.1s" }}>
        <span className="inline-flex items-center gap-2 rounded-full border border-danger/50 bg-danger/10 px-3.5 py-1.5 text-sm font-semibold text-danger">
          <span className="h-2 w-2 animate-pulse rounded-full bg-danger" />
          <Video className="h-4 w-4" /> Fake “CBI officer” on a video call
        </span>
      </div>

      {/* her message */}
      <div className="reveal mt-5 flex justify-center" style={{ animationDelay: "0.5s" }}>
        <p className="max-w-[20rem] rounded-3xl rounded-bl-md bg-[#2a5fa8] px-5 py-3.5 text-center text-lg font-semibold leading-snug text-white shadow-2xl">
          “Send ₹95,000 bail now. Don't tell my son.”
        </p>
      </div>

      {/* the fork */}
      <svg viewBox="0 0 400 90" className="mx-auto mt-1 block h-[90px] w-full max-w-[400px]" aria-hidden>
        <path d="M200 0 V30 Q200 45 185 45 H105 Q90 45 90 60 V90" className="fork-line" stroke="rgba(255,93,93,0.75)" />
        <path d="M200 0 V30 Q200 45 215 45 H295 Q310 45 310 60 V90" className="fork-line" stroke="rgba(34,197,139,0.85)" style={{ animationDelay: "1.1s" }} />
      </svg>

      {/* outcomes */}
      <div className="grid grid-cols-2 gap-4">
        <Outcome delay="1.6s" icon={<Brain className="h-7 w-7 text-white/80" strokeWidth={1.8} />} ring="rgba(255,255,255,0.25)"
          who="Typical AI agent" big={`${LOST} lost`} small="believed a new story" color="var(--color-danger)" />
        <Outcome delay="2s" icon={<ShieldCheck className="h-7 w-7 text-safe" strokeWidth={1.8} />} ring="var(--color-safe)"
          who="Kavach" big="₹0 moved" small="Arjun alerted" color="var(--color-safe)" glow />
      </div>

      <a href="/benchmark/" className="reveal mt-6 block text-center text-xs font-semibold text-white/45 hover:text-white/80" style={{ animationDelay: "2.4s" }}>
        A real run from our benchmark →
      </a>
    </div>
  );
}

function Outcome({ delay, icon, ring, who, big, small, color, glow = false }: {
  delay: string; icon: React.ReactNode; ring: string; who: string; big: string; small: string; color: string; glow?: boolean;
}) {
  return (
    <div className="pop flex flex-col items-center text-center" style={{ animationDelay: delay }}>
      <span className="grid h-16 w-16 place-items-center rounded-full border-2 bg-navy-900"
        style={{ borderColor: ring, boxShadow: glow ? "0 0 0 8px rgba(34,197,139,0.12), 0 0 40px rgba(34,197,139,0.35)" : "none" }}>
        {icon}
      </span>
      <p className="mt-3 text-sm font-semibold text-white/70">{who}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight" style={{ color }}>{big}</p>
      <p className="text-sm text-white/50">{small}</p>
    </div>
  );
}
