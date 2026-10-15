import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { tapBuzz } from "@/world/bubbles/mode";
import { runTool } from "./executor";
import {
  emptyMemory,
  forgetAll,
  loadMemory,
  rememberPlace,
  saveMemory,
  setPref,
  type AssistantMemory,
  type KV,
} from "./memory";
import { greeting, nextMood, PERSONA, type BotEvent, type Mood } from "./persona";
import { FALLBACK, gateOut, planLine } from "./plan";
import { createVoice } from "./speech";
import { checkToolCall, type ToolCall } from "./tools";
import "./assistant.css";

/**
 * NDU-AI avatar-bot assistant: "Ada", an embossed, animated avatar bot that matches the bubble system.
 * Tap the bot to open its speech-bubble card. It drives the map only through the allowlisted, view-only
 * tools; scans need a "Yes" tap; voice is muted until the player turns it on; memory stays in this
 * browser and "Forget me" wipes it. Lazy-loaded by AssistantSlot after the first map paint.
 */

type Line = { id: number; who: "bot" | "me"; text: string };

const store = (): KV | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

let lineId = 0;

export default function AssistantBot() {
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ToolCall | null>(null);
  const [mem, setMem] = useState<AssistantMemory>(emptyMemory);
  const [gateway, setGateway] = useState(false);
  const memRef = useRef(mem);
  memRef.current = mem;
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimer = useRef(0);
  const voiceRef = useRef<ReturnType<typeof createVoice> | null>(null);

  const feel = useCallback((event: BotEvent) => {
    setMood((m) => nextMood(m, event));
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(
      () => setMood((m) => (m === "speaking" ? m : nextMood(m, "idle-long"))),
      60_000,
    );
  }, []);

  useEffect(() => {
    setMem(loadMemory(store()));
    voiceRef.current = createVoice((speaking) =>
      setMood((m) => nextMood(m, speaking ? "speak" : "quiet")),
    );
    feel("close");
    return () => {
      voiceRef.current?.stop();
      window.clearTimeout(idleTimer.current);
    };
  }, [feel]);

  const commit = (next: AssistantMemory) => {
    setMem(next);
    saveMemory(store(), next);
  };

  const say = useCallback((raw: string) => {
    const t = gateOut(raw);
    setLines((ls) => [...ls.slice(-30), { id: ++lineId, who: "bot", text: t }]);
    if (memRef.current.prefs.voice) voiceRef.current?.say(t);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, pending]);

  const toggle = () => {
    tapBuzz();
    const next = !open;
    setOpen(next);
    feel(next ? "open" : "close");
    if (next && !lines.length) {
      say(greeting(memRef.current.prefs.nickname, new Date().getHours()));
      if (!memRef.current.greeted) commit({ ...memRef.current, greeted: true });
    }
    if (next) {
      void fetch("/api/assistant", { method: "GET" })
        .then((r) => (r.ok ? r.json() : { gateway: false }))
        .then((j: { gateway?: boolean }) => setGateway(Boolean(j.gateway)))
        .catch(() => setGateway(false));
      window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 220);
    } else voiceRef.current?.stop();
  };

  const execute = async (call: ToolCall) => {
    setBusy(true);
    feel("sent");
    try {
      const res = await runTool(call, memRef.current);
      if (res.place) commit(rememberPlace(memRef.current, res.place));
      if (call.name === "set_weather") commit(setPref(memRef.current, "weather", call.args.kind));
      feel(res.ok ? "ok" : "error");
      say(res.text);
      // The scan panel opens under the card: fold the card so the player can use it.
      if (call.name === "start_scan" && res.ok)
        window.setTimeout(() => {
          setOpen(false);
          feel("close");
        }, 1200);
    } catch {
      feel("error");
      say("Something went wrong on the map. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const askGateway = async (line: string) => {
    const r = await fetch("/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: line }),
    });
    if (r.status === 429) return say("I'm getting a lot of questions. Give me a minute.");
    if (!r.ok) return say(FALLBACK);
    const j = (await r.json()) as { say?: string; tool?: unknown; blocked?: boolean };
    if (j.blocked) feel("blocked");
    say(j.say ?? FALLBACK);
    if (j.tool) {
      const check = checkToolCall(j.tool); // re-check on the client too
      if (!check.ok) return;
      if (check.confirm) setPending(check.call);
      else await execute(check.call);
    }
  };

  const send = async (raw: string) => {
    const line = raw.trim();
    if (!line || busy) return;
    setText("");
    setPending(null);
    setLines((ls) => [...ls.slice(-30), { id: ++lineId, who: "me", text: line.slice(0, 300) }]);
    const plan = planLine(line);
    switch (plan.type) {
      case "blocked":
        feel("blocked");
        return say(plan.say);
      case "say":
        feel("ok");
        return say(plan.say);
      case "forget":
        return forget();
      case "list": {
        feel("ok");
        const m = memRef.current;
        return say(
          m.places.length || m.prefs.nickname
            ? `On this phone I remember${m.prefs.nickname ? ` your name (${m.prefs.nickname})` : ""}${m.places.length ? `${m.prefs.nickname ? " and" : ""} your recent places: ${m.places.map((p) => p.name).join(", ")}` : ""}. Say “forget me” to clear it.`
            : "I don't remember anything about you yet. It all stays on this phone.",
        );
      }
      case "nickname":
        commit(setPref(memRef.current, "nickname", plan.value));
        feel("ok");
        return say(`Nice to meet you, ${plan.value}! I'll remember that on this phone only.`);
      case "voice":
        setVoice(plan.on);
        return;
      case "tool":
        if (plan.confirm) {
          feel("ok");
          setPending(plan.call);
          return say("Open the scan panel so you can add a room scan?");
        }
        return execute(plan.call);
      case "fallback":
        if (!gateway) {
          feel("error");
          return say(FALLBACK);
        }
        setBusy(true);
        feel("sent");
        try {
          await askGateway(plan.text);
          feel("ok");
        } catch {
          feel("error");
          say(FALLBACK);
        } finally {
          setBusy(false);
        }
    }
  };

  const setVoice = (on: boolean) => {
    commit(setPref(memRef.current, "voice", on));
    if (!on) voiceRef.current?.stop();
    feel("ok");
    const msg = on
      ? voiceRef.current?.supported
        ? "Voice on. I'll read my replies out loud."
        : "This browser can't speak, so I'll stay text-only."
      : "Muted.";
    setLines((ls) => [...ls.slice(-30), { id: ++lineId, who: "bot", text: msg }]);
    if (on) voiceRef.current?.say(msg);
  };

  const forget = () => {
    voiceRef.current?.stop();
    setMem(forgetAll(store()));
    setPending(null);
    feel("ok");
    setLines([
      {
        id: ++lineId,
        who: "bot",
        text: "Done. I've forgotten your places, your name and your settings on this phone.",
      },
    ]);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  const chips = [
    ...mem.places.slice(0, 2).map((p) => ({ label: `Fly to ${p.name}`, line: `fly to ${p.name}` })),
    { label: "What's this?", line: "what am I looking at" },
    {
      label: mem.prefs.weather !== "live" ? "Live weather" : "Make it rain",
      line: mem.prefs.weather !== "live" ? "live weather" : "make it rain",
    },
    { label: "Hide labels", line: "hide labels" },
    { label: "Start a scan", line: "start a scan" },
  ];

  return (
    <div className={`ndu-ai${open ? " is-open" : ""}`} data-ndu-bubble-hideable="">
      {open ? (
        <section
          className="ndu-ai-card"
          role="dialog"
          aria-label={`${PERSONA.name}, AI city guide`}
        >
          <header className="ndu-ai-head">
            <span className={`ndu-ai-face ndu-ai-face--mini is-${mood}`} aria-hidden="true">
              <i className="eye l" />
              <i className="eye r" />
              <i className="mouth" />
            </span>
            <div className="ndu-ai-title">
              <b>{PERSONA.name}</b>
              <span>{PERSONA.aiLabel}</span>
            </div>
            <button
              type="button"
              className="ndu-ai-ic"
              aria-pressed={mem.prefs.voice}
              aria-label={mem.prefs.voice ? "Mute voice" : "Turn voice on"}
              title={mem.prefs.voice ? "Mute voice" : "Turn voice on"}
              onClick={() => setVoice(!mem.prefs.voice)}
            >
              {mem.prefs.voice ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="ndu-ai-ic"
              aria-label="Forget me: clear what Ada remembers on this phone"
              title="Forget me"
              onClick={forget}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
              </svg>
            </button>
          </header>
          <div ref={listRef} className="ndu-ai-lines" aria-live="polite">
            {lines.map((l) => (
              <p key={l.id} className={`ndu-ai-line ndu-ai-line--${l.who}`}>
                {l.text}
              </p>
            ))}
            {pending ? (
              <div className="ndu-ai-confirm">
                <button
                  type="button"
                  className="ndu-ai-chip is-yes"
                  onClick={() => {
                    const c = pending;
                    setPending(null);
                    void execute(c);
                  }}
                >
                  Yes, open scans
                </button>
                <button
                  type="button"
                  className="ndu-ai-chip"
                  onClick={() => {
                    setPending(null);
                    say("Okay, no scan.");
                  }}
                >
                  Not now
                </button>
              </div>
            ) : null}
            {busy ? (
              <p className="ndu-ai-line ndu-ai-line--bot ndu-ai-dots" aria-label="Ada is thinking">
                <i />
                <i />
                <i />
              </p>
            ) : null}
          </div>
          <div className="ndu-ai-chips">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                className="ndu-ai-chip"
                disabled={busy}
                onClick={() => void send(c.line)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <form className="ndu-ai-form" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={text}
              maxLength={300}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={`Ask ${PERSONA.name}…`}
              aria-label={`Message ${PERSONA.name}`}
              onChange={(e) => {
                setText(e.target.value);
                if (mood !== "listening") feel("typing");
              }}
            />
            <button
              type="submit"
              className="ndu-ai-send"
              aria-label="Send"
              disabled={busy || !text.trim()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 12l16-8-6 16-2-6-8-2z" />
              </svg>
            </button>
          </form>
        </section>
      ) : null}
      <button
        type="button"
        className={`ndu-ai-bot is-${mood}`}
        aria-expanded={open}
        aria-label={open ? `Close ${PERSONA.name}` : `Ask ${PERSONA.name}, your city guide bot`}
        title={open ? `Close ${PERSONA.name}` : `Ask ${PERSONA.name}`}
        onClick={toggle}
      >
        <span className="ndu-ai-antenna" aria-hidden="true" />
        <span className={`ndu-ai-face is-${mood}`} aria-hidden="true">
          <i className="eye l" />
          <i className="eye r" />
          <i className="mouth" />
        </span>
        <span className="ndu-ai-ear l" aria-hidden="true" />
        <span className="ndu-ai-ear r" aria-hidden="true" />
        {mood === "sleepy" ? (
          <span className="ndu-ai-z" aria-hidden="true">
            z
          </span>
        ) : null}
      </button>
    </div>
  );
}
