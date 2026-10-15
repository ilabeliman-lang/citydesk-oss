/**
 * NDU-UPG sessions: privacy-light device + place helpers (pure, client-safe).
 * No third-party UA or GeoIP service: a small UA parser, IPs cut to their /24 (IPv4) or /48 (IPv6)
 * network, and a coarse place only when Cloudflare already sent visitor-location headers.
 */
export type DeviceInfo = { browser: string; os: string; kind: "phone" | "tablet" | "desktop" | "unknown"; label: string };

export function parseUserAgent(ua: string | null | undefined): DeviceInfo {
  const s = String(ua ?? "");
  if (!s) return { browser: "Unknown browser", os: "Unknown device", kind: "unknown", label: "Unknown device" };
  const has = (re: RegExp) => re.test(s);
  let os = "Unknown device";
  if (has(/iPad|Macintosh.*Mobile/)) os = "iPad";
  else if (has(/iPhone|iPod/)) os = "iPhone";
  else if (has(/Android/)) os = "Android";
  else if (has(/Windows/)) os = "Windows";
  else if (has(/CrOS/)) os = "ChromeOS";
  else if (has(/Mac OS X|Macintosh/)) os = "Mac";
  else if (has(/Linux/)) os = "Linux";
  let browser = "Browser";
  if (has(/Edg(e|A|iOS)?\//)) browser = "Edge";
  else if (has(/OPR\/|Opera/)) browser = "Opera";
  else if (has(/SamsungBrowser/)) browser = "Samsung Internet";
  else if (has(/FxiOS|Firefox\//)) browser = "Firefox";
  else if (has(/CriOS|Chrome\//)) browser = has(/HeadlessChrome/) ? "Headless Chrome" : "Chrome";
  else if (has(/Safari\//)) browser = "Safari";
  else if (has(/curl|python|node|okhttp|Go-http/i)) browser = "Script";
  const kind: DeviceInfo["kind"] = os === "iPad" || (os === "Android" && !has(/Mobile/))
    ? "tablet"
    : os === "iPhone" || os === "Android" || has(/Mobile/)
      ? "phone"
      : os === "Unknown device"
        ? "unknown"
        : "desktop";
  return { browser, os, kind, label: `${browser} on ${os}` };
}

/** Keep only the network part of an IP: a.b.c.0/24 for IPv4, first 3 groups ::/48 for IPv6. */
export function truncateIp(ip: string | null | undefined): string | null {
  let s = String(ip ?? "").split(",")[0].trim();
  if (!s) return null;
  if (s.startsWith("::ffff:") && s.includes(".")) s = s.slice(7);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/\d+)?$/.exec(s);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (s.includes(":")) {
    const groups = s.replace(/^\[|\](:\d+)?$/g, "").split("::")[0].split(":").filter(Boolean);
    return `${groups.slice(0, 3).join(":") || "0"}::/48`;
  }
  return null;
}

/** Coarse place (city level at most) from Cloudflare visitor-location headers, or null. */
export function placeFromHeaders(h: { get(name: string): string | null } | null | undefined): string | null {
  if (!h) return null;
  const clean = (v: string | null) => {
    const t = String(v ?? "").trim();
    if (!t || t === "XX" || t === "T1") return "";
    try {
      return decodeURIComponent(t).slice(0, 60);
    } catch {
      return t.slice(0, 60);
    }
  };
  const city = clean(h.get("cf-ipcity"));
  const region = clean(h.get("cf-region"));
  const country = clean(h.get("cf-ipcountry"));
  const parts = [city, region && region !== city ? region : "", country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
