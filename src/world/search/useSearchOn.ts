import { useEffect, useState } from "react";
import { searchOn } from "./flag";

/** NDU-AI search: true unless switched off (`?search=0`). Starts true so server and client render alike. */
export function useSearchOn(): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(searchOn()), []);
  return on;
}
