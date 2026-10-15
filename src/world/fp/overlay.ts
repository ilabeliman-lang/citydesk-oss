// NDU-FP (FPXR-09): first-person overlay: vignette, reticle, hints, fade layer and a small settings sheet.
// Plain DOM (no React root) so the fp chunk stays small; every layer is pointer-events:none except the sheet.
import { fpPrefs, setFpPrefs, type FpPrefs } from "./flag";
import { enableGyro, disableGyro } from "./look/gyro";

export type Overlay = {
  setVignette(v: number): void;
  setReticle(on: boolean): void;
  hint(text: string | null): void;
  fade(on: boolean): void;
  show(on: boolean): void;
  openSettings(): void;
  dispose(): void;
};

export function mountOverlay(container: HTMLElement, touch: boolean): Overlay {
  const root = document.createElement("div");
  root.dataset.nduFpOverlay = "1";
  root.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:4;display:none";
  const vig = document.createElement("div");
  vig.style.cssText = "position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.85) 100%)";
  const ret = document.createElement("div");
  ret.setAttribute("aria-hidden", "true");
  ret.style.cssText = "position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.7)";
  const hintEl = document.createElement("div");
  hintEl.setAttribute("role", "status");
  hintEl.style.cssText = "position:absolute;left:50%;bottom:96px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font:13px system-ui;white-space:nowrap";
  const fadeEl = document.createElement("div");
  fadeEl.style.cssText = "position:absolute;inset:0;background:#000;opacity:0;transition:opacity 75ms linear";
  root.append(vig, ret, hintEl, fadeEl);
  let tilt: HTMLButtonElement | null = null;
  if (touch) {
    tilt = document.createElement("button");
    tilt.type = "button";
    tilt.textContent = "Tilt to look";
    tilt.style.cssText = "position:absolute;right:12px;bottom:150px;pointer-events:auto;padding:8px 12px;border-radius:999px;border:0;background:rgba(0,0,0,.65);color:#fff;font:13px system-ui";
    let denied = false;
    tilt.onclick = async () => {
      if (fpPrefs().gyro) {
        disableGyro();
        setFpPrefs({ gyro: false });
        tilt!.textContent = "Tilt to look";
        return;
      }
      if (denied) return;
      const r = await enableGyro();
      if (r === "granted") {
        setFpPrefs({ gyro: true });
        tilt!.textContent = "Tilt look on";
      } else {
        denied = r === "denied";
        hintEl.textContent = r === "denied" ? "Tilt look is off. Allow Motion & Orientation in Settings > Safari" : "Tilt look isn't available on this device";
        hintEl.style.display = "";
      }
    };
    root.append(tilt);
  }
  container.append(root);

  let sheet: HTMLDivElement | null = null;
  const closeSheet = () => {
    sheet?.remove();
    sheet = null;
  };
  const openSettings = () => {
    if (sheet) return closeSheet();
    const p = fpPrefs();
    sheet = document.createElement("div");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "First-person settings");
    sheet.dataset.nduFpSettings = "1";
    sheet.style.cssText = "position:absolute;left:12px;right:12px;bottom:12px;max-width:420px;margin:auto;pointer-events:auto;background:rgba(20,20,24,.94);color:#fff;border-radius:16px;padding:14px 16px;font:14px system-ui;display:grid;gap:8px;z-index:5";
    const row = (label: string, input: HTMLElement) => {
      const l = document.createElement("label");
      l.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:12px";
      l.append(document.createTextNode(label), input);
      sheet!.append(l);
    };
    const range = (k: keyof FpPrefs, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const wrap = document.createElement("span");
      const i = document.createElement("input");
      i.type = "range";
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      i.value = String(p[k]);
      const out = document.createElement("output");
      out.textContent = fmt(Number(i.value));
      out.style.cssText = "min-width:56px;display:inline-block;text-align:right";
      i.oninput = () => {
        setFpPrefs({ [k]: Number(i.value) } as Partial<FpPrefs>);
        out.textContent = fmt(Number(i.value));
      };
      wrap.append(i, out);
      return wrap;
    };
    const check = (k: keyof FpPrefs) => {
      const i = document.createElement("input");
      i.type = "checkbox";
      i.checked = Boolean(p[k]);
      i.onchange = () => setFpPrefs({ [k]: i.checked } as Partial<FpPrefs>);
      return i;
    };
    const select = (k: keyof FpPrefs, opts: [string, string][], num = false) => {
      const s = document.createElement("select");
      for (const [v, t] of opts) s.append(new Option(t, v, false, String(p[k]) === v));
      s.onchange = () => setFpPrefs({ [k]: num ? Number(s.value) : s.value } as Partial<FpPrefs>);
      return s;
    };
    const title = document.createElement("strong");
    title.textContent = "First person";
    sheet.append(title);
    row("Your height", range("statureM", 1.45, 2.0, 0.01, (v) => `${v.toFixed(2)} m · eye ${(Math.round(v * 0.936 * 20) / 20).toFixed(2)} m`));
    row("Wheelchair eye height", (() => {
      const i = document.createElement("input");
      i.type = "checkbox";
      i.checked = p.posture === "wheelchair";
      i.onchange = () => setFpPrefs({ posture: i.checked ? "wheelchair" : "stand" });
      return i;
    })());
    row("Field of view", range("hFovDeg", 70, 100, 1, (v) => `${v}°`));
    row("Look sensitivity", range("sensitivity", 0.03, 0.3, 0.01, (v) => v.toFixed(2)));
    row("Invert look up/down", check("invertY"));
    row("Head bob", range("bob", 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`));
    row("Comfort vignette", select("vignette", [["off", "Off"], ["auto", "Auto"], ["strong", "Strong"]]));
    row("Centre dot", check("reticle"));
    row("Footsteps", check("footsteps"));
    row("Turn with arrows", select("snapTurnDeg", [["0", "Smooth"], ["30", "Snap 30°"], ["45", "Snap 45°"]], true));
    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Done";
    done.style.cssText = "justify-self:end;padding:6px 14px;border-radius:999px;border:0;background:#e8843a;color:#fff";
    done.onclick = closeSheet;
    sheet.append(done);
    root.append(sheet);
  };
  return {
    setVignette: (v) => (vig.style.opacity = String(v)),
    setReticle: (on) => (ret.style.display = on ? "" : "none"),
    hint: (t) => {
      hintEl.textContent = t ?? "";
      hintEl.style.display = t ? "" : "none";
    },
    fade: (on) => (fadeEl.style.opacity = on ? "0.6" : "0"),
    show: (on) => {
      root.style.display = on ? "" : "none";
      if (!on) closeSheet();
    },
    openSettings,
    dispose: () => {
      closeSheet();
      root.remove();
    },
  };
}
