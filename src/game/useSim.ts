import { useEffect, useState } from "react";
import { sim, subscribeSim } from "./sim";

export function useSim() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeSim(() => setTick((n) => n + 1)), []);
  return sim;
}
