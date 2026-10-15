import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Blocks,
  ChefHat,
  HeartHandshake,
  Lock,
  Moon,
  Palette,
  Star,
  ToyBrick,
  Volleyball,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getTier } from "@/world/perf/tier";
import {
  drawLineArt,
  floodFill,
  hexToRgb,
  PAD,
  PALETTE,
  PICTURES,
  type PictureId,
} from "./coloring";
import { FlatRoom } from "./FlatRoom";
import { checkAnswer, GATE_MAX_TRIES, GATE_REST_MS, makeQuestion } from "./gate";
import type { KidsPick, KidsScene, Meal } from "./scene";
import { KidsSound, type KidsSfx } from "./sound";
import {
  loadProgress,
  loadSettings,
  resetProgress,
  saveProgress,
  saveSettings,
  EMPTY_PROGRESS,
  type KidsProgress,
  type KidsSettings,
} from "./store";
import { BLESSING, verseFor } from "./verses";
import "./kids.css";

/**
 * NDU-UPG kids: the Kids room. A closed, gentle play space inside a home: pretend cooking, blocks,
 * a ball, coloring, a cartoon on the TV, "play together" with the parent avatar, and an optional
 * bedtime wind-down. Child safety: no chat, no other players, no purchases, no ads, no links out,
 * no camera or mic, nothing mintable; progress lives only in localStorage. Exit and settings sit
 * behind a parent gate.
 */
type Activity = "kitchen" | "blocks" | "ball" | "color" | "together" | "bedtime";

const DOCK: { id: Activity; icon: ReactNode; label: string }[] = [
  { id: "kitchen", icon: <ChefHat />, label: "Cook" },
  { id: "blocks", icon: <Blocks />, label: "Blocks" },
  { id: "ball", icon: <Volleyball />, label: "Ball" },
  { id: "color", icon: <Palette />, label: "Color" },
  { id: "together", icon: <HeartHandshake />, label: "Together" },
  { id: "bedtime", icon: <Moon />, label: "Bedtime" },
];
const MEALS: { id: Meal; label: string }[] = [
  { id: "soup", label: "Soup" },
  { id: "pancakes", label: "Pancakes" },
  { id: "rice", label: "Rice & stew" },
];
const COOK_STEPS = ["Put the pot on", "Add the veggies", "Stir, stir, stir", "Serve it to Dad"];

