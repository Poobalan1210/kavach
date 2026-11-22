"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { BellRing, Pause, Phone, PhoneOff, Play, ShieldAlert, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Shield } from "@/components/Shield";

/**
 * An illustrated reenactment of a "digital arrest" scam, in five scenes, showing where Kavach
 * steps in. The Kavach scenes mirror what the live system returns for the same message
 * (see the guided demo's scam step); the people are drawn, not real.
 */

type Mood = "calm" | "worried";
interface Scene { title: string; caption: string; who: "kamala" | "arjun"; mood: Mood; screen: () => React.ReactNode }

const SCENE_MS = 5200;

const SCENES: Scene[] = [
  {
    title: "The call",
    caption: "A man in uniform video-calls Kamala. He says he's from the CBI and a parcel with drugs was caught in her name.",
    who: "kamala", mood: "calm", screen: () => <IncomingCall />,
  },
  {
    title: "The pressure",
    caption: "She is told she's under “digital arrest”. Pay bail within the hour, stay on the call, and tell no one. Not even her son.",
    who: "kamala", mood: "worried", screen: () => <OnCall />,
  },
  {
    title: "She asks to pay",
    caption: "Frightened, she opens her payments app, where Kavach makes payments for her, and asks it to send the money.",
    who: "kamala", mood: "worried", screen: () => <Asks />,
  },
  {
    title: "Kavach steps in",
    caption: "Kavach recognises the script: an official demanding money, secrecy, a deadline. It pauses every payment in this session. No argument unlocks it.",
    who: "kamala", mood: "worried", screen: () => <Stops />,
  },
  {
    title: "Her son knows",
    caption: "Arjun gets an alert straight away and calls his mother. She hangs up on the “officer”. Not a rupee moved.",
    who: "arjun", mood: "calm", screen: () => <ArjunAlert />,
  },
];

export function ScamStory() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [watched, setWatched] = useState(false);

  // Reduced motion: no autoplay; the viewer steps through the scenes.
  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);

  const running = playing && inView;
  const next = () => setI((n) => {
    if (n === SCENES.length - 1) setWatched(true);
    return (n + 1) % SCENES.length;
  });
  const scene = SCENES[i];
  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button onClick={() => setPlaying((p) => !p)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink">
        {playing ? <><Pause className="h-4 w-4" /> Pause</> : <><Play className="h-4 w-4" /> Play</>}
      </button>
      <a href="/demo/" className={`text-sm font-semibold hover:underline ${watched ? "text-safe" : "text-brand"}`}>
        Send the same message to the live system →
      </a>
    </div>
  );

  return (
    <div ref={ref} className="mt-12 grid items-center gap-10 lg:grid-cols-[1fr_1.15fr]">
      {/* scene list */}
      <ol className="hidden space-y-2 lg:block">
        {SCENES.map((s, n) => {
          const active = n === i;
          return (
            <li key={s.title}>
              <button onClick={() => setI(n)} aria-current={active ? "step" : undefined}
                className={`relative w-full overflow-hidden rounded-2xl border px-5 py-4 text-left transition ${active ? "border-brand/40 bg-panel shadow-md" : "border-transparent hover:bg-panel/60"}`}>
                <div className="flex items-baseline gap-3">
                  <span className={`text-sm font-extrabold tabular-nums ${active ? (n === 3 ? "text-safe" : "text-brand") : "text-ink-3"}`}>{n + 1}</span>
                  <div>
                    <p className={`font-bold ${active ? "text-ink" : "text-ink-2"}`}>{s.title}</p>
                    {active && <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.caption}</p>}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        <li className="px-5 pt-3">{controls}</li>
      </ol>

      {/* the stage */}
      <div>
        <div className="hero-bg relative overflow-hidden rounded-[2rem] px-4 py-8 sm:px-8 sm:py-10">
          <div className="grid-lines absolute inset-0 opacity-40" aria-hidden />
          <div className="relative flex items-end justify-center gap-3 sm:gap-8">
            <div className="w-24 shrink-0 sm:w-40">
              <AnimatePresence mode="wait">
                <motion.div key={scene.who} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.35 }}>
                  {scene.who === "kamala" ? <Kamala mood={scene.mood} /> : <Arjun />}
                  <p className="mt-2 text-center text-xs font-semibold text-white/60">{scene.who === "kamala" ? "Kamala, 68" : "Arjun, her son"}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <PhoneFrame>
              <AnimatePresence mode="wait">
                <motion.div key={i} className="absolute inset-0 flex flex-col"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
                  {scene.screen()}
                </motion.div>
              </AnimatePresence>
            </PhoneFrame>
          </div>
          <span key={`${i}-bar`} className={`story-bar absolute bottom-0 left-0 h-1 ${i === 3 ? "bg-safe" : "bg-sky"}`}
            style={{ animationDuration: `${SCENE_MS}ms`, animationPlayState: running ? "running" : "paused" }}
            onAnimationEnd={next} />
        </div>
        {/* phones: the caption sits right under the picture, with scene dots */}
        <div className="mt-5 lg:hidden">
          <div className="flex items-center gap-2">
            {SCENES.map((s, n) => (
              <button key={s.title} onClick={() => setI(n)} aria-label={`Scene ${n + 1}: ${s.title}`}
                className={`h-2 rounded-full transition-all ${n === i ? "w-6 bg-brand" : "w-2 bg-line"}`} />
            ))}
          </div>
          <p className="mt-3 font-bold">{i + 1}. {scene.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">{scene.caption}</p>
          <div className="mt-4">{controls}</div>
        </div>
        <p className="mt-3 text-center text-xs text-ink-3">
          Illustrated reenactment of a common scam. Kavach's part is what the live system does with the same message.
        </p>
      </div>
    </div>
  );
}

/* ---------------- phone screens ---------------- */

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-[440px] w-[210px] shrink-0 rounded-[2.2rem] border-[6px] border-navy-950 bg-navy-950 shadow-2xl sm:w-[240px]">
      <span className="absolute left-1/2 top-1.5 z-10 h-4 w-16 -translate-x-1/2 rounded-full bg-navy-950" />
      <div className="relative h-full w-full overflow-hidden rounded-[1.8rem] bg-white text-[13px] leading-snug text-ink">{children}</div>
    </div>
  );
}

