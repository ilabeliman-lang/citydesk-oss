/**
 * NDU-AI avatar-bot assistant: deterministic local intent router. This is the default brain (no model,
 * no network, no cost): it turns a typed line into ONE allowlisted tool call, a memory/voice action, or
 * a canned reply. When the optional gateway flag is on, lines this router can't place go to the server
 * proxy; everything it returns still passes checkToolCall() and the moderation gate.
 */
import type { LayerName, WeatherName } from "./tools.ts";

export type Route =
  | { kind: "tool"; call: { name: string; args: Record<string, unknown> } }
  | { kind: "memory"; action: "forget" | "list" }
  | { kind: "nickname"; value: string }
  | { kind: "voice"; on: boolean }
  | { kind: "say"; text: string }
  | { kind: "unknown" };

const tidy = (s: string) =>
  s
    .replace(/[?!.,]+$/g, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim();

const LAYER_WORDS: [RegExp, LayerName][] = [
  [/\b(buildings?|houses?|towers?|3d)\b/, "buildings"],
  [/\b(labels?|names?|text|signs?)\b/, "labels"],
  [/\b(route|path|trip|line)\b/, "route"],
  [/\b(effects?|particles?|immersion)\b/, "effects"],
];

const WEATHER_WORDS: [RegExp, WeatherName][] = [
  [
    /\b(live|real|actual|normal|reset)\b.*\bweather\b|\bweather\b.*\b(live|real|actual|normal|reset)\b/,
    "live",
  ],
  [/\b(storm|thunder|lightning)\b/, "storm"],
  [/\b(rain|rainy|raining|shower)\b/, "rain"],
  [/\b(fog|foggy|mist|misty)\b/, "fog"],
  [/\b(haze|hazy|harmattan|dust)\b/, "haze"],
  [/\b(cloud|cloudy|overcast)\b/, "cloudy"],
  [/\b(clear|sunny|sunshine|sun)\b/, "clear"],
];

export function routeIntent(input: string): Route {
  const raw = input.trim();
  const t = raw.toLowerCase();
  if (!t) return { kind: "unknown" };

  // Memory + persona controls first (they must always work, even offline).
  if (
    /\b(forget me|forget everything|clear (my )?(memory|history|data)|delete (my )?(memory|history|data))\b/.test(
      t,
    )
  )
    return { kind: "memory", action: "forget" };
  if (/\b(what do you (remember|know about me)|my (recent )?places|where have i been)\b/.test(t))
    return { kind: "memory", action: "list" };
  const nick = raw.match(
    /\b(?:call me|my name is|i am called|i'm called)\s+([\p{L}][\p{L} '-]{0,23})/iu,
  );
  if (nick) return { kind: "nickname", value: tidy(nick[1]) };
  if (/^(mute|be quiet|stop talking|silence|voice off|shh+)\b/.test(t))
    return { kind: "voice", on: false };
  if (/^(unmute|talk to me|speak|voice on|read (it )?(out|aloud))\b/.test(t))
    return { kind: "voice", on: true };

  // Scan (needs the player's confirmation in the UI).
  if (
    /\b(scan|capture|3d photo)\b/.test(t) &&
    /\b(start|open|begin|new|do|make|want|let'?s|room|my)\b|^scan\b/.test(t)
  )
    return { kind: "tool", call: { name: "start_scan", args: {} } };

  // Explain the view.
  if (
    /\b(what('?s| is| am i looking at)|explain|describe|tell me about)\b.*\b(this|here|that|view|looking|screen|building|spot)\b|\bwhat am i (looking at|seeing)\b|^what('?s| is) (this|that|here)\b|^where am i\b/.test(
      t,
    )
  )
    return { kind: "tool", call: { name: "explain_view", args: {} } };

  // Weather.
  if (
    /\b(weather|rain|storm|fog|haze|cloud|cloudy|sunny|clear sky|thunder|harmattan)\b/.test(t) &&
    !/\b(fly|go|take me|find)\b/.test(t)
  ) {
    for (const [re, kind] of WEATHER_WORDS)
      if (re.test(t)) return { kind: "tool", call: { name: "set_weather", args: { kind } } };
    if (/\b(stop|off|no)\b/.test(t))
      return { kind: "tool", call: { name: "set_weather", args: { kind: "live" } } };
  }

  // Layers.
  const show = /\b(show|turn on|enable|bring back|display|unhide)\b/.test(t);
  const hide = /\b(hide|turn off|disable|remove|clear)\b/.test(t);
  if (show || hide) {
    for (const [re, layer] of LAYER_WORDS)
      if (re.test(t))
        return {
          kind: "tool",
          call: { name: "toggle_layer", args: { layer, on: show && !hide ? true : !hide } },
        };
  }

  // Fly / go.
  const fly = raw.match(
    /\b(?:fly|take me|go|head|zoom|jump|bring me|move)\s+(?:back\s+)?(?:to|over to|towards?)\s+(.+)$/i,
  );
  if (fly && tidy(fly[1]))
    return { kind: "tool", call: { name: "fly_to", args: { query: tidy(fly[1]) } } };
  if (/^(go )?(home|back to me|to me|my spot)$/.test(t))
    return { kind: "tool", call: { name: "fly_to", args: { query: "me" } } };

  // Find.
  const find = raw.match(
    /\b(?:find|search for|search|look for|locate|where(?:'s| is| are)|show me|any)\s+(?:a\s+|an\s+|the\s+|some\s+)?(.+)$/i,
  );
  if (find && tidy(find[1]))
    return { kind: "tool", call: { name: "find_place", args: { query: tidy(find[1]) } } };

  if (/^(hi|hello|hey|good (morning|afternoon|evening)|yo|sup)\b/.test(t))
    return {
      kind: "say",
      text: "Hi! Try “fly to the market”, “what am I looking at?”, “make it rain” or “start a scan”.",
    };
  if (/\b(help|what can you do|commands)\b/.test(t))
    return {
      kind: "say",
      text: "I can fly the map to a place, find a building or shop, explain what's in view, show or hide buildings, labels and the route, preview weather, and open the scan panel. I can't touch wallets, payments or claims.",
    };
  if (/\b(thanks|thank you|nice|cool|great)\b/.test(t)) return { kind: "say", text: "Anytime!" };
  return { kind: "unknown" };
}