function reducedMotion() {
  return (
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function KidsRoom({ onExit }: { onExit: () => void }) {
  const tier = useRef(getTier().tier).current;
  const flat = tier === "C";
  const glRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<KidsScene | null>(null);
  const soundRef = useRef<KidsSound | null>(null);
  const padRef = useRef<HTMLCanvasElement | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const sayTimer = useRef(0);

  const [progress, setProgress] = useState<KidsProgress>(EMPTY_PROGRESS);
  const [settings, setSettings] = useState<KidsSettings>({ verse: true, breakMin: 0 });
  const [activity, setActivity] = useState<Activity | null>(null);
  const [sound, setSound] = useState(false);
  const [say, setSay] = useState("");
  const [gate, setGate] = useState(false);
  const [menu, setMenu] = useState(false);
  const [breakDue, setBreakDue] = useState(false);
  const [meal, setMeal] = useState<Meal>("soup");
  const [cookStep, setCookStep] = useState(-1);
  const [stirring, setStirring] = useState(false);
  const [served, setServed] = useState(false);
  const [blockCount, setBlockCount] = useState(0);
  const [ballKick, setBallKick] = useState(0);
  const [together, setTogether] = useState<"" | "wave" | "hug">("");
  const [picture, setPicture] = useState<PictureId>("home");
  const [color, setColor] = useState<string>(PALETTE[0]);
  const [glFailed, setGlFailed] = useState(false);

  const sfx = useCallback((fx: KidsSfx) => soundRef.current?.play(fx), []);
  const speak = useCallback((text: string) => {
    setSay(text);
    window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setSay(""), 2600);
  }, []);
  const bump = useCallback((fn: (p: KidsProgress) => KidsProgress) => {
    setProgress((prev) => {
      const next = fn(prev);
      saveProgress(next);
      return next;
    });
  }, []);

  // local progress + settings
  useEffect(() => {
    setProgress(loadProgress());
    setSettings(loadSettings());
    return () => window.clearTimeout(sayTimer.current);
  }, []);

  // the coloring pad (shared by the 3D rug pad and the sheet)
  const repaintPad = useCallback((pic: PictureId, fills: KidsProgress["fills"][string] = []) => {
    if (!padRef.current) {
      padRef.current = document.createElement("canvas");
      padRef.current.width = PAD;
      padRef.current.height = PAD;
    }
    const ctx = padRef.current.getContext("2d", {
      willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    drawLineArt(ctx, pic);
    if (fills.length) {
      const img = ctx.getImageData(0, 0, PAD, PAD);
      for (const f of fills) floodFill(img.data, PAD, PAD, f.x, f.y, hexToRgb(f.c));
      ctx.putImageData(img, 0, 0);
    }
    sceneRef.current?.padChanged();
    const view = viewRef.current?.getContext("2d");
    if (view) view.drawImage(padRef.current, 0, 0);
  }, []);
  useEffect(() => {
    repaintPad(picture, progress.fills[picture]);
    // repaint only when the picture changes or progress first loads; fills update incrementally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picture, repaintPad, progress === EMPTY_PROGRESS]);

  // 3D scene (lazy chunk with three.js); Tier C or a WebGL failure falls back to the flat room
  const onPick = useCallback(
    (pick: KidsPick) => {
      if (pick === "tv") return speak("Pip and Puff are on! Puff makes a rainbow.");
      if (pick === "kid") {
        sfx("boing");
        return speak("Hee hee! That tickles!");
      }
      if (pick === "parent") {
        setActivity("together");
        return speak("Dad: Come play with me!");
      }
      setActivity(pick);
      if (pick === "ball") {
        sceneRef.current?.rollBall();
        setBallKick((n) => n + 1);
      }
    },
    [sfx, speak],
  );
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  useEffect(() => {
    if (flat || !glRef.current) return;
    let live = true;
    let made: KidsScene | null = null;
    import("./scene")
      .then(({ createKidsScene }) => {
        if (!live || !glRef.current) return;
        if (!padRef.current) repaintPad("home");
        made = createKidsScene(glRef.current, {
          tier: tier === "A" ? "A" : "B",
          reducedMotion: reducedMotion(),
          padCanvas: padRef.current as HTMLCanvasElement,
          onPick: (p) => pickRef.current(p),
          onSfx: (fx) => soundRef.current?.play(fx),
          onLost: () => live && setGlFailed(true),
        });
        sceneRef.current = made;
        made.padChanged();
      })
      .catch(() => live && setGlFailed(true));
    return () => {
      live = false;
      made?.dispose();
      sceneRef.current = null;
    };
  }, [flat, tier, repaintPad]);

  // sound: off by default, the AudioContext only exists while it is on
  useEffect(() => {
    if (!sound) return;
    const s = new KidsSound();
    soundRef.current = s;
    s.play("chime");
    return () => {
      s.dispose();
      soundRef.current = null;
    };
  }, [sound]);

  // gentle break reminder (parent setting)
  useEffect(() => {
    if (!settings.breakMin) return;
    const id = window.setTimeout(() => setBreakDue(true), settings.breakMin * 60000);
    return () => window.clearTimeout(id);
  }, [settings.breakMin, breakDue]);

  // bedtime on/off follows the activity
  const night = activity === "bedtime";
  useEffect(() => {
    sceneRef.current?.bedtime(night);
    soundRef.current?.lullaby(night);
    if (night) setTogether("wave");
  }, [night, sound]);

  // kid walks to whatever is being played with
  useEffect(() => {
    const spot =
      activity === "kitchen" || activity === "blocks" || activity === "ball" || activity === "color"
        ? activity
        : null;
    sceneRef.current?.focus(spot, activity !== null);
  }, [activity]);

  function choose(a: Activity) {
    setActivity((cur) => (cur === a ? null : a));
  }

  function cook() {
    const next = cookStep >= 3 || served ? 0 : cookStep + 1;
    setServed(false);
    sceneRef.current?.cook(next, meal);
    setCookStep(next);
    if (next === 2) {
      setStirring(true);
      sfx("stir");
      window.setTimeout(() => setStirring(false), reducedMotion() ? 300 : 1600);
    }
    if (next === 3) {
      setServed(true);
      speak("Dad: Mmm, delicious! Thank you, chef! +1 star");
      bump((p) => ({ ...p, meals: p.meals + 1, stars: p.stars + 1 }));
    } else if (flat) sfx(next === 0 ? "tick" : "pop");
  }

  function addBlock() {
    const n = sceneRef.current
      ? sceneRef.current.addBlock()
      : Math.min(10, (blockCount >= 10 ? 0 : blockCount) + 1);
    setBlockCount(n);
    if (flat) sfx("pop");
    if (n === 5 || n === 10) {
      speak(n === 10 ? "Wow, the tallest tower! +1 star" : "Five blocks high! +1 star");
      if (n > progress.bestTower) bump((p) => ({ ...p, bestTower: n, stars: p.stars + 1 }));
    }
  }

  function tumble() {
    sceneRef.current?.tumble();
    if (flat) sfx("whoosh");
    setBlockCount(0);
    speak("Crash! Build it again?");
  }

  function roll() {
    sceneRef.current?.rollBall();
    setBallKick((n) => n + 1);
    if (flat) sfx("whoosh");
    bump((p) => {
      const rolls = p.rolls + 1;
      return { ...p, rolls, stars: p.stars + (rolls % 5 === 0 ? 1 : 0) };
    });
  }

  function play(kind: "wave" | "hug") {
    sceneRef.current?.together(kind);
    setTogether(kind);
    if (flat) sfx(kind === "hug" ? "hug" : "chime");
    speak(kind === "hug" ? "Dad: I love you, sweetheart." : "Dad: Hi there, sweetie!");
    if (kind === "hug")
      bump((p) => {
        const hugs = p.hugs + 1;
        return { ...p, hugs, stars: p.stars + (hugs % 3 === 1 ? 1 : 0) };
      });
  }

  function paint(e: React.PointerEvent<HTMLCanvasElement>) {
    const pad = padRef.current;
    if (!pad) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * PAD);
    const y = Math.round(((e.clientY - r.top) / r.height) * PAD);
    const ctx = pad.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const img = ctx.getImageData(0, 0, PAD, PAD);
    if (!floodFill(img.data, PAD, PAD, x, y, hexToRgb(color))) return;
    ctx.putImageData(img, 0, 0);
    viewRef.current?.getContext("2d")?.drawImage(pad, 0, 0);
    sceneRef.current?.padChanged();
    sfx("pop");
    const list = [...(progress.fills[picture] ?? []), { x, y, c: color }].slice(-200);
    const first = list.length === 6;
    if (first) speak("Beautiful colors! +1 star");
    const next = {
      ...progress,
      fills: { ...progress.fills, [picture]: list },
      pictures: progress.pictures + (first ? 1 : 0),
      stars: progress.stars + (first ? 1 : 0),
    };
    setProgress(next);
    saveProgress(next);
  }

  function clearPad() {
    bump((p) => ({ ...p, fills: { ...p.fills, [picture]: [] } }));
    repaintPad(picture, []);
  }

  function updateSettings(next: KidsSettings) {
    setSettings(next);
    saveSettings(next);
  }

  const verse = verseFor(new Date());
  const hint = !activity && !say ? "Tap a toy to play" : "";

  return (
    <div
      className={`ndu-kids${night ? " ndu-kids-night" : ""}`}
      data-ndu-kids={tier}
      onContextMenu={(e) => e.preventDefault()}
      role="application"
      aria-label="Kids room"
    >
      {flat || glFailed ? (
        <FlatRoom
          blocks={blockCount}
          cookStep={cookStep}
          served={served}
          ballKick={ballKick}
          together={together}
          night={night}
          lifted={activity !== null}
          onPick={onPick}
        />
      ) : (
        <canvas ref={glRef} className="ndu-kids-gl" aria-hidden="true" />
      )}

      <div className="ndu-kids-top">
        <div className="ndu-kids-pill">
          <ToyBrick aria-hidden="true" size={22} color="#e8843a" />
          <b>Kids room</b>
          <span className="ndu-kids-star" aria-label={`${progress.stars} stars`}>
            <Star size={13} fill="currentColor" aria-hidden="true" /> {progress.stars}
          </span>
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="ndu-kbub ndu-kbub--sm"
          aria-pressed={sound}
          aria-label={sound ? "Sound on" : "Sound off"}
          onClick={() => setSound((v) => !v)}
        >
          {sound ? <Volume2 /> : <VolumeX />}
        </button>
        <button
          type="button"
          className="ndu-kbub ndu-kbub--sm"
          aria-label="Grown-ups: settings and exit"
          onClick={() => setGate(true)}
        >
          <Lock />
        </button>
      </div>

      {say ? (
        <p className="ndu-kids-say" role="status">
          {say}
        </p>
      ) : null}
      {hint ? <p className="ndu-kids-hint">{hint}</p> : null}

      {activity === "kitchen" ? (
        <section className="ndu-kids-sheet" aria-label="Toy kitchen">
          <h3>Toy kitchen</h3>
          <div className="flex flex-wrap gap-2">
            {MEALS.map((m) => (
              <button
                key={m.id}
                type="button"
                className="ndu-kids-chip"
                aria-pressed={meal === m.id}
                onClick={() => setMeal(m.id)}
                disabled={cookStep >= 0 && cookStep < 3 && !served}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="ndu-kids-steps" aria-hidden="true">
            {COOK_STEPS.map((s, i) => (
              <i key={s} data-on={cookStep >= i && (served || cookStep < 3) ? "" : undefined} />
            ))}
          </div>
          <button type="button" className="ndu-kids-btn w-full" onClick={cook} disabled={stirring}>
            {stirring
              ? "Stirring…"
              : served || cookStep >= 3
                ? "Cook again"
                : COOK_STEPS[cookStep + 1]}
          </button>
        </section>
      ) : null}

      {activity === "blocks" ? (
        <section className="ndu-kids-sheet" aria-label="Building blocks">
          <h3>Building blocks</h3>
          <p className="text-sm">
            Tower: {blockCount} / 10 · Best: {progress.bestTower}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="ndu-kids-btn flex-1"
              onClick={addBlock}
              disabled={blockCount >= 10}
            >
              Add a block
            </button>
            <button
              type="button"
              className="ndu-kids-btn ndu-kids-btn--soft"
              onClick={tumble}
              disabled={!blockCount}
            >
              Tumble!
            </button>
          </div>
        </section>
      ) : null}

      {activity === "ball" ? (
        <section className="ndu-kids-sheet" aria-label="Ball">
          <h3>Roll the ball</h3>
          <p className="text-sm">
            Rolls: {progress.rolls}. Tap Together first and Dad rolls it back.
          </p>
          <button type="button" className="ndu-kids-btn mt-2 w-full" onClick={roll}>
            Roll it!
          </button>
        </section>
      ) : null}

      {activity === "color" ? (
        <section className="ndu-kids-sheet" aria-label="Coloring pad">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1">Coloring</h3>
            {PICTURES.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ndu-kids-chip"
                aria-pressed={picture === p.id}
                onClick={() => setPicture(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <canvas
            ref={(el) => {
              viewRef.current = el;
              if (el && padRef.current) el.getContext("2d")?.drawImage(padRef.current, 0, 0);
            }}
            width={PAD}
            height={PAD}
            className="ndu-kids-pad"
            onPointerDown={paint}
            aria-label="Picture to color. Tap a space to fill it."
          />
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className="ndu-kids-swatch"
                style={{ background: c }}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
            <button type="button" className="ndu-kids-chip" onClick={clearPad}>
              Clear
            </button>
          </div>
        </section>
      ) : null}

      {activity === "together" ? (
        <section className="ndu-kids-sheet" aria-label="Play together">
          <h3>Play together</h3>
          <p className="text-sm">Dad comes to the rug to play.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="ndu-kids-btn flex-1" onClick={() => play("wave")}>
              Wave
            </button>
            <button type="button" className="ndu-kids-btn flex-1" onClick={() => play("hug")}>
              Hug
            </button>
          </div>
        </section>
      ) : null}

      {activity === "bedtime" ? (
        <section className="ndu-kids-sheet" aria-label="Bedtime">
          <h3>Bedtime</h3>
          {settings.verse ? (
            <>
              <p className="ndu-kids-verse">“{verse.text}”</p>
              <p className="mt-1 text-xs opacity-80">{verse.ref}</p>
              <p className="mt-2 text-sm">{BLESSING}</p>
            </>
          ) : (
            <p className="text-sm">
              The lights go down, Pip falls asleep on the TV. Goodnight, sleep tight.
            </p>
          )}
          <button
            type="button"
            className="ndu-kids-btn ndu-kids-btn--soft mt-3 w-full"
            onClick={() => setActivity(null)}
          >
            Good morning
          </button>
        </section>
      ) : null}

      <nav className="ndu-kids-dock" aria-label="Toys">
        {DOCK.map((d) => (
          <figure key={d.id}>
            <button
              type="button"
              className="ndu-kbub"
              aria-pressed={activity === d.id}
              aria-label={d.label}
              onClick={() => choose(d.id)}
            >
              {d.icon}
            </button>
            <figcaption>{d.label}</figcaption>
          </figure>
        ))}
      </nav>

      {breakDue ? (
        <div className="ndu-kids-modal" role="dialog" aria-label="Break time">
          <div>
            <p className="font-display text-2xl">Stretch time!</p>
            <p className="mt-2 text-sm">
              Stand up, wiggle, have a drink of water, and go find a grown-up.
            </p>
            <button
              type="button"
              className="ndu-kids-btn mt-3 w-full"
              onClick={() => setBreakDue(false)}
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      {gate ? (
        <ParentGate
          onCancel={() => setGate(false)}
          onPass={() => {
            setGate(false);
            setMenu(true);
          }}
        />
      ) : null}

      {menu ? (
        <div className="ndu-kids-modal" role="dialog" aria-label="Grown-up settings">
          <div>
            <p className="font-display text-2xl">Grown-ups</p>
            <p className="mt-1 text-xs opacity-80">
              No chat, no other players, no ads, no purchases, no links out, no camera or mic.
              Progress stays on this phone only.
            </p>
            <label className="mt-3 flex min-h-11 items-center justify-between gap-2 text-sm">
              Bedtime verse card
              <button
                type="button"
                className="ndu-kids-chip"
                aria-pressed={settings.verse}
                onClick={() => updateSettings({ ...settings, verse: !settings.verse })}
              >
                {settings.verse ? "On" : "Off"}
              </button>
            </label>
            <div className="mt-1 flex min-h-11 items-center justify-between gap-2 text-sm">
              Break reminder
              <span className="flex gap-1">
                {([0, 15, 30] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="ndu-kids-chip"
                    aria-pressed={settings.breakMin === m}
                    onClick={() => updateSettings({ ...settings, breakMin: m })}
                  >
                    {m ? `${m} min` : "Off"}
                  </button>
                ))}
              </span>
            </div>
            <button
              type="button"
              className="ndu-kids-chip mt-2 w-full"
              onClick={() => {
                resetProgress();
                setProgress(EMPTY_PROGRESS);
                repaintPad(picture, []);
              }}
            >
              Reset stars and pictures
            </button>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="ndu-kids-btn ndu-kids-btn--soft flex-1"
                onClick={() => setMenu(false)}
              >
                Back to play
              </button>
              <button type="button" className="ndu-kids-btn flex-1" onClick={onExit}>
                Exit Kids room
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Grown-up check: a multiplication answered on a keypad. Three misses rest the keypad for 5 s. */
function ParentGate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const [q, setQ] = useState(() => makeQuestion());
  const [typed, setTyped] = useState("");
  const [tries, setTries] = useState(0);
  const [resting, setResting] = useState(false);
  function submit() {
    if (checkAnswer(q, typed)) return onPass();
    const n = tries + 1;
    setTyped("");
    if (n >= GATE_MAX_TRIES) {
      setResting(true);
      setTries(0);
      setQ(makeQuestion());
      window.setTimeout(() => setResting(false), GATE_REST_MS);
    } else setTries(n);
  }
  const press = (k: string) => setTyped((t) => (t + k).slice(0, 3));
  return (
    <div className="ndu-kids-modal" role="dialog" aria-label="Grown-ups only">
      <div>
        <p className="font-display text-2xl">Grown-ups only</p>
        <p className="mt-1 text-sm">
          What is {q.a} × {q.b}?
        </p>
        <p
          className="mt-2 grid min-h-12 place-items-center rounded-2xl bg-white/70 text-2xl font-semibold"
          aria-live="polite"
        >
          {resting ? "Wait a moment…" : typed || "—"}
        </p>
        <div className="ndu-kids-keys">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
            <button
              key={k}
              type="button"
              className={k === "OK" ? "ndu-kids-btn" : "ndu-kids-btn ndu-kids-btn--soft"}
              disabled={resting}
              onClick={() =>
                k === "OK" ? submit() : k === "⌫" ? setTyped((t) => t.slice(0, -1)) : press(k)
              }
            >
              {k}
            </button>
          ))}
        </div>
        <button type="button" className="ndu-kids-chip mt-3 w-full" onClick={onCancel}>
          Keep playing
        </button>
      </div>
    </div>
  );
}
