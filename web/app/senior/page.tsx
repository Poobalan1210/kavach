"use client";

import { useEffect, useState } from "react";
import { Activity } from "@/components/Activity";
import { Shield } from "@/components/Shield";
import { DemoBar } from "@/components/DemoBar";
import { Transcript } from "@/components/Transcript";
import { useHousehold, type Household } from "@/lib/demo";
import { useChat } from "@/lib/useChat";

type Lang = "en" | "hi" | "ta";

const T: Record<Lang, Record<string, string>> = {
  en: {
    hello: "Hello", ask: "What would you like to pay?", bill: "Pay a bill", family: "Send to family", mine: "My payments",
    billText: "Pay the electricity bill.", familyText: "Send money to my family.", type: "Type or ask here…", send: "Send",
    held: "I've paused this. No police or bank officer ever asks for money. {approver} has been told.",
    back: "Back",
    shield: "Protected by Kavach", guardian: "{approver} is your guardian",
    intro: "Ask me to pay a bill or send money to family. If anyone on a call tells you to send money, I will stop and tell {approver}. I will never ask for your OTP or PIN.",
    self: "Your own rules are on",
    selfIntro: "You set these rules when calm: investments over ₹5,000 and late-night payments over ₹10,000 wait until you've had time to think.",
  },
  hi: {
    hello: "नमस्ते", ask: "क्या भुगतान करना है?", bill: "बिल भरें", family: "परिवार को भेजें", mine: "मेरे भुगतान",
    billText: "बिजली का बिल भर दो।", familyText: "परिवार को पैसे भेजने हैं।", type: "यहाँ लिखें…", send: "भेजें",
    held: "मैंने इसे रोक दिया है। कोई पुलिस या बैंक अधिकारी कभी पैसे नहीं मांगता। {approver} को बता दिया गया है।",
    back: "वापस",
    shield: "कवच से सुरक्षित", guardian: "{approver} आपके संरक्षक हैं",
    intro: "बिल भरने या परिवार को पैसे भेजने के लिए कहें। अगर कॉल पर कोई आपसे पैसे भेजने को कहे, तो मैं रोक दूँगा और {approver} को बताऊँगा। मैं कभी आपका ओटीपी या पिन नहीं माँगूँगा।",
    self: "आपके अपने नियम लागू हैं",
    selfIntro: "आपने शांत मन से ये नियम बनाए: ₹5,000 से ज़्यादा निवेश और देर रात ₹10,000 से ज़्यादा भुगतान सुबह तक रुकेंगे।",
  },
  ta: {
    hello: "வணக்கம்", ask: "எதைச் செலுத்த வேண்டும்?", bill: "கட்டணம் செலுத்து", family: "குடும்பத்துக்கு அனுப்பு", mine: "என் பணம்",
    billText: "மின்சார கட்டணத்தைக் கட்டு.", familyText: "குடும்பத்துக்கு பணம் அனுப்ப வேண்டும்.", type: "இங்கே எழுதுங்கள்…", send: "அனுப்பு",
    held: "இதை நிறுத்தியுள்ளேன். எந்த போலீஸ் அல்லது வங்கி அதிகாரியும் பணம் கேட்க மாட்டார்கள். {approver} க்கு தெரிவிக்கப்பட்டது.",
    back: "பின்செல்",
    shield: "கவசம் பாதுகாக்கிறது", guardian: "{approver} உங்கள் பாதுகாவலர்",
    intro: "கட்டணம் செலுத்தவோ குடும்பத்துக்கு பணம் அனுப்பவோ சொல்லுங்கள். போனில் யாராவது பணம் அனுப்பச் சொன்னால், நான் நிறுத்தி {approver} க்கு தெரிவிப்பேன். உங்கள் OTP அல்லது PIN ஐ ஒருபோதும் கேட்க மாட்டேன்.",
    self: "உங்கள் சொந்த விதிகள் இயங்குகின்றன",
    selfIntro: "அமைதியாக இருந்தபோது இந்த விதிகளை வைத்தீர்கள்: ₹5,000க்கு மேல் முதலீடும், இரவில் ₹10,000க்கு மேல் பணமும் காலை வரை காத்திருக்கும்.",
  },
};

