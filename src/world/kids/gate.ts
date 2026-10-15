/**
 * NDU-UPG kids: the parent gate. A grown-up answers a two-digit multiplication on a keypad.
 * Pure (unit tested): no DOM, no imports.
 */
export type GateQuestion = { a: number; b: number; answer: number };

export function makeQuestion(rand: () => number = Math.random): GateQuestion {
  const pick = () => 3 + Math.floor(rand() * 7); // 3..9, so answers are 9..81
  let a = pick();
  let b = pick();
  if (a * b < 20) b = Math.min(9, b + 4);
  if (a === b) a = a === 9 ? 7 : a + 1;
  return { a, b, answer: a * b };
}

export function checkAnswer(q: GateQuestion, typed: string): boolean {
  return /^\d{1,3}$/.test(typed) && Number(typed) === q.answer;
}

/** After three wrong tries the keypad rests a few seconds (stops button mashing). */
export const GATE_MAX_TRIES = 3;
export const GATE_REST_MS = 5000;
