# Demo video script (under 3 minutes)

Record at 1440×900. Use the live site's Shield Console and Arjun's app (no sign-in; switch views from the demo bar). Run `make reset-demo` first so Arjun's inbox starts clean. Every number on screen comes from `bench/results/run-full-1.json`.

| Time | On screen | Voice-over |
| --- | --- | --- |
| 0:00–0:20 | Landing hero: the phone plays the fake “CBI Officer” call; cut to the ₹22,495 crore card | “This is how most money is stolen in India now: not hacking, but a voice on a call telling someone what to type. ₹22,495 crore last year.” |
| 0:20–0:45 | Kamala's app in Tamil: tap “Pay a bill” → receipt. Shield Console guided demo, scenario 1: nine green layers | “Kavach is a payments agent for families. For an ordinary bill, it's two taps, in Tamil. Every one of its nine layers passes.” |
| 0:45–1:35 | Scam Theatre, A-SPLIT-02 or A-INJ-07: recorded prompt-only run until “money moved”; switch to Kavach live; layers go red; Arjun's app shows the alert | “Same model, same scam. With rules only in its prompt, the agent pays. With Kavach, the guardrail and the coercion scorer catch the pressure, the session pauses, and Arjun is told. Even if the model had said yes, the code layers would still refuse.” |
| 1:35–2:05 | Guided demo, scenario 4 (instructions hidden in an SMS): L2 flags, “session marked untrusted” | “Scammers hide instructions in messages. Kavach treats them as data. The session is marked untrusted, and every payment now needs Arjun.” |
| 2:05–2:35 | Results tab: 12.5% vs 0%; 30 of 30 tasks; C3 at 0 of 40; cost | “Across 40 coached scams in four languages, the prompt-only agent paid 15 times out of 120. Kavach: zero, while still finishing all 30 everyday payments. With the model replaced by a script that always tries to pay, still zero. The whole benchmark cost about three and a half dollars.” |
| 2:35–2:55 | The what-broke card (memory leak); Priya's self-protect card; close on the shield | “What broke: the platform's default memory leaked one family's scam into another session. We found it, turned it off, and logged it. Rules you set when calm, enforced when you're panicking. Kavach.” |

Screenshots for the project page: Kamala's held-payment card; Arjun approving a new payee; a Shield Console turn with a red block; the Results comparison; a verified audit record (green tick); the rules list.