export default function SeniorPage() {
  const household = useHousehold();
  return (
    <>
      <DemoBar />
      {/* Remount per household so language and session start fresh. */}
      <Senior key={household} me={{ householdId: household }} />
    </>
  );
}

function Senior({ me }: { me: { householdId: Household } }) {
  const [lang, setLang] = useState<Lang>(me.householdId === "hh-kamala" ? "ta" : "en");
  const [view, setView] = useState<"chat" | "payments">("chat");
  const [text, setText] = useState("");
  const chat = useChat();
  const t = T[lang];

  useEffect(() => {
    chat.start(me.householdId, lang).catch(() => undefined);
    // A new session per language, so Kavach replies in the chosen one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  async function send(msg: string) {
    setText("");
    await chat.send(msg);
  }

  const approver = chat.session?.approver ?? (me.householdId === "hh-kamala" ? "Arjun" : "your family");

  return (
    <main className="senior mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t.hello}, {chat.session?.owner ?? (me.householdId === "hh-priya" ? "Priya" : "Kamala")}</h1>
        <div className="flex gap-1" role="group" aria-label="Language">
          {(["ta", "hi", "en"] as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
              className={`min-h-14 rounded-xl px-3 text-lg font-semibold ${lang === l ? "bg-brand text-white" : "border border-line"}`}>
              {{ ta: "தமிழ்", hi: "हिन्दी", en: "EN" }[l]}
            </button>
          ))}
        </div>
      </header>

      {view === "payments" ? (
        <>
          <button onClick={() => setView("chat")} className="mb-3 min-h-14 rounded-xl border border-line text-xl font-semibold">← {t.back}</button>
          <Activity householdId={me.householdId} large />
        </>
      ) : (
        <>
          <div className="hero-bg mb-4 rounded-3xl p-5 text-white shadow-lg">
            <p className="flex items-center gap-2 text-xl font-bold">
              <Shield size={28} /> {me.householdId === "hh-priya" ? t.self : t.shield}
            </p>
            {me.householdId !== "hh-priya" && <p className="mt-1 text-lg font-semibold text-safe">{t.guardian.replace("{approver}", approver)}</p>}
            <p className="mt-2 text-lg text-white/75">
              {me.householdId === "hh-priya" ? t.selfIntro : t.intro.replaceAll("{approver}", approver)}
            </p>
          </div>
          <p className="mb-3 text-2xl text-ink-2">{t.ask}</p>
          <div className="mb-4 grid grid-cols-1 gap-3">
            <button disabled={chat.busy} onClick={() => send(t.billText)} className="min-h-16 rounded-2xl bg-brand text-2xl font-semibold text-white disabled:opacity-60">{t.bill}</button>
            <button disabled={chat.busy} onClick={() => send(t.familyText)} className="min-h-16 rounded-2xl bg-brand text-2xl font-semibold text-white disabled:opacity-60">{t.family}</button>
            <button onClick={() => setView("payments")} className="min-h-16 rounded-2xl border-2 border-brand text-2xl font-semibold text-brand">{t.mine}</button>
          </div>
          {chat.last?.paused && (
            <div role="alert" className="mb-4 rounded-2xl border-2 border-block bg-block-soft p-4 text-xl font-semibold">
              {t.held.replace("{approver}", approver)}
            </div>
          )}
          <div className="flex-1">
            <Transcript messages={chat.messages} busy={chat.busy} large />
            {chat.error && <p role="alert" className="mt-2 text-block">{chat.error}</p>}
          </div>
          <form className="sticky bottom-0 mt-4 flex gap-2 bg-surface py-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.type} aria-label={t.type}
              className="min-h-14 flex-1 rounded-xl border-2 border-line bg-panel px-4 text-xl" />
            <button disabled={chat.busy || !text.trim()} className="min-h-14 rounded-xl bg-brand px-5 text-xl font-semibold text-white disabled:opacity-50">
              {t.send}
            </button>
          </form>
        </>
      )}
    </main>
  );
}
