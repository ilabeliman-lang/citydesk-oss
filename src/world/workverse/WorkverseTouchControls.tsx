import React, { useState, useEffect, useRef, useCallback } from "react";
import { virtualThumbstick, triggerVirtualAction } from "./WorkversePlayer";

const JOYSTICK_RADIUS = 46;

export function WorkverseTouchControls() {
  const [touchSupported, setTouchSupported] = useState(false);
  const [stickPos, setStickPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const activeTouchIdRef = useRef<number | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const isTouch =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 1024;
    setTouchSupported(isTouch);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current !== null) return;
    const touch = e.changedTouches[0];
    if (!touch || !joystickBaseRef.current) return;
    activeTouchIdRef.current = touch.identifier;
    setIsActive(true);

    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = touch.clientX - centerX;
    const dy = touch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);

    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    setStickPos({ x: stickX, y: stickY });
    virtualThumbstick.dx = stickX / JOYSTICK_RADIUS;
    virtualThumbstick.dz = stickY / JOYSTICK_RADIUS;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null || !joystickBaseRef.current) return;
    let currentTouch: React.Touch | null = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
        currentTouch = e.changedTouches[i];
        break;
      }
    }
    if (!currentTouch) return;

    const rect = joystickBaseRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const dx = currentTouch.clientX - centerX;
    const dy = currentTouch.clientY - centerY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, JOYSTICK_RADIUS);
    const angle = Math.atan2(dy, dx);

    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    setStickPos({ x: stickX, y: stickY });
    virtualThumbstick.dx = stickX / JOYSTICK_RADIUS;
    virtualThumbstick.dz = stickY / JOYSTICK_RADIUS;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (activeTouchIdRef.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchIdRef.current) {
        activeTouchIdRef.current = null;
        setIsActive(false);
        setStickPos({ x: 0, y: 0 });
        virtualThumbstick.dx = 0;
        virtualThumbstick.dz = 0;
        break;
      }
    }
  }, []);

  if (!touchSupported) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 select-none overflow-hidden">
      {/* ── Left Virtual Joystick ── */}
      <div className="absolute bottom-6 left-6 pointer-events-auto touch-none">
        <div
          ref={joystickBaseRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className={`relative w-28 h-28 rounded-full border-2 transition-colors flex items-center justify-center ${
            isActive
              ? "border-amber-400 bg-slate-950/70 shadow-[0_0_20px_rgba(245,158,11,0.25)]"
              : "border-slate-700/60 bg-slate-950/40 backdrop-blur-sm"
          }`}
        >
          {/* Crosshair indicators */}
          <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-[1px] bg-slate-700/40 pointer-events-none" />
          <div className="absolute inset-y-3 left-1/2 -translate-x-1/2 w-[1px] bg-slate-700/40 pointer-events-none" />

          {/* Draggable knob */}
          <div
            className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border border-amber-300 shadow-lg pointer-events-none flex items-center justify-center transition-transform duration-75"
            style={{
              transform: `translate3d(${stickPos.x}px, ${stickPos.y}px, 0)`,
            }}
          >
            <div className="w-3 h-3 rounded-full bg-slate-950/40" />
          </div>
        </div>
      </div>

      {/* ── Right Action Buttons ── */}
      <div className="absolute bottom-6 right-6 pointer-events-auto flex flex-col gap-3.5 items-end touch-none">
        {/* Interact / Action Button */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerVirtualAction("interact");
          }}
          onClick={() => triggerVirtualAction("interact")}
          className="w-14 h-14 rounded-full bg-cyan-600/90 active:bg-cyan-500 border border-cyan-400 text-slate-950 font-bold text-xs flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer"
        >
          <span className="text-base leading-none">⚡</span>
          <span className="text-[9px] uppercase tracking-wider font-extrabold mt-0.5">Act</span>
        </button>

        {/* Jump Button */}
        <button
          type="button"
          onTouchStart={(e) => {
            e.stopPropagation();
            triggerVirtualAction("jump");
          }}
          onClick={() => triggerVirtualAction("jump")}
          className="w-13 h-13 rounded-full bg-slate-900/85 active:bg-slate-800 border border-slate-700 text-slate-100 font-bold text-xs flex flex-col items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer"
        >
          <span className="text-sm leading-none">▲</span>
          <span className="text-[9px] uppercase tracking-wider text-slate-300 mt-0.5">Jump</span>
        </button>
      </div>
    </div>
  );
}
