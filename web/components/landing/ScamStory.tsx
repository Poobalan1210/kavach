"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { BellRing, Pause, Phone, PhoneOff, Play, RotateCcw, ShieldAlert, Video } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Shield } from "@/components/Shield";

/**
 * An illustrated short of a "digital arrest" scam in five scenes, showing where Kavach steps in.
 * Each scene is drawn on a fixed 960×540 stage that scales to the container, so the
 * composition is the same on a phone and a desktop. Kavach's part mirrors what the live
 * system returns for the same message (the guided demo's scam step).
 */

const W = 960;
const H = 540;

interface Scene { title: string; caption: string; ms: number; render: () => React.ReactNode }

const SCENES: Scene[] = [
  { title: "The call", ms: 5500, render: () => <SceneHome />,
    caption: "11 in the morning. Kamala, 68, gets a video call from a man in uniform. He says he's from the CBI." },
  { title: "The pressure", ms: 7000, render: () => <SceneCall />,
    caption: "A parcel with drugs was caught in her name, he says. She's under “digital arrest”. Pay ₹95,000 bail within the hour, and tell no one." },
  { title: "She asks to pay", ms: 6000, render: () => <SceneAsk />,
    caption: "Still on the call and frightened, she opens her payments app, where Kavach pays for her, and asks it to send the money." },
  { title: "Kavach steps in", ms: 7500, render: () => <SceneBlock />,
    caption: "Kavach recognises the script: an official demanding money, secrecy, a deadline. It pauses every payment in this session. No argument unlocks it." },
  { title: "Her son knows", ms: 7500, render: () => <SceneSon />,
    caption: "Arjun is alerted at once and calls his mother. She hangs up on the “officer”. Not a rupee moved." },
];

