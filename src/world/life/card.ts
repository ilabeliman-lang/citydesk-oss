import { getUiMode, tapBuzz } from "@/world/bubbles/mode";

/**
 * NDU-UPG life (#204 #266 #296): what a tapped walker or vehicle shows. Fits the bubble UI
 * (src/world/bubbles): in "bubbles" mode it first pops a small embossed name bubble over the agent
 * (a 12-char name plate, #296) that unfolds into the talk card on tap and folds back on a second tap;
 * `?ui=classic` shows the card straight away. Follows the agent; closes on x / Escape / a tap
 * elsewhere / after 9 s folded (16 s open). Plain DOM, honours prefers-reduced-motion.
 */

const CSS = `
.ndu-life-pin{position:absolute;left:0;top:0;z-index:15;pointer-events:auto;will-change:transform}
.ndu-life-card{position:relative;max-width:min(15rem,70vw);min-width:10.5rem;
 padding:9px 10px 10px 12px;border-radius:18px;color:#f6efe2;font:500 12px/1.35 system-ui,sans-serif;
 background:linear-gradient(150deg,#3a3027 0%,#2c241c 55%,#241d17 100%);border:1px solid rgba(246,239,226,.1);
 box-shadow:0 5px 0 rgba(0,0,0,.42),0 14px 28px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.14),inset 0 -3px 0 rgba(0,0,0,.3);
 transform-origin:50% 100%;animation:ndu-life-pop .26s cubic-bezier(.2,.9,.3,1.25) both}
.ndu-life-card::after{content:"";position:absolute;left:50%;bottom:-7px;width:14px;height:14px;margin-left:-7px;transform:rotate(45deg);
 background:#262019;border-right:1px solid rgba(246,239,226,.1);border-bottom:1px solid rgba(246,239,226,.1);box-shadow:3px 3px 0 rgba(0,0,0,.25)}
.ndu-life-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.ndu-life-dot{flex:none;width:14px;height:14px;border-radius:999px;box-shadow:inset 0 -2px 3px rgba(0,0,0,.4),0 0 0 2px rgba(246,239,226,.18)}
.ndu-life-title{flex:1;min-width:0;font-weight:700;font-size:12px;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ndu-life-x{flex:none;width:44px;height:44px;margin:-10px -8px -10px 0;border:0;border-radius:999px;background:transparent;color:inherit;font:700 18px/1 sans-serif;display:grid;place-items:center;cursor:pointer}
.ndu-life-x span{width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:linear-gradient(180deg,#3d3229,#2c241c);
 box-shadow:0 3px 0 #0f0c09,inset 0 1px 0 rgba(255,255,255,.14);transition:transform .09s,box-shadow .09s}
.ndu-life-x:active span{transform:translateY(2px);box-shadow:0 1px 0 #0f0c09}
.ndu-life-x:focus-visible{outline:2px solid #f0c14a;outline-offset:-4px}
.ndu-life-line{margin:0;color:#f6efe2}
.ndu-life-mini{position:relative;display:flex;align-items:center;gap:7px;min-height:44px;max-width:11rem;padding:0 14px 0 8px;border-radius:999px;color:#f6efe2;
 font:650 12px/1 system-ui,sans-serif;letter-spacing:.02em;border:1px solid rgba(255,255,255,.07);cursor:pointer;-webkit-tap-highlight-color:transparent;
 background:radial-gradient(circle at 32% 26%,#4a3b2e 0%,#2c241c 58%,#201912 100%);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -3px 6px rgba(0,0,0,.38),0 3px 0 #110d0a,0 8px 18px rgba(0,0,0,.38);
 transform-origin:50% 100%;animation:ndu-life-pop .42s cubic-bezier(.34,1.56,.64,1) both;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}
.ndu-life-mini:active{transform:translateY(2px) scale(.94)}
.ndu-life-mini:focus-visible{outline:2px solid #f0c14a;outline-offset:3px}
.ndu-life-mini[aria-expanded="true"]{color:#1a1511;background:radial-gradient(circle at 32% 26%,#f7b47a 0%,#e8843a 58%,#c4651f 100%)}
.ndu-life-mini .ndu-life-dot{width:26px;height:26px}
.ndu-life-mini b{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ndu-life-mini::after{content:"";position:absolute;left:50%;bottom:-6px;width:10px;height:10px;margin-left:-5px;transform:rotate(45deg);background:#221b14;border-radius:2px}
.ndu-life-pin.is-open .ndu-life-mini::after{display:none}
.ndu-life-pin .ndu-life-stack .ndu-life-card{margin-bottom:10px}
.ndu-life-stack{position:relative;display:flex;flex-direction:column-reverse;align-items:center}
.ndu-life-pin.is-below .ndu-life-stack{flex-direction:column}
.ndu-life-pin.is-below .ndu-life-stack .ndu-life-card{margin:10px 0 0;transform-origin:50% 0}
.ndu-life-pin.is-below .ndu-life-card::after{bottom:auto;top:-7px;transform:rotate(225deg)}
.ndu-life-act{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:44px;margin:8px 0 0;border:0;border-radius:999px;cursor:pointer;
 color:#1a1511;font:700 13px/1 system-ui,sans-serif;background:radial-gradient(circle at 32% 26%,#f7b47a 0%,#e8843a 58%,#c4651f 100%);
 box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -3px 6px rgba(0,0,0,.25),0 3px 0 #6e3612;transition:transform .09s,box-shadow .09s;-webkit-tap-highlight-color:transparent}
.ndu-life-act:active{transform:translateY(2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 1px 0 #6e3612}
.ndu-life-act:disabled{cursor:default;color:rgba(246,239,226,.8);background:linear-gradient(180deg,#3d3229,#2c241c);box-shadow:inset 0 1px 0 rgba(255,255,255,.1)}
.ndu-life-act:focus-visible{outline:2px solid #f0c14a;outline-offset:3px}
.ndu-life-sub{margin:5px 0 0;font-size:10.5px;color:rgba(246,239,226,.62)}
@keyframes ndu-life-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.ndu-life-card,.ndu-life-mini{animation:none;transition:none}.ndu-life-x span{transition:none}}
`;

