import { Shield } from "@/components/Shield";

const BUILT_WITH = [
  "AgentCore harness", "AgentCore Gateway", "AgentCore Policy (Cedar)", "Bedrock Guardrails", "Nova 2 Lite", "Nova Micro",
  "Step Functions", "KMS", "S3 Object Lock", "DynamoDB",
];

const COLUMNS = [
  { title: "Explore", links: [
    ["How it works", "/#how"], ["See it decide", "/#scenarios"], ["Where it fits", "/#fits"], ["Benchmark", "/benchmark/"], ["What broke", "/what-broke/"],
    ["Architecture", "/architecture.svg"], ["Raw results (JSON)", "/data/raw/run-full-1.json"],
    ["Source code (GitHub)", "https://github.com/Poobalan1210/kavach"],
  ] },
  { title: "Live demo", links: [
    ["Shield Console", "/console/"], ["Kamala's phone", "/senior/"], ["Priya's phone", "/senior/?household=hh-priya"], ["Arjun's app", "/approver/"],
  ] },
];

export function SiteFooter() {
  return (
    <footer className="bg-navy-950 text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2.5 text-lg font-extrabold"><Shield size={26} /> Kavach</p>
          <p className="mt-3 max-w-sm text-sm text-white/55">Rules you set when calm, enforced when you are panicking. Built on Amazon Bedrock AgentCore with Amazon Nova models.</p>
          <div className="mt-5 flex flex-wrap gap-1.5">
            {BUILT_WITH.map((t) => <span key={t} className="rounded-full border border-white/15 px-2.5 py-0.5 text-xs text-white/60">{t}</span>)}
          </div>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title} className="text-sm">
            <p className="font-bold text-white/80">{c.title}</p>
            <ul className="mt-3 space-y-2 text-white/55">
              {c.links.map(([label, href]) => <li key={href}><a className="hover:text-white" href={href}>{label}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-white/40">Mock payments only · not a bank · built for the “Agents, Your Rules” hackathon</p>
      </div>
    </footer>
  );
}
