/**
 * NDU-AI avatar-bot assistant: the STRICT tool allowlist. The assistant (local router or a gateway model)
 * can only ever ask for one of these read-only / view-only actions. Anything else, and anything whose
 * name or arguments smell of money, wallets, minting, payments, claims or GreenFunds, is refused here,
 * before the executor sees it. There is no generic dispatch: the executor switches on these names only.
 *
 * Pure + dependency-free so it runs in node tests and on the server proxy.
 */

export const TOOL_NAMES = [
  "fly_to",
  "find_place",
  "explain_view",
  "toggle_layer",
  "set_weather",
  "start_scan",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const LAYERS = ["buildings", "labels", "route", "effects"] as const;
export type LayerName = (typeof LAYERS)[number];

export const WEATHER = ["live", "clear", "cloudy", "rain", "storm", "fog", "haze"] as const;
export type WeatherName = (typeof WEATHER)[number];

export type ToolCall =
  | { name: "fly_to"; args: { query: string } }
  | { name: "find_place"; args: { query: string } }
  | { name: "explain_view"; args: Record<string, never> }
  | { name: "toggle_layer"; args: { layer: LayerName; on: boolean } }
  | { name: "set_weather"; args: { kind: WeatherName } }
  | { name: "start_scan"; args: Record<string, never> };

export type ToolSpec = {
  name: ToolName;
  description: string;
  /** The user must tap "Yes" before it runs. */
  confirm: boolean;
  /** JSON-schema-ish shape, sent to a gateway model as the function list. */
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
};

const obj = (properties: Record<string, unknown>, required: string[]): ToolSpec["parameters"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_SPECS: readonly ToolSpec[] = Object.freeze([
  {
    name: "fly_to",
    confirm: false,
    description: "Move the map camera to a named place near the player or one they visited.",
    parameters: obj({ query: { type: "string", maxLength: 80 } }, ["query"]),
  },
  {
    name: "find_place",
    confirm: false,
    description: "Find a building, shop or property by name on the map and point at it.",
    parameters: obj({ query: { type: "string", maxLength: 80 } }, ["query"]),
  },
  {
    name: "explain_view",
    confirm: false,
    description: "Describe what is in the middle of the screen: building, street, weather, time.",
    parameters: obj({}, []),
  },
  {
    name: "toggle_layer",
    confirm: false,
    description: "Show or hide a map layer.",
    parameters: obj({ layer: { enum: [...LAYERS] }, on: { type: "boolean" } }, ["layer", "on"]),
  },
  {
    name: "set_weather",
    confirm: false,
    description: "Preview weather on the map, or go back to live weather.",
    parameters: obj({ kind: { enum: [...WEATHER] } }, ["kind"]),
  },
  {
    name: "start_scan",
    confirm: true,
    description:
      "Open the room-scan panel. The player confirms first; nothing is uploaded by the assistant.",
    parameters: obj({}, []),
  },
]);

/**
 * Words that must never appear in a tool name or argument. The allowlist already blocks unknown names;
 * this is a second fence so a future tool or a crafted query can't smuggle a money action through.
 */
export const FORBIDDEN =
  /(wallet|mint|minting|payment|pay(?!ne)|transfer|send[_ ]?(sol|usdc|token|money|crypto)|sign(_|\s)?(tx|transaction|message)|seed|private[_ ]?key|green[\s_-]?funds?|tradeforge|withdraw|deposit|claim|purchase|buy|checkout|stake|swap|airdrop|neura[_ ]?(token|pay))/i;

const MAX_QUERY = 80;

export type ToolCheck =
  { ok: true; call: ToolCall; confirm: boolean } | { ok: false; reason: string };

const clean = (v: unknown): string =>
  [...String(v ?? "")]
    .filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127)
    .join("")
    .replace(/[<>`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY);

export function isAllowedTool(name: unknown): name is ToolName {
  return typeof name === "string" && (TOOL_NAMES as readonly string[]).includes(name);
}

/** Validate an untrusted tool call (from the local router or a model). Never throws. */
export function checkToolCall(raw: unknown): ToolCheck {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not a tool call" };
  const r = raw as { name?: unknown; args?: unknown; arguments?: unknown };
  const name = r.name;
  if (typeof name !== "string") return { ok: false, reason: "missing tool name" };
  if (FORBIDDEN.test(name)) return { ok: false, reason: `forbidden tool: ${name.slice(0, 40)}` };
  if (!isAllowedTool(name))
    return { ok: false, reason: `tool not on the allowlist: ${name.slice(0, 40)}` };
  let args: unknown = r.args ?? r.arguments ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      return { ok: false, reason: "arguments are not JSON" };
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args))
    return { ok: false, reason: "arguments must be an object" };
  const a = args as Record<string, unknown>;
  const spec = TOOL_SPECS.find((s) => s.name === name)!;
  const allowedKeys = Object.keys(spec.parameters.properties);
  for (const k of Object.keys(a))
    if (!allowedKeys.includes(k))
      return { ok: false, reason: `unexpected argument: ${k.slice(0, 20)}` };
  for (const v of Object.values(a))
    if (typeof v === "string" && FORBIDDEN.test(v))
      return { ok: false, reason: "argument mentions a blocked action" };

  switch (name) {
    case "fly_to":
    case "find_place": {
      const query = clean(a.query);
      if (!query) return { ok: false, reason: "query is empty" };
      return { ok: true, call: { name, args: { query } }, confirm: false };
    }
    case "explain_view":
      return { ok: true, call: { name, args: {} }, confirm: false };
    case "start_scan":
      return { ok: true, call: { name, args: {} }, confirm: true };
    case "toggle_layer": {
      if (!(LAYERS as readonly unknown[]).includes(a.layer))
        return { ok: false, reason: "unknown layer" };
      if (typeof a.on !== "boolean") return { ok: false, reason: "on must be true or false" };
      return {
        ok: true,
        call: { name, args: { layer: a.layer as LayerName, on: a.on } },
        confirm: false,
      };
    }
    case "set_weather": {
      if (!(WEATHER as readonly unknown[]).includes(a.kind))
        return { ok: false, reason: "unknown weather" };
      return { ok: true, call: { name, args: { kind: a.kind as WeatherName } }, confirm: false };
    }
  }
}
