# NDU Kids room (NDU-UPG kids)

A gentle, closed play space inside a home, inspired by a dad-and-daughter afternoon on the living-room rug.

## Open it

- Phone → Room → **Kids room · play together**, or the Hall (home interior) → same button.
- QA / direct link: `/?kids=1`.
- Kill switch: `/?kids=0` (or localStorage `ndu.kids.off=1`) hides the door and the room; `/?kids=1` turns it back on.
- Exit and settings: 🔒 → grown-up question (a × b on a keypad) → Grown-ups sheet.

## What's in it

- Low-poly 3D living room (three.js, lazy chunk): rug, sofa, TV, floor lamp, ottoman with laptop, snack bowl, window, small wooden cross.
- Kid (cartoon, pigtails, dot eyes) and Dad avatar.
- 🍳 Toy kitchen: choose Soup / Pancakes / Rice & stew → pot on → veggies → stir (steam) → serve (plate + hearts).
- 🧱 Blocks: drop-and-snap stacking (src/world/kids/blocks.ts), up to 10, Tumble! with simple physics.
- ⚽ Ball: rolls with friction and wall bounces; after 🤗 Together, Dad rolls it back.
- 🖍️ Coloring: two original line-art pictures, tap-to-fill (scanline flood fill), saved locally.
- 🤗 Together: Dad walks to the rug and waves or hugs (hearts).
- 🌙 Bedtime (optional): lights dim, lamp glows, stars in the window, Pip sleeps on the TV, a soft music-box lullaby (if sound is on) and a KJV verse card + short blessing (can be turned off by a grown-up).
- 📺 TV: "Pip and Puff", an original looping cartoon drawn in code (cartoon.ts).
- Sound: Web Audio synthesis only, off by default.
- Stars ⭐ for play milestones (local only, nothing to buy or trade).

## Child safety

- No chat, no strangers/other players, no presence, no purchases, no ads, no links out, no camera/mic, no file pickers.
- Nothing mintable or tradable; no server calls at all. Data: `localStorage` keys `ndu.kids.v1` (stars, counts, fill taps), `ndu.kids.settings.v1`, `ndu.kids.lock` (keeps the room open across a reload until a grown-up exits).
- Parent gate on exit/settings; three wrong answers rest the keypad 5 s. Context menu and text selection are disabled in the room.
- Optional break reminder (15 / 30 min).

## Performance

- `door.tsx` is the only file in the first-map bundle (a button + host). `KidsRoom` (+CSS) and `scene.ts` (+three.js) are dynamic imports.
- `getTier()`: A = antialias, shadows, 2× pixel ratio, 40 particles; B = no shadows, 1.25× pixel ratio, 20 particles; C (or WebGL failure / context loss) = flat SVG room (FlatRoom.tsx) with every activity. `prefers-reduced-motion` trims animation.

## Licences

All art, the cartoon, line art, sounds and the lullaby phrase are original and procedural (written in this repo). Verses: King James Version (public domain in the US). UI icons: lucide-react (ISC licence, already a project dependency). No third-party art, audio or video.
