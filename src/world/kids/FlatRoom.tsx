import { useEffect, useRef } from "react";
import { drawCartoon } from "./cartoon";
import type { KidsPick } from "./scene";

/**
 * NDU-UPG kids: Tier C room (no WebGL, software GL or a struggling phone). A flat SVG living room with
 * the same tappable toys, so every activity still works; only the 3D and particles are left out.
 */
const BLOCK_COLORS = ["#f25f5c", "#ffb84d", "#ffe066", "#7bd389", "#4fb3e8", "#9b7be8"];

export function FlatRoom(p: {
  blocks: number;
  cookStep: number;
  served: boolean;
  ballKick: number;
  together: "" | "wave" | "hug";
  night: boolean;
  /** A bottom sheet is open: lift the room so the toys stay in view. */
  lifted?: boolean;
  onPick: (pick: KidsPick) => void;
}) {
  const tv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = tv.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    let t = 0;
    const id = window.setInterval(() => {
      t += 0.125;
      drawCartoon(ctx, t, c.width, c.height, p.night);
    }, 125);
    return () => window.clearInterval(id);
  }, [p.night]);
  const dadX = p.together ? 236 : 104;
  const dadY = p.together ? 410 : 300;
  const pick = (k: KidsPick) => () => p.onPick(k);
  return (
    <div
      className="ndu-kids-flat"
      style={{
        filter: p.night ? "brightness(0.55) saturate(0.8)" : undefined,
        transform: p.lifted ? "translateY(-24%)" : undefined,
        transition: "filter 1.5s, transform 0.5s ease",
      }}
    >
      <svg
        viewBox="0 0 390 640"
        preserveAspectRatio="xMidYMid slice"
        width="100%"
        height="100%"
        role="img"
        aria-label="Living room"
      >
        <rect width="390" height="300" fill="#f3e3c9" />
        <rect y="300" width="390" height="340" fill="#c99a6b" />
        <rect
          x="24"
          y="90"
          width="80"
          height="70"
          rx="6"
          fill={p.night ? "#1d2b52" : "#9fd8f5"}
          stroke="#fff"
          strokeWidth="5"
        />
        <rect x="58" y="40" width="5" height="30" fill="#8a5a34" />
        <rect x="50" y="48" width="21" height="5" fill="#8a5a34" />
        <ellipse cx="200" cy="470" rx="160" ry="70" fill="#fbe3a8" />
        <ellipse cx="200" cy="470" rx="110" ry="46" fill="#bfe3d0" />
        <ellipse cx="200" cy="470" rx="60" ry="24" fill="#f7c6b8" />
        <g onClick={pick("tv")}>
          <rect x="196" y="120" width="160" height="96" rx="8" fill="#1d1a18" />
          <foreignObject x="204" y="128" width="144" height="80">
            <canvas
              ref={tv}
              width={144}
              height={80}
              style={{ width: 144, height: 80, borderRadius: 4 }}
            />
          </foreignObject>
          <rect x="186" y="240" width="180" height="50" rx="6" fill="#8a5a34" />
        </g>
        <g>
          <rect x="20" y="250" width="170" height="60" rx="18" fill="#c96f4a" />
          <rect x="20" y="220" width="170" height="40" rx="14" fill="#b9603e" />
        </g>
        <g onClick={pick("kitchen")}>
          <rect x="6" y="330" width="78" height="120" rx="8" fill="#9ee0c9" />
          <rect x="4" y="326" width="82" height="10" rx="4" fill="#fff" />
          <circle
            cx="30"
            cy="331"
            r="9"
            fill={p.cookStep >= 0 && !p.served ? "#ff8a3c" : "#2b2118"}
          />
          <rect
            x="18"
            y={p.cookStep >= 0 && !p.served ? 312 : 314}
            width="24"
            height="16"
            rx="4"
            fill="#e85d5d"
          />
          <rect x="16" y="360" width="56" height="44" rx="6" fill="#fff" />
        </g>
        <g onClick={pick("color")}>
          <rect
            x="90"
            y="470"
            width="62"
            height="50"
            rx="6"
            fill="#fff"
            stroke="#ead4b6"
            strokeWidth="3"
          />
          <path d="M100 505 L115 485 L130 505 Z" fill="none" stroke="#2b2118" strokeWidth="2" />
        </g>
        <g onClick={pick("blocks")}>
          <rect x="300" y="520" width="56" height="30" rx="6" fill="#ffb84d" />
          {Array.from({ length: p.blocks }, (_, i) => (
            <rect
              key={i}
              x={268}
              y={540 - (i + 1) * 22}
              width="22"
              height="22"
              rx="3"
              fill={BLOCK_COLORS[i % BLOCK_COLORS.length]}
              stroke="#0002"
            />
          ))}
        </g>
        <g
          onClick={pick("ball")}
          style={{
            transform: `translateX(${p.ballKick % 2 ? 120 : 0}px)`,
            transition: "transform 1.2s ease-out",
          }}
        >
          <circle cx="150" cy="570" r="16" fill="#f25f5c" />
          <path d="M134 570 H166" stroke="#fff" strokeWidth="5" />
        </g>
        {p.served ? (
          <ellipse cx="250" cy="455" rx="20" ry="7" fill="#fff" stroke="#e8b04f" strokeWidth="5" />
        ) : null}
        <g onClick={pick("kid")}>
          <path d="M184 470 L216 470 L210 430 L190 430 Z" fill="#ff8fab" />
          <circle cx="200" cy="416" r="16" fill="#c98b5b" />
          <path d="M184 412 a16 16 0 0 1 32 0" fill="#2e1d12" />
          <circle cx="182" cy="410" r="7" fill="#2e1d12" />
          <circle cx="218" cy="410" r="7" fill="#2e1d12" />
          <circle cx="195" cy="418" r="2" fill="#2b2118" />
          <circle cx="205" cy="418" r="2" fill="#2b2118" />
        </g>
        <g
          onClick={pick("parent")}
          style={{
            transform: `translate(${dadX - 104}px, ${dadY - 300}px)`,
            transition: "transform 1.2s ease",
          }}
        >
          <path d="M84 300 L124 300 L118 240 L90 240 Z" fill="#4a7fc1" />
          <circle cx="104" cy="222" r="20" fill="#b57a4e" />
          <path d="M84 218 a20 20 0 0 1 40 0" fill="#1f150e" />
          <circle cx="98" cy="224" r="2.4" fill="#2b2118" />
          <circle cx="110" cy="224" r="2.4" fill="#2b2118" />
          {p.together === "hug" ? (
            <text x="130" y="210" fontSize="22" fill="#ff6b8a">
              ♥
            </text>
          ) : null}
          {p.together === "wave" ? (
            <text x="126" y="230" fontSize="18" fill="#3a2416">
              hi!
            </text>
          ) : null}
        </g>
      </svg>
    </div>
  );
}