const appear = (d: number) => ({ initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.35 } });

function IncomingCall() {
  return (
    <div className="flex h-full flex-col items-center bg-gradient-to-b from-[#1b2a44] to-[#0b1222] px-4 pb-6 pt-12 text-white">
      <p className="flex items-center gap-1.5 text-xs text-white/60"><Video className="h-3.5 w-3.5" /> Incoming video call</p>
      <motion.div className="mt-6 w-24" animate={{ scale: [1, 1.04, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}><Officer /></motion.div>
      <p className="mt-4 text-lg font-bold">CBI Officer</p>
      <p className="text-xs text-white/60">“Mumbai Cyber Crime Branch”</p>
      <p className="mt-1 text-xs text-white/40">+91 70•• ••• •12</p>
      <div className="mt-auto flex w-full justify-around">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-danger"><PhoneOff className="h-5 w-5" /></span>
        <motion.span className="grid h-12 w-12 place-items-center rounded-full bg-safe" animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.9 }}>
          <Phone className="h-5 w-5" />
        </motion.span>
      </div>
    </div>
  );
}

function OnCall() {
  const lines = ["A parcel in your name had drugs.", "You are under digital arrest.", "Pay ₹95,000 bail in one hour.", "Tell no one. Not even your son."];
  return (
    <div className="flex h-full flex-col bg-[#0b1222] text-white">
      <div className="relative h-36 shrink-0 bg-gradient-to-b from-[#24365a] to-[#16223a]">
        <div className="absolute left-1/2 top-6 w-20 -translate-x-1/2"><Officer /></div>
        <span className="absolute left-3 top-8 rounded bg-danger px-1.5 py-0.5 text-[10px] font-bold">● REC</span>
        <span className="absolute right-3 top-8 text-[10px] tabular-nums text-white/70">2:14:07</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {lines.map((l, n) => (
          <motion.p key={l} {...appear(0.3 + n * 0.8)} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white/10 px-3 py-2">{l}</motion.p>
        ))}
      </div>
    </div>
  );
}

function AppHeader() {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-[#f4f7fb] px-3 pb-2.5 pt-9">
      <Shield size={22} />
      <div>
        <p className="text-sm font-bold">Kavach</p>
        <p className="text-[10px] text-ink-3">Payments for Kamala</p>
      </div>
    </div>
  );
}

