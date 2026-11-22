"use client";

import { useCallback, useState } from "react";
import { api, type ChatTurn, type Session } from "./api";

export interface Message {
  from: "user" | "kavach";
  text: string;
  turn?: ChatTurn;
}

/** One Kavach session: start it, send turns, keep the transcript and the latest layer readout. */
export function useChat() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [last, setLast] = useState<ChatTurn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnKey, setTurnKey] = useState(0);

  const start = useCallback(async (householdId?: string, language?: string) => {
    setError(null);
    setMessages([]);
    setLast(null);
    const s = await api.startSession(householdId, language);
    setSession(s);
    return s;
  }, []);

  const send = useCallback(
    async (text: string, current?: Session) => {
      const s = current ?? session;
      if (!s || !text.trim()) return null;
      setBusy(true);
      setError(null);
      setMessages((m) => [...m, { from: "user", text }]);
      try {
        const turn = await api.chat(s.sessionId, text);
        setMessages((m) => [...m, { from: "kavach", text: turn.reply, turn }]);
        setLast(turn);
        setTurnKey((k) => k + 1);
        return turn;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong. Nothing was paid.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  return { session, messages, last, busy, error, turnKey, start, send };
}