export function ScamStory() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [run, setRun] = useState(0); // bumps to replay the current scene's animations
  const scale = useStageScale(ref);

  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);
  const running = playing && inView;
  const scene = SCENES[i];
  const go = (n: number) => { setI(n); setRun((r) => r + 1); };

  return (
    <div className="mx-auto mt-12 max-w-5xl">
      <div className="overflow-hidden rounded-[1.75rem] bg-navy-950 shadow-2xl ring-1 ring-black/10">
        {/* the stage */}
        <div ref={ref} className="relative w-full overflow-hidden" style={{ height: H * scale }}>
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
            <AnimatePresence mode="wait">
              <motion.div key={`${i}-${run}`} className="absolute inset-0"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
                {scene.render()}
              </motion.div>
            </AnimatePresence>
          </div>
          {!playing && (
            <button onClick={() => { setPlaying(true); go(i); }} aria-label="Play"
              className="absolute inset-0 grid place-items-center bg-black/25 transition hover:bg-black/15">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-navy-950 shadow-xl"><Play className="ml-1 h-7 w-7" /></span>
            </button>
          )}
        </div>

        {/* subtitles + chapters */}
        <div className="border-t border-white/10 px-5 pb-5 pt-4 text-white sm:px-7">
          <div className="flex gap-1.5">
            {SCENES.map((s, n) => (
              <button key={s.title} onClick={() => go(n)} aria-label={`Scene ${n + 1}: ${s.title}`}
                className="group relative h-6 flex-1">
                <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/15 group-hover:bg-white/25">
                  {n < i && <span className="absolute inset-0 bg-white/70" />}
                  {n === i && (
                    <span key={`${i}-${run}`} className={`story-bar absolute inset-y-0 left-0 ${n === 3 ? "bg-safe" : "bg-sky"}`}
                      style={{ animationDuration: `${s.ms}ms`, animationPlayState: running ? "running" : "paused" }}
                      onAnimationEnd={() => go((i + 1) % SCENES.length)} />
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-4">
            <div className="min-h-[4.5rem] flex-1">
              <p className={`text-xs font-bold uppercase tracking-widest ${i === 3 ? "text-safe" : "text-sky"}`}>{i + 1} / 5 · {scene.title}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-white/85 sm:text-base">{scene.caption}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button onClick={() => go(i)} aria-label="Replay scene" className="grid h-9 w-9 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20">
                {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="text-xs text-ink-3">Illustrated reenactment of a common scam. Kavach's part is what the live system does with the same message.</p>
        <a href="/demo/" className="shrink-0 text-sm font-semibold text-brand hover:underline">Send the same message to the live system →</a>
      </div>
    </div>
  );
}

function useStageScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

/* ================= shared bits ================= */

const at = (delay: number, from: Record<string, number> = { y: 14 }) => ({
  initial: { opacity: 0, ...from }, animate: { opacity: 1, x: 0, y: 0, scale: 1 }, transition: { delay, duration: 0.45, ease: "easeOut" as const },
});

function Abs({ x, y, w, h, children, className = "", style }: { x: number; y: number; w?: number; h?: number; children?: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`absolute ${className}`} style={{ left: x, top: y, width: w, height: h, ...style }}>{children}</div>;
}

function Clock({ start }: { start: number }) {
  const [s, setS] = useState(start);
  useEffect(() => { const t = setInterval(() => setS((v) => v + 1), 1000); return () => clearInterval(t); }, []);
  const f = (n: number) => String(n).padStart(2, "0");
  return <>{Math.floor(s / 3600)}:{f(Math.floor(s / 60) % 60)}:{f(s % 60)}</>;
}

function Bubble({ who, children, className = "" }: { who: "me" | "kavach"; children: React.ReactNode; className?: string }) {
  const tone = who === "me" ? "ml-auto rounded-br-md bg-[#2a5fa8] text-white" : "rounded-bl-md bg-[#eef2f7] text-ink";
  return <div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 ${tone} ${className}`}>{children}</div>;
}

function PhoneShell({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <div className="relative rounded-[34px] bg-[#05080f] p-[7px] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]" style={{ width: w, height: h }}>
      <span className="absolute left-1/2 top-3 z-10 h-[18px] w-[70px] -translate-x-1/2 rounded-full bg-[#05080f]" />
      <div className="relative h-full w-full overflow-hidden rounded-[28px] bg-white text-[14px] leading-snug text-ink">{children}</div>
    </div>
  );
}

function KavachHeader() {
  return (
    <div className="flex items-center gap-2.5 border-b border-[#e6e9ee] bg-[#f4f7fb] px-4 pb-3 pt-10">
      <Shield size={26} />
      <div>
        <p className="font-bold">Kavach</p>
        <p className="text-[11px] text-ink-3">Payments for Kamala</p>
      </div>
    </div>
  );
}

/* ================= scene 1: at home ================= */

function SceneHome() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(180deg,#3a2c3f 0%,#2b2236 62%,#1d1726 62%,#18131f 100%)" }}>
      <motion.div className="absolute inset-0" initial={{ scale: 1 }} animate={{ scale: 1.07 }} transition={{ duration: 6, ease: "linear" }} style={{ transformOrigin: "60% 60%" }}>
        {/* window with daylight */}
        <Abs x={70} y={60} w={220} h={230} className="overflow-hidden rounded-t-[110px] border-[10px] border-[#5a4658]" style={{ background: "linear-gradient(180deg,#ffd9a0,#f6a96b)" }}>
          <div className="absolute left-1/2 top-0 h-full w-[8px] -translate-x-1/2 bg-[#5a4658]" />
          <div className="absolute left-0 top-1/2 h-[8px] w-full bg-[#5a4658]" />
        </Abs>
        {/* wall clock at 11:04 */}
        <Abs x={800} y={70} w={86} h={86} className="rounded-full border-[6px] border-[#6b5566] bg-[#f3ead9]">
          <svg viewBox="0 0 74 74" className="h-full w-full">
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => <line key={a} x1="37" y1="6" x2="37" y2="11" stroke="#6b5566" strokeWidth="2.5" transform={`rotate(${a} 37 37)`} />)}
            <line x1="37" y1="37" x2="37" y2="21" stroke="#2b2236" strokeWidth="4.5" strokeLinecap="round" transform="rotate(332 37 37)" />
            <line x1="37" y1="37" x2="37" y2="13" stroke="#2b2236" strokeWidth="3" strokeLinecap="round" transform="rotate(24 37 37)" />
            <circle cx="37" cy="37" r="3" fill="#c0262d" />
          </svg>
        </Abs>
        {/* framed photo of her son */}
        <Abs x={640} y={100} w={90} h={110} className="overflow-hidden rounded-md border-[6px] border-[#8a6d4e] bg-[#c9b79c]">
          <div className="absolute bottom-0 left-1/2 h-12 w-14 -translate-x-1/2 rounded-t-full bg-[#2f6fb0]" />
          <div className="absolute bottom-10 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full bg-[#b87a50]" />
          <div className="absolute bottom-[60px] left-1/2 h-3 w-8 -translate-x-1/2 rounded-t-full bg-[#1f1a17]" />
        </Abs>
        {/* plant */}
        <Abs x={870} y={260} w={70} h={90}>
          <svg viewBox="0 0 70 80" className="h-full w-full"><path d="M35 50 C20 30 10 25 5 8 C25 15 32 30 35 50 Z M35 50 C50 28 58 22 66 6 C46 14 38 30 35 50 Z M35 50 C33 30 36 15 40 0 C44 18 40 34 35 50Z" fill="#4f8a5b" /><path d="M18 50 H52 L48 80 H22 Z" fill="#b5653f" /></svg>
        </Abs>
        {/* armchair + Kamala */}
        <Abs x={360} y={160} w={300} h={380}><KamalaSeated mood="calm" /></Abs>
        {/* side table with the ringing phone */}
        <Abs x={690} y={380} w={150} h={14} className="rounded bg-[#7a5a3e]" />
        <Abs x={705} y={394} w={10} h={150} className="bg-[#5e4430]" />
        <Abs x={815} y={394} w={10} h={150} className="bg-[#5e4430]" />
        <motion.div className="absolute left-[742px] top-[318px]" animate={{ rotate: [0, -8, 8, -8, 8, 0] }} transition={{ repeat: Infinity, duration: 0.7, repeatDelay: 0.5 }}>
          <div className="h-[62px] w-[36px] rounded-[8px] border-[3px] border-[#05080f] bg-[#16223a]">
            <div className="mx-auto mt-3 h-3 w-3 rounded-full bg-safe" />
          </div>
        </motion.div>
        {[0, 0.6, 1.2].map((d) => (
          <motion.span key={d} className="absolute left-[748px] top-[337px] h-6 w-6 rounded-full border-2 border-safe/70"
            animate={{ scale: [1, 5], opacity: [0.8, 0] }} transition={{ repeat: Infinity, duration: 1.8, delay: d }} />
        ))}
      </motion.div>
      {/* incoming call card */}
      <motion.div {...at(1.2, { y: -20, scale: 0.9 })} className="absolute right-[50px] top-[180px] w-[260px] rounded-2xl bg-[#0b1222]/95 p-4 text-white shadow-2xl ring-1 ring-white/10">
        <p className="flex items-center gap-1.5 text-[12px] text-white/60"><Video className="h-4 w-4" /> Incoming video call</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-full bg-[#24365a] pt-1"><Officer /></div>
          <div>
            <p className="text-[17px] font-bold">CBI Officer</p>
            <p className="text-[12px] text-white/55">“Mumbai Cyber Crime”</p>
          </div>
        </div>
      </motion.div>
      <motion.p {...at(0.3)} className="absolute left-[60px] top-[24px] rounded-full bg-black/30 px-3 py-1 text-[13px] font-semibold text-white/80">11:04 AM · Chennai</motion.p>
    </div>
  );
}

/* ================= scene 2: the video call ================= */

const CALL_LINES = [
  "A parcel in your name had drugs and fake passports.",
  "You are under digital arrest. Do not disconnect.",
  "Pay ₹95,000 bail in one hour to clear your name.",
  "This is confidential. Tell no one. Not even your son.",
];

function SceneCall() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => Math.min(v + 1, CALL_LINES.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 30%,#2c4166,#141f33 70%)" }}>
      {/* fake office backdrop */}
      <Abs x={0} y={0} w={W} h={130} className="opacity-30" style={{ background: "repeating-linear-gradient(90deg,#3a5078 0 70px,#31466b 70px 140px)" }} />
      <Abs x={110} y={70} w={120} h={120} className="grid place-items-center rounded-full border-4 border-[#c9a44a] bg-[#1d2b4a] text-center text-[13px] font-extrabold leading-tight text-[#c9a44a]">
        <span>CENTRAL<br />BUREAU<br />★</span>
      </Abs>
      <Abs x={720} y={70} w={150} h={200} className="rounded border-4 border-[#4a3a26] bg-[#5c4630]">
        {[0, 1, 2, 3].map((r) => <div key={r} className="mx-2 mt-[36px] h-[10px] bg-[#3a2c1d]" />)}
      </Abs>
      {/* the officer */}
      <motion.div className="absolute left-[290px] top-[80px] h-[400px] w-[360px]" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2.4 }}>
        <Officer big />
      </motion.div>
      {/* the warrant he holds up */}
      <motion.div initial={{ opacity: 0, y: 90, rotate: 8 }} animate={{ opacity: 1, y: 0, rotate: -6 }} transition={{ delay: 2.8, duration: 0.6, type: "spring" }}
        className="absolute left-[560px] top-[230px] w-[190px] rounded bg-[#f7f1e1] p-3 text-[#3a2c1d] shadow-2xl">
        <p className="text-center text-[11px] font-extrabold tracking-widest">ARREST WARRANT</p>
        <div className="mt-2 space-y-1.5">{[90, 70, 80, 55].map((w) => <div key={w} className="h-[5px] rounded bg-[#3a2c1d]/25" style={{ width: `${w}%` }} />)}</div>
        <p className="mt-2 text-[12px] font-bold">Name: Kamala S.</p>
        <span className="absolute bottom-2 right-2 rotate-[-14deg] rounded border-2 border-danger px-1 text-[10px] font-extrabold text-danger">DIGITAL ARREST</span>
      </motion.div>
      {/* call chrome */}
      <Abs x={24} y={22} className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-semibold tabular-nums text-white">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> REC · <Clock start={2 * 3600 + 14 * 60 + 7} />
      </Abs>
      <Abs x={W - 250} y={22} className="rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-semibold text-white/80">Video call · do not disconnect</Abs>
      {/* Kamala's self-view */}
      <motion.div {...at(0.8, { x: 30 })} className="absolute right-[24px] top-[300px] h-[140px] w-[115px] overflow-hidden rounded-xl border-2 border-white/30 bg-[#3a2c3f]">
        <div className="absolute -bottom-1 left-1/2 h-[150px] w-[120px] -translate-x-1/2"><KamalaBust mood="scared" /></div>
      </motion.div>
      {/* live captions of what he says */}
      <div className="absolute inset-x-0 bottom-[26px] flex justify-center px-10">
        <AnimatePresence mode="wait">
          <motion.p key={n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}
            className="rounded-xl bg-black/75 px-5 py-2.5 text-center text-[24px] font-semibold text-white">
            “{CALL_LINES[n]}”
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ================= scene 3: she asks Kavach to pay ================= */

function SceneAsk() {
  const msg = "Send ₹95,000 bail to cbi.verify.fund@okaxis now. Don't tell my son.";
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#141c2c]">
      {/* the call, still going behind */}
      <div className="absolute inset-0 opacity-35 blur-[6px]">
        <div className="absolute left-[60px] top-[80px] h-[400px] w-[360px]"><Officer big /></div>
      </div>
      <motion.p {...at(0.5)} className="absolute left-[60px] top-[40px] flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[13px] font-semibold text-white">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" /> Still on the call
      </motion.p>
      <motion.p {...at(1)} className="absolute left-[60px] top-[420px] max-w-[340px] text-[24px] font-semibold italic text-white/85">
        “Hurry. The hour is running out.”
      </motion.p>
      {/* her phone, held up */}
      <motion.div className="absolute left-[540px] top-[24px]" initial={{ y: 140, rotate: 6 }} animate={{ y: 0, rotate: -3 }} transition={{ duration: 0.7, ease: "easeOut" }}>
        <PhoneShell w={270} h={470}>
          <KavachHeader />
          <div className="absolute inset-x-0 bottom-[70px] flex flex-col gap-2 p-4">
            <motion.div {...at(1.5)}><Bubble who="me" className="text-[15px]"><Typed text={msg} delay={1.6} /></Bubble></motion.div>
          </div>
          <div className="absolute inset-x-3 bottom-4 flex items-center justify-between rounded-full border border-[#e3e1db] py-2 pl-4 pr-2 text-ink-3">
            <span className="text-[13px]">Message</span>
            <motion.span animate={{ scale: [1, 1.18, 1] }} transition={{ delay: 3.6, duration: 0.5 }} className="rounded-full bg-[#2a5fa8] px-3 py-1.5 text-[12px] font-bold text-white">Send</motion.span>
          </div>
        </PhoneShell>
        {/* her thumb */}
        <motion.div className="absolute -bottom-[30px] right-[40px] h-[70px] w-[46px] rounded-[24px] bg-[#c68a5e]" style={{ rotate: "-25deg" }}
          animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.5, delay: 1.6, repeatDelay: 0.1 }} />
      </motion.div>
    </div>
  );
}

/* ================= scene 4: Kavach blocks it ================= */

function SceneBlock() {
  const checks: [string, string][] = [
    ["Guardrail", "Official demanding money"],
    ["Coercion 1.00", "Urgency, secrecy, authority"],
    ["Session paused", "No payment can go through"],
  ];
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "radial-gradient(ellipse at 55% 40%,#123a3a,#0a1730 65%)" }}>
      {/* her phone, left */}
      <Abs x={50} y={40}>
        <PhoneShell w={250} h={460}>
          <KavachHeader />
          <div className="flex flex-col gap-2 p-3 text-[13px]">
            <Bubble who="me" className="truncate">Send ₹95,000 bail to cbi.verify…</Bubble>
            <motion.div {...at(4.2)}>
              <Bubble who="kavach">No government agency asks for money on a call. I can't send this, and I've told Arjun.</Bubble>
            </motion.div>
          </div>
        </PhoneShell>
      </Abs>
      {/* the scammer's account, right */}
      <motion.div {...at(0.3, { x: 30 })} className="absolute right-[40px] top-[100px] w-[220px] rounded-2xl border-2 border-danger/60 bg-[#2a0f16] p-4 text-white">
        <p className="text-[12px] font-bold uppercase tracking-wider text-danger">Scammer's account</p>
        <p className="mt-1 text-[15px] font-semibold">cbi.verify.fund@okaxis</p>
      </motion.div>
      {/* the payment flies… */}
      <motion.div className="absolute left-[320px] top-[180px] rounded-full bg-white px-4 py-2 text-[18px] font-extrabold text-navy-950 shadow-xl"
        initial={{ x: 0, opacity: 0, rotate: 0 }} animate={{ x: [0, 95, 75], opacity: [0, 1, 0.55], rotate: [0, 0, -12] }} transition={{ delay: 0.5, duration: 1.4, times: [0, 0.7, 1] }}>
        ₹95,000 →
      </motion.div>
      {/* …into the shield */}
      <motion.div className="absolute left-[500px] top-[80px]" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1.1, type: "spring", stiffness: 260, damping: 14 }}>
        <motion.div animate={{ filter: ["drop-shadow(0 0 0px #22c58b)", "drop-shadow(0 0 34px #22c58b)", "drop-shadow(0 0 14px #22c58b)"] }} transition={{ delay: 1.5, duration: 1.2 }}>
          <Shield size={170} />
        </motion.div>
      </motion.div>
      <motion.div className="absolute left-[455px] top-[160px] text-[56px] font-black leading-none text-danger"
        initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.75, duration: 0.3 }}>✕</motion.div>
      {/* the checks that fired */}
      <div className="absolute left-[350px] top-[290px] w-[350px] space-y-2">
        {checks.map(([k, v], n) => (
          <motion.div key={k} {...at(2.2 + n * 0.55, { x: -16 })} className="flex items-center gap-3 rounded-xl bg-white/95 px-4 py-2.5 shadow-lg">
            <ShieldAlert className="h-5 w-5 shrink-0 text-block" />
            <p className="text-[15px]"><b className="text-block">{k}</b> <span className="text-ink-2">· {v}</span></p>
          </motion.div>
        ))}
      </div>
      <motion.div {...at(4.8, { scale: 0.6 })} className="absolute right-[50px] top-[300px] text-right text-safe">
        <p className="text-[76px] font-black leading-none">₹0</p>
        <p className="text-[26px] font-extrabold">moved</p>
      </motion.div>
    </div>
  );
}

/* ================= scene 5: Arjun is alerted ================= */

function SceneSon() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: "linear-gradient(90deg,#2b2236 0 50%,#16263f 50% 100%)" }}>
      <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 bg-white/10" />
      <p className="absolute left-[30px] top-[24px] text-[13px] font-semibold uppercase tracking-widest text-white/50">Chennai · Kamala</p>
      <p className="absolute right-[30px] top-[24px] text-[13px] font-semibold uppercase tracking-widest text-white/50">Bengaluru · Arjun at work</p>

      {/* Arjun, right half */}
      <Abs x={520} y={150} w={240} h={390}><ArjunBust /></Abs>
      <Abs x={480} y={470} w={480} h={70} className="bg-[#3b2c22]" />
      <motion.div {...at(0.6, { y: -30 })} className="absolute right-[24px] top-[70px] w-[250px] rounded-2xl bg-white p-3.5 text-ink shadow-2xl">
        <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink-3"><BellRing className="h-4 w-4 text-block" /> KAVACH · now</p>
        <p className="mt-1 text-[15px] font-bold leading-snug">Stopped ₹95,000 to cbi.verify.fund@okaxis</p>
        <p className="mt-1 text-[13px] text-ink-2">Amma may be on a scam call. Call her now.</p>
        <motion.span animate={{ scale: [1, 1.06, 1] }} transition={{ repeat: Infinity, duration: 1.2, delay: 1.5 }}
          className="mt-3 flex items-center justify-center gap-2 rounded-full bg-safe py-2 text-[14px] font-bold text-navy-950">
          <Phone className="h-4 w-4" /> Call Amma
        </motion.span>
      </motion.div>

      {/* the call crossing over */}
      <motion.div className="absolute left-[330px] top-[300px] h-[4px] origin-right rounded-full bg-safe" initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }} transition={{ delay: 2.2, duration: 0.8 }} style={{ width: 220, boxShadow: "0 0 16px #22c58b" }} />
      <motion.span {...at(2.5)} className="absolute left-[380px] top-[264px] text-[14px] font-semibold text-safe">Arjun calling…</motion.span>

      {/* Kamala, left half: scared → relieved */}
      <Abs x={70} y={170} w={240} h={370}>
        <motion.div className="absolute inset-0" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 3.4, duration: 0.4 }}><KamalaBust mood="scared" /></motion.div>
        <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.4, duration: 0.4 }}><KamalaBust mood="relieved" /></motion.div>
      </Abs>
      <motion.div {...at(3.2, { scale: 0.8 })} className="absolute left-[40px] top-[90px] flex items-center gap-2 rounded-full bg-danger px-3 py-1.5 text-[13px] font-bold text-white">
        <PhoneOff className="h-4 w-4" /> Call with the “officer” ended
      </motion.div>

      {/* end card */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 5, duration: 0.6 }}
        className="absolute inset-0 grid place-items-center bg-navy-950/90">
        <div className="text-center text-white">
          <motion.div {...at(5.2, { scale: 0.6 })} className="mx-auto w-fit"><Shield size={80} /></motion.div>
          <motion.p {...at(5.4)} className="mt-4 text-[52px] font-black tracking-tight">Not a rupee moved.</motion.p>
          <motion.p {...at(5.7)} className="mt-1 text-[22px] text-white/70">Rules her family set when calm, enforced when she was frightened.</motion.p>
        </div>
      </motion.div>
    </div>
  );
}

function Typed({ text, delay }: { text: string; delay: number }) {
  return (
    <>
      {text.split(" ").map((w, n) => (
        <motion.span key={n} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + n * 0.14, duration: 0.08 }}>{w} </motion.span>
      ))}
    </>
  );
}

/* ================= people ================= */

const SKIN_K = "#c68a5e";
const SKIN_K_SHADE = "#b0754c";

type Mood = "calm" | "scared" | "relieved";

function KamalaFace({ mood }: { mood: Mood }) {
  const mouth = { calm: "M88 128 Q100 134 112 128", scared: "M89 132 Q100 123 111 132", relieved: "M86 126 Q100 140 114 126" }[mood];
  const browL = mood === "scared" ? "M70 92 L88 87" : "M70 90 Q79 86 88 89";
  const browR = mood === "scared" ? "M112 87 L130 92" : "M112 89 Q121 86 130 90";
  return (
    <g>
      {/* hair: bun and back */}
      <circle cx="100" cy="40" r="20" fill="#cfccc6" />
      <path d="M90 32 Q100 24 110 32" stroke="#b5b2ac" strokeWidth="2" fill="none" />
      <ellipse cx="100" cy="98" rx="48" ry="54" fill="#cfccc6" />
      {/* ears + earrings */}
      <ellipse cx="58" cy="106" rx="7" ry="11" fill={SKIN_K_SHADE} />
      <ellipse cx="142" cy="106" rx="7" ry="11" fill={SKIN_K_SHADE} />
      <circle cx="58" cy="120" r="3.5" fill="#e3b341" />
      <circle cx="142" cy="120" r="3.5" fill="#e3b341" />
      {/* face */}
      <ellipse cx="100" cy="106" rx="42" ry="47" fill={SKIN_K} />
      <path d="M58 98 Q58 58 100 56 Q142 58 142 98 Q132 72 100 72 Q68 72 58 98 Z" fill="#e2dfd9" />
      <path d="M100 57 V72" stroke="#b5b2ac" strokeWidth="2" />
      <circle cx="100" cy="82" r="3.4" fill="#c0262d" />
      <ellipse cx="76" cy="120" rx="7" ry="4" fill="#d9786a" opacity="0.35" />
      <ellipse cx="124" cy="120" rx="7" ry="4" fill="#d9786a" opacity="0.35" />
      {/* glasses + eyes */}
      <circle cx="80" cy="104" r="12" fill="#fff" fillOpacity="0.12" stroke="#5a4636" strokeWidth="2.4" />
      <circle cx="120" cy="104" r="12" fill="#fff" fillOpacity="0.12" stroke="#5a4636" strokeWidth="2.4" />
      <path d="M92 103 H108" stroke="#5a4636" strokeWidth="2.4" />
      <motion.g animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ repeat: Infinity, duration: 3.5, times: [0, 0.92, 0.96, 1] }} style={{ transformOrigin: "100px 105px" }}>
        <circle cx="80" cy="105" r={mood === "scared" ? 3.8 : 3.2} fill="#2b2118" />
        <circle cx="120" cy="105" r={mood === "scared" ? 3.8 : 3.2} fill="#2b2118" />
      </motion.g>
      <path d={browL} stroke="#8a8780" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d={browR} stroke="#8a8780" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M100 108 Q97 118 102 120" stroke={SKIN_K_SHADE} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d={mouth} stroke="#7a3b2a" strokeWidth="3" strokeLinecap="round" fill="none" />
      {mood === "scared" && (
        <motion.path d="M136 84 q4 8 0 12 q-4 -4 0 -12z" fill="#9fd6ff" animate={{ y: [0, 14], opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} />
      )}
    </g>
  );
}

function KamalaBust({ mood }: { mood: Mood }) {
  return (
    <svg viewBox="0 0 200 250" className="h-full w-full" aria-hidden>
      <path d="M20 250 Q24 178 100 170 Q176 178 180 250 Z" fill="#c2416b" />
      <path d="M100 172 Q150 176 176 240 L150 250 Q138 200 100 182 Z" fill="#e0a43b" />
      <path d="M104 184 Q140 196 150 250" stroke="#b8862b" strokeWidth="3" fill="none" />
      <rect x="86" y="140" width="28" height="36" rx="10" fill={SKIN_K_SHADE} />
      <KamalaFace mood={mood} />
    </svg>
  );
}

function KamalaSeated({ mood }: { mood: Mood }) {
  return (
    <svg viewBox="0 0 300 380" className="h-full w-full" aria-hidden>
      {/* armchair */}
      <rect x="40" y="90" width="220" height="230" rx="40" fill="#6b4f7a" />
      <rect x="20" y="200" width="60" height="140" rx="26" fill="#5c4269" />
      <rect x="220" y="200" width="60" height="140" rx="26" fill="#5c4269" />
      <rect x="60" y="250" width="180" height="90" rx="20" fill="#7a5c8a" />
      <rect x="50" y="340" width="14" height="40" fill="#3b2c22" />
      <rect x="236" y="340" width="14" height="40" fill="#3b2c22" />
      {/* saree */}
      <path d="M78 330 Q76 200 150 190 Q224 200 222 330 Z" fill="#c2416b" />
      <path d="M150 192 Q200 196 214 290 L190 300 Q186 220 150 204 Z" fill="#e0a43b" />
      {/* hands in lap */}
      <ellipse cx="135" cy="292" rx="20" ry="12" fill={SKIN_K} />
      <ellipse cx="165" cy="294" rx="20" ry="12" fill={SKIN_K} />
      <path d="M120 286 h30" stroke="#e3b341" strokeWidth="3" />
      <rect x="136" y="160" width="28" height="40" rx="10" fill={SKIN_K_SHADE} />
      {/* she turns towards the ringing phone */}
      <motion.g animate={{ rotate: [0, 0, 10] }} transition={{ delay: 1.4, duration: 0.6 }} style={{ transformOrigin: "150px 190px" }}>
        <g transform="translate(50 30)"><KamalaFace mood={mood} /></g>
      </motion.g>
    </svg>
  );
}

function ArjunBust() {
  return (
    <svg viewBox="0 0 200 320" className="h-full w-full" aria-hidden>
      <path d="M14 320 Q18 196 100 186 Q182 196 186 320 Z" fill="#2f6fb0" />
      <path d="M84 188 L100 214 L116 188 Z" fill="#e8eef6" />
      <rect x="86" y="150" width="28" height="40" rx="10" fill="#a06a45" />
      <ellipse cx="57" cy="110" rx="7" ry="11" fill="#a06a45" />
      <ellipse cx="143" cy="110" rx="7" ry="11" fill="#a06a45" />
      <ellipse cx="100" cy="108" rx="42" ry="50" fill="#b87a50" />
      <path d="M56 104 Q50 52 100 50 Q150 52 144 104 Q140 76 116 72 Q92 80 62 78 Z" fill="#1f1a17" />
      <motion.g animate={{ scaleY: [1, 1, 0.1, 1] }} transition={{ repeat: Infinity, duration: 3.2, times: [0, 0.9, 0.95, 1] }} style={{ transformOrigin: "100px 106px" }}>
        <circle cx="82" cy="106" r="4" fill="#1f1a17" />
        <circle cx="118" cy="106" r="4" fill="#1f1a17" />
      </motion.g>
      <path d="M70 94 L92 92 M108 92 L130 94" stroke="#1f1a17" strokeWidth="4" strokeLinecap="round" />
      <path d="M100 108 Q96 120 102 122" stroke="#9c6640" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M88 134 Q100 140 112 134" stroke="#6b3524" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M68 128 Q100 160 132 128" stroke="#1f1a17" strokeOpacity="0.22" strokeWidth="7" fill="none" strokeLinecap="round" />
      {/* he lifts the phone to his ear */}
      <motion.g initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2, duration: 0.5 }}>
        <path d="M150 260 Q178 190 160 130" stroke="#2f6fb0" strokeWidth="26" strokeLinecap="round" fill="none" />
        <circle cx="160" cy="124" r="13" fill="#b87a50" />
        <rect x="146" y="88" width="22" height="44" rx="5" fill="#05080f" />
      </motion.g>
    </svg>
  );
}

function Officer({ big = false }: { big?: boolean }) {
  return (
    <svg viewBox="0 0 200 220" className="h-full w-full" aria-hidden>
      <path d="M0 220 Q6 150 100 140 Q194 150 200 220 Z" fill="#8a7d52" />
      <path d="M80 142 L100 168 L120 142 Z" fill="#6f6440" />
      {big && <rect x="38" y="178" width="34" height="14" rx="2" fill="#d8b64a" />}
      {big && <rect x="132" y="176" width="30" height="8" rx="2" fill="#2f3f62" />}
      <rect x="86" y="118" width="28" height="30" rx="9" fill="#93603f" />
      <ellipse cx="58" cy="98" rx="7" ry="10" fill="#93603f" />
      <ellipse cx="142" cy="98" rx="7" ry="10" fill="#93603f" />
      <ellipse cx="100" cy="94" rx="40" ry="46" fill="#a96f48" />
      <path d="M52 66 Q56 24 100 22 Q144 24 148 66 Z" fill="#1d2b4a" />
      <rect x="48" y="60" width="104" height="12" rx="4" fill="#13203a" />
      <circle cx="100" cy="44" r="8" fill="#d8b64a" />
      <path d="M72 86 L92 92 M108 92 L128 86" stroke="#1f1a17" strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="83" cy="100" r="4" fill="#1f1a17" />
      <circle cx="117" cy="100" r="4" fill="#1f1a17" />
      <path d="M78 118 Q100 110 122 118 Q112 126 100 123 Q88 126 78 118 Z" fill="#1f1a17" />
      <path d="M90 130 H110" stroke="#5e2f20" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