function Asks() {
  const msg = "Send ₹95,000 bail to cbi.verify.fund@okaxis now. Don't tell my son.";
  return (
    <div className="flex h-full flex-col bg-white">
      <AppHeader />
      <div className="flex flex-1 flex-col justify-end gap-2 p-3">
        <motion.p {...appear(0.4)} className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-[#2a5fa8] px-3 py-2 text-white">
          <Typed text={msg} delay={0.5} />
        </motion.p>
      </div>
      <div className="m-3 mt-0 flex items-center justify-between rounded-full border border-line px-3 py-2 text-ink-3">
        <span className="text-xs">Message</span>
        <motion.span {...appear(2.8)} className="rounded-full bg-[#2a5fa8] px-2.5 py-1 text-[10px] font-bold text-white">Send</motion.span>
      </div>
    </div>
  );
}

function Stops() {
  const checks: [string, string][] = [
    ["Guardrail", "Official demanding money"],
    ["Coercion", "1.00 · urgency, secrecy, authority"],
    ["Session", "Paused · no payment can go through"],
  ];
  return (
    <div className="flex h-full flex-col bg-white">
      <AppHeader />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-3">
        <p className="ml-auto max-w-[80%] shrink-0 truncate rounded-2xl rounded-br-sm bg-[#2a5fa8]/80 px-3 py-1.5 text-xs text-white">Send ₹95,000 bail to cbi.verify…</p>
        {checks.map(([k, v], n) => (
          <motion.div key={k} {...appear(0.3 + n * 0.5)} className="flex shrink-0 items-center gap-2 rounded-lg bg-block-soft px-2.5 py-1.5 text-[11px] leading-tight">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-block" />
            <span><b className="text-block">{k}</b> <span className="text-ink-2">{v}</span></span>
          </motion.div>
        ))}
        <motion.p {...appear(2)} className="mt-1 max-w-[95%] shrink-0 rounded-2xl rounded-bl-sm bg-[#eef2f7] px-3 py-2 text-[12px]">
          No government agency asks for money on a call. I can't send this, and I've told Arjun.
        </motion.p>
        <motion.p {...appear(2.9)} className="mt-auto shrink-0 text-center text-2xl font-extrabold text-safe">₹0 moved</motion.p>
      </div>
    </div>
  );
}

function ArjunAlert() {
  return (
    <div className="flex h-full flex-col items-center bg-gradient-to-b from-[#0f3d33] to-[#0a1730] px-3 pt-10 text-white">
      <p className="text-4xl font-light tabular-nums">4:32</p>
      <p className="text-xs text-white/60">Tuesday</p>
      <motion.div {...appear(0.4)} className="mt-6 w-full rounded-2xl bg-white/95 p-3 text-ink shadow-xl">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-3"><BellRing className="h-3.5 w-3.5 text-block" /> KAVACH · now</p>
        <p className="mt-1 font-bold">Stopped ₹95,000 to cbi.verify.fund@okaxis</p>
        <p className="mt-0.5 text-xs text-ink-2">Amma may be on a scam call. Call her now.</p>
      </motion.div>
      <motion.span {...appear(1.6)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-safe px-5 py-2.5 text-sm font-bold text-navy-950">
        <Phone className="h-4 w-4" /> Call Amma
      </motion.span>
      <motion.p {...appear(2.8)} className="mt-auto mb-6 text-center text-sm font-semibold text-white/80">She hangs up. Nothing was lost.</motion.p>
    </div>
  );
}

function Typed({ text, delay }: { text: string; delay: number }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, n) => (
        <motion.span key={n} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + n * 0.15, duration: 0.1 }}>{w} </motion.span>
      ))}
    </>
  );
}

/* ---------------- people (flat illustrations) ---------------- */

