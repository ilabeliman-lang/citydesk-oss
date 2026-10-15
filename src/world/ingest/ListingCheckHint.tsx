import { useEffect, useState } from "react";
import { scamCheck, type ScamCheck } from "@/lib/ingest/scam";
import "./ingest.css";

/**
 * NDU-AI safe ingest #4: a gentle embossed note under a listing / claim while it's being written. It never
 * blocks the form; it tells the writer a manager will look, and why, so honest sellers can reword.
 */
export default function ListingCheckHint({
  text,
  what = "listing",
}: {
  text: string;
  what?: string;
}) {
  const [res, setRes] = useState<ScamCheck | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setRes(text.trim().length >= 6 ? scamCheck(text) : null), 350);
    return () => clearTimeout(t);
  }, [text]);
  if (!res || res.level === "ok") return null;
  return (
    <p className={`ndu-review-flag ndu-review-flag--${res.level}`} role="status">
      <span aria-hidden="true">⚑</span> A manager will check this {what}:{" "}
      {res.reasons.map((r) => r.why).join(" · ")}
    </p>
  );
}