/** NDU-UPG follow: an optional action on the card (wave at a nearby walker); `run` returns the reply line. */
export type CardAction = { label: string; done: string; run: () => string };
export type CardInfo = { title: string; line: string; sub: string; color: number; action?: CardAction };

/** Name plate text: max 12 characters, truncated with an ellipsis (#296). */
export const plate = (text: string) => (text.length > 12 ? `${text.slice(0, 11).trimEnd()}…` : text);

function ensureCss() {
  if (document.getElementById("ndu-life-css")) return;
  const style = document.createElement("style");
  style.id = "ndu-life-css";
  style.textContent = CSS;
  document.head.appendChild(style);
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export class BubbleCard {
  private el: HTMLDivElement | null = null;
  private timer = 0;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };
  agentId = -1;

  constructor(private host: HTMLElement) {}

  open(id: number, info: CardInfo) {
    ensureCss();
    this.close();
    const el = document.createElement("div");
    el.className = "ndu-life-pin";
    const card = document.createElement("div");
    card.className = "ndu-life-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", info.title);
    const head = document.createElement("div");
    head.className = "ndu-life-head";
    const dot = document.createElement("span");
    dot.className = "ndu-life-dot";
    dot.style.background = `radial-gradient(circle at 35% 30%,rgba(255,255,255,.55),${hex(info.color)} 55%)`;
    const title = document.createElement("div");
    title.className = "ndu-life-title";
    title.textContent = info.title;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "ndu-life-x";
    x.setAttribute("aria-label", "Close");
    const xs = document.createElement("span");
    xs.textContent = "×";
    x.append(xs);
    x.onclick = (e) => {
      e.stopPropagation();
      this.close();
    };
    head.append(dot, title, x);
    const line = document.createElement("p");
    line.className = "ndu-life-line";
    line.setAttribute("aria-live", "polite");
    line.textContent = info.line;
    const sub = document.createElement("p");
    sub.className = "ndu-life-sub";
    sub.textContent = info.sub;
    card.append(head, line, sub);
    if (info.action) {
      // NDU-UPG follow: embossed action pill (wave hello) at human range
      const act = info.action;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ndu-life-act";
      btn.textContent = act.label;
      btn.onclick = (e) => {
        e.stopPropagation();
        tapBuzz();
        line.textContent = act.run();
        btn.textContent = act.done;
        btn.disabled = true;
        this.arm(16000);
      };
      card.append(btn);
    }
    const bubbles = getUiMode() === "bubbles";
    if (bubbles) {
      // bubble first: a small embossed name bubble; tap to unfold the talk card, tap again to fold
      const stack = document.createElement("div");
      stack.className = "ndu-life-stack";
      const mini = document.createElement("button");
      mini.type = "button";
      mini.className = "ndu-life-mini";
      mini.setAttribute("aria-expanded", "false");
      mini.setAttribute("aria-label", `${info.title}. Show what they say`);
      const mdot = dot.cloneNode() as HTMLSpanElement;
      const name = document.createElement("b");
      name.textContent = plate(info.title);
      mini.append(mdot, name);
      card.hidden = true;
      mini.onclick = (e) => {
        e.stopPropagation();
        tapBuzz();
        const opening = card.hidden;
        card.hidden = !opening;
        mini.setAttribute("aria-expanded", String(opening));
        mini.setAttribute("aria-label", `${info.title}. ${opening ? "Fold" : "Show"} what they say`);
        el.classList.toggle("is-open", opening);
        this.arm(opening ? 16000 : 9000);
      };
      stack.append(mini, card);
      el.append(stack);
    } else {
      el.append(card);
    }
    // taps on the card never reach the map
    for (const ev of ["click", "mousedown", "touchstart", "pointerdown", "dblclick"]) el.addEventListener(ev, (e) => e.stopPropagation());
    el.style.visibility = "hidden";
    this.host.appendChild(el);
    this.el = el;
    this.agentId = id;
    window.addEventListener("keydown", this.onKey);
    this.arm(9000);
  }

  private arm(ms: number) {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.close(), ms);
  }

  get isOpen() {
    return this.el !== null;
  }

  /** Pin the card's tail to a screen point (px in the map container); null hides it. */
  follow(p: { x: number; y: number } | null) {
    const el = this.el;
    if (!el) return;
    if (!p) {
      el.style.visibility = "hidden";
      return;
    }
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const maxX = this.host.clientWidth - w - 6;
    const tx = Math.round(Math.max(6, Math.min(maxX, p.x - w / 2)));
    // NDU-UPG follow (live bug): never unfold under the top pill (z 520) or the tools column. With no room
    // above the agent, the talk card unfolds below its name bubble instead.
    const top = this.topSafe();
    const mini = el.querySelector<HTMLElement>(".ndu-life-mini");
    const below = Boolean(mini) && el.classList.contains("is-open") && p.y - h - 14 < top;
    el.classList.toggle("is-below", below);
    const ty = Math.round(Math.max(top, below && mini ? p.y - mini.offsetHeight - 14 : p.y - h - 14));
    el.style.transform = `translate(${tx}px,${ty}px)`;
    el.style.visibility = "visible";
  }

  /** NDU-UPG follow: first free pixel row under the top pill, in host coordinates. */
  private topSafe() {
    const pill = document.querySelector(".ndu-top");
    if (!pill) return 6;
    const b = pill.getBoundingClientRect().bottom - this.host.getBoundingClientRect().top;
    return Math.max(6, Math.round(b + 8));
  }

  close() {
    window.clearTimeout(this.timer);
    window.removeEventListener("keydown", this.onKey);
    this.el?.remove();
    this.el = null;
    this.agentId = -1;
  }
}