function Kamala({ mood }: { mood: Mood }) {
  const mouth = mood === "worried" ? "M33 55 Q40 50 47 55" : "M33 53 Q40 59 47 53";
  const brows = mood === "worried" ? ["M28 36 L35 34", "M45 34 L52 36"] : ["M28 35 L35 35", "M45 35 L52 35"];
  return (
    <svg viewBox="0 0 80 100" className="w-full" aria-hidden>
      {/* saree and shoulders */}
      <path d="M8 100 Q10 72 40 70 Q70 72 72 100 Z" fill="#c2416b" />
      <path d="M40 70 Q60 72 70 96 L56 100 Q52 80 40 74 Z" fill="#e0a43b" />
      <rect x="34" y="60" width="12" height="12" rx="4" fill="#b97a52" />
      {/* hair back + bun */}
      <circle cx="40" cy="14" r="8" fill="#d9d6d0" />
      <ellipse cx="40" cy="38" rx="21" ry="24" fill="#d9d6d0" />
      {/* face */}
      <ellipse cx="40" cy="42" rx="17" ry="20" fill="#c68a5e" />
      <path d="M23 36 Q24 20 40 20 Q56 20 57 36 Q50 26 40 27 Q30 26 23 36 Z" fill="#e4e1db" />
      <circle cx="40" cy="31" r="1.6" fill="#c0262d" />
      {/* glasses */}
      <circle cx="33" cy="42" r="5" fill="none" stroke="#5a4636" strokeWidth="1.3" />
      <circle cx="47" cy="42" r="5" fill="none" stroke="#5a4636" strokeWidth="1.3" />
      <path d="M38 42 H42" stroke="#5a4636" strokeWidth="1.3" />
      <circle cx="33" cy="42" r="1.4" fill="#2b2118" />
      <circle cx="47" cy="42" r="1.4" fill="#2b2118" />
      {brows.map((d) => <path key={d} d={d} stroke="#8a8780" strokeWidth="1.6" strokeLinecap="round" />)}
      <motion.path d={mouth} animate={{ d: mouth }} fill="none" stroke="#7a3b2a" strokeWidth="1.8" strokeLinecap="round" />
      {mood === "worried" && <motion.circle cx="55" cy="34" r="1.6" fill="#8fd0ff" initial={{ opacity: 0, y: -2 }} animate={{ opacity: [0, 1, 0], y: [0, 6, 10] }} transition={{ repeat: Infinity, duration: 1.8 }} />}
    </svg>
  );
}

function Arjun() {
  return (
    <svg viewBox="0 0 80 100" className="w-full" aria-hidden>
      <path d="M8 100 Q10 72 40 70 Q70 72 72 100 Z" fill="#2f6fb0" />
      <path d="M34 70 L40 80 L46 70 Z" fill="#e8eef6" />
      <rect x="34" y="60" width="12" height="12" rx="4" fill="#a8704a" />
      <ellipse cx="40" cy="42" rx="17" ry="20" fill="#b87a50" />
      <path d="M22 40 Q20 18 40 18 Q60 18 58 40 Q56 28 44 27 Q34 30 24 30 Z" fill="#1f1a17" />
      <circle cx="33" cy="43" r="1.6" fill="#1f1a17" />
      <circle cx="47" cy="43" r="1.6" fill="#1f1a17" />
      <path d="M29 37 L36 36 M44 36 L51 37" stroke="#1f1a17" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M34 53 Q40 56 46 53" fill="none" stroke="#6b3524" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M30 56 Q40 64 50 56" fill="none" stroke="#1f1a17" strokeOpacity="0.25" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Officer() {
  return (
    <svg viewBox="0 0 80 90" className="w-full" aria-hidden>
      <path d="M6 90 Q8 64 40 62 Q72 64 74 90 Z" fill="#8a7d52" />
      <rect x="18" y="72" width="12" height="7" rx="1.5" fill="#d8b64a" />
      <rect x="34" y="54" width="12" height="10" rx="4" fill="#a06a45" />
      <ellipse cx="40" cy="38" rx="16" ry="19" fill="#a96f48" />
      <path d="M20 26 Q22 10 40 10 Q58 10 60 26 Z" fill="#1d2b4a" />
      <rect x="18" y="24" width="44" height="5" rx="2" fill="#13203a" />
      <circle cx="40" cy="18" r="3" fill="#d8b64a" />
      <path d="M29 35 L36 37 M44 37 L51 35" stroke="#1f1a17" strokeWidth="2" strokeLinecap="round" />
      <circle cx="33" cy="40" r="1.6" fill="#1f1a17" />
      <circle cx="47" cy="40" r="1.6" fill="#1f1a17" />
      <path d="M31 47 Q40 44 49 47 Q45 50 40 49 Q35 50 31 47 Z" fill="#1f1a17" />
      <path d="M35 52 H45" stroke="#5e2f20" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
