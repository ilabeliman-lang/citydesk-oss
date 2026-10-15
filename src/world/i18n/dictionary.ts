/**
 * Category 12: Cultural Localisation & Accessibility (items 551–600).
 * Dictionary, string interpolation, fallback resolution, and locale management.
 *
 * Supported locales:
 *  - 'en-US': Standard English
 *  - 'pcm-NG': Nigerian Pidgin (Port Harcourt / Niger Delta)
 *  - 'yo-NG':  Yoruba (Lagos / Western Nigeria)
 *  - 'haw-US': ʻŌlelo Hawaiʻi (Honolulu)
 */

export type SupportedLocale = "en-US" | "pcm-NG" | "yo-NG" | "haw-US";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  "en-US",
  "pcm-NG",
  "yo-NG",
  "haw-US",
] as const;

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

export interface LocaleMeta {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  region: string;
  direction: "ltr" | "rtl";
}

export const LOCALE_METADATA: Record<SupportedLocale, LocaleMeta> = {
  "en-US": {
    code: "en-US",
    name: "Standard English",
    nativeName: "English (US)",
    region: "United States",
    direction: "ltr",
  },
  "pcm-NG": {
    code: "pcm-NG",
    name: "Nigerian Pidgin",
    nativeName: "Naijá",
    region: "Port Harcourt / Niger Delta",
    direction: "ltr",
  },
  "yo-NG": {
    code: "yo-NG",
    name: "Yoruba",
    nativeName: "Èdè Yorùbá",
    region: "Lagos / Western Nigeria",
    direction: "ltr",
  },
  "haw-US": {
    code: "haw-US",
    name: "Hawaiian",
    nativeName: "ʻŌlelo Hawaiʻi",
    region: "Honolulu, Hawaiʻi",
    direction: "ltr",
  },
};

/** Canonical dictionary keys covering all Category 12 systems */
export type CoreDictionaryKey =
  // Map controls
  | "map.recenter"
  | "map.zoomIn"
  | "map.zoomOut"
  | "map.rotate"
  | "map.layers"
  // Needs indicators
  | "needs.hunger"
  | "needs.energy"
  | "needs.hygiene"
  | "needs.social"
  | "needs.comfort"
  | "needs.health"
  | "needs.criticalAlert"
  | "needs.warningAlert"
  | "needs.satisfy"
  // Greetings
  | "greetings.welcome"
  | "greetings.goodMorning"
  | "greetings.goodAfternoon"
  | "greetings.goodEvening"
  | "greetings.farewell"
  // Vouchers
  | "vouchers.balance"
  | "vouchers.redeem"
  | "vouchers.insufficient"
  | "vouchers.earned"
  | "vouchers.transfer"
  // Ride hailing
  | "ride.hail"
  | "ride.arriving"
  | "ride.inTransit"
  | "ride.fare"
  | "ride.tooFar"
  | "ride.arrived"
  | "ride.canceled"
  // Room verification
  | "room.verify"
  | "room.verified"
  | "room.pending"
  | "room.failed"
  | "room.locked"
  | "room.unlocked"
  // Status alerts
  | "alerts.networkOnline"
  | "alerts.networkOffline"
  | "alerts.lowEnergy"
  | "alerts.emergency"
  | "alerts.actionSuccess"
  | "alerts.actionError";

export type DictionaryKey =
  | CoreDictionaryKey
  | "alerts.online"
  | "alerts.offline"
  | "alerts.success"
  | "alerts.error"
  | "map.zoom";

const EN_US: Record<CoreDictionaryKey, string> = {
  // Map controls
  "map.recenter": "Recenter map",
  "map.zoomIn": "Zoom in",
  "map.zoomOut": "Zoom out",
  "map.rotate": "Rotate map view",
  "map.layers": "Map layers",

  // Needs indicators
  "needs.hunger": "Hunger",
  "needs.energy": "Energy",
  "needs.hygiene": "Hygiene",
  "needs.social": "Social",
  "needs.comfort": "Comfort",
  "needs.health": "Health",
  "needs.criticalAlert": "Critical need alert: {need} is critically low at {value}%!",
  "needs.warningAlert": "Warning: {need} is low at {value}%.",
  "needs.satisfy": "Satisfy {need}",

  // Greetings
  "greetings.welcome": "Welcome to the city, {name}!",
  "greetings.goodMorning": "Good morning!",
  "greetings.goodAfternoon": "Good afternoon!",
  "greetings.goodEvening": "Good evening!",
  "greetings.farewell": "Safe travels, {name}!",

  // Vouchers
  "vouchers.balance": "Voucher balance: {count}",
  "vouchers.redeem": "Redeem {count} voucher(s) for {item}",
  "vouchers.insufficient": "Insufficient vouchers: required {needed}, available {available}",
  "vouchers.earned": "You earned {count} voucher(s)!",
  "vouchers.transfer": "Transferred {count} voucher(s) to {recipient}",

  // Ride hailing
  "ride.hail": "Hail {vehicle}",
  "ride.arriving": "{vehicle} arriving in {minutes} min",
  "ride.inTransit": "Traveling to {destination}",
  "ride.fare": "Estimated fare: {fare} vouchers",
  "ride.tooFar": "{vehicle} is too far away ({distance}m)",
  "ride.arrived": "Arrived safely at {destination}!",
  "ride.canceled": "Ride with {vehicle} has been canceled",

  // Room verification
  "room.verify": "Verify room {roomId}",
  "room.verified": "Room {roomId} verified successfully",
  "room.pending": "Room {roomId} verification is pending",
  "room.failed": "Room {roomId} verification failed: {reason}",
  "room.locked": "Room door locked",
  "room.unlocked": "Room door unlocked",

  // Status alerts
  "alerts.networkOnline": "Network connection online",
  "alerts.networkOffline": "Network connection offline",
  "alerts.lowEnergy": "Warning: Low energy ({value}%)",
  "alerts.emergency": "Emergency alert: {message}",
  "alerts.actionSuccess": "Success: {action}",
  "alerts.actionError": "Error: {error}",
};

const PCM_NG: Record<CoreDictionaryKey, string> = {
  // Map controls
  "map.recenter": "Bring map come center",
  "map.zoomIn": "Zoom enter inside",
  "map.zoomOut": "Zoom come outside",
  "map.rotate": "Turn map round",
  "map.layers": "Change map layers",

  // Needs indicators
  "needs.hunger": "Belly bite (Hunger)",
  "needs.energy": "Bodi power (Energy)",
  "needs.hygiene": "Baf clean (Hygiene)",
  "needs.social": "Padi gist (Social)",
  "needs.comfort": "Body sweet (Comfort)",
  "needs.health": "Bodi balance (Health)",
  "needs.criticalAlert": "K-leg dey! {need} don down reach {value}%!",
  "needs.warningAlert": "Shine eye: {need} dey drop reach {value}%.",
  "needs.satisfy": "Sort out {need}",

  // Greetings
  "greetings.welcome": "How far {name}! You dey welcome to the city!",
  "greetings.goodMorning": "Good morning o! How bodi?",
  "greetings.goodAfternoon": "Good afternoon! How market?",
  "greetings.goodEvening": "Good evening o! Hope everywhere soft?",
  "greetings.farewell": "Later na, {name}! Waka gentle!",

  // Vouchers
  "vouchers.balance": "Your voucher change: {count}",
  "vouchers.redeem": "Pay {count} voucher take collect {item}",
  "vouchers.insufficient": "Voucher no reach: need {needed}, but na {available} you get",
  "vouchers.earned": "Oya! You don hammer {count} voucher(s)!",
  "vouchers.transfer": "Send {count} voucher(s) give {recipient}",

  // Ride hailing
  "ride.hail": "Flag down {vehicle}",
  "ride.arriving": "{vehicle} dey reach here for {minutes} min",
  "ride.inTransit": "We dey move go {destination}",
  "ride.fare": "Drop money: {fare} vouchers",
  "ride.tooFar": "{vehicle} dey too far ({distance}m)",
  "ride.arrived": "Drop don land well-well for {destination}!",
  "ride.canceled": "You don cancel ride with {vehicle}",

  // Room verification
  "room.verify": "Check and confirm room {roomId}",
  "room.verified": "Room {roomId} don pass verification sharp!",
  "room.pending": "We still dey check room {roomId}",
  "room.failed": "Room {roomId} verification fail: {reason}",
  "room.locked": "Door lock key-key",
  "room.unlocked": "Door don open",

  // Status alerts
  "alerts.networkOnline": "Network don connect sharp",
  "alerts.networkOffline": "Network don cut comot",
  "alerts.lowEnergy": "Warning: Bodi power don weak ({value}%)",
  "alerts.emergency": "Wahala burst: {message}",
  "alerts.actionSuccess": "E don set: {action}",
  "alerts.actionError": "Wahala: {error}",
};

const YO_NG: Record<CoreDictionaryKey, string> = {
  // Map controls
  "map.recenter": "Tún àwòrán ìlú sí àárín",
  "map.zoomIn": "Sún mọ́ra",
  "map.zoomOut": "Fẹ̀ẹ́ sẹ́yìn",
  "map.rotate": "Yí àwòrán padà",
  "map.layers": "Pàṣípààrọ̀ àwọn ipele àwòrán",

  // Needs indicators
  "needs.hunger": "Ebi (Oúnjẹ)",
  "needs.energy": "Agbára (Okun)",
  "needs.hygiene": "Ìmọ́tótó",
  "needs.social": "Àjọṣe (Ibáṣepọ̀)",
  "needs.comfort": "Ìtura",
  "needs.health": "Ìlera",
  "needs.criticalAlert": "Ìkìlọ̀ pàjáwìrì: {need} ti dínkù púpọ̀ sí {value}%!",
  "needs.warningAlert": "Àkíyèsí: {need} ń dínkù sí {value}%.",
  "needs.satisfy": "Pèsè fún {need}",

  // Greetings
  "greetings.welcome": "Ẹ kú àbọ̀ sí ìlú, {name}!",
  "greetings.goodMorning": "Ẹ kú àárọ̀!",
  "greetings.goodAfternoon": "Ẹ kú ọ̀sán!",
  "greetings.goodEvening": "Ẹ kú ìrọ̀lẹ́!",
  "greetings.farewell": "O dábọ̀, {name}! Ẹ rìn dáadáa!",

  // Vouchers
  "vouchers.balance": "Àpapọ̀ iwe-ẹri: {count}",
  "vouchers.redeem": "Lo iwe-ẹri {count} láti ra {item}",
  "vouchers.insufficient": "Iwe-ẹri kò tó: o nílò {needed}, ṣùgbọ́n o ní {available}",
  "vouchers.earned": "O ti gba iwe-ẹri {count}!",
  "vouchers.transfer": "Fi iwe-ẹri {count} ránṣẹ́ sí {recipient}",

  // Ride hailing
  "ride.hail": "Wá {vehicle}",
  "ride.arriving": "{vehicle} yóò dé ní ìṣẹ́jú {minutes}",
  "ride.inTransit": "Lọ sí {destination}",
  "ride.fare": "Owó ọkọ̀: iwe-ẹri {fare}",
  "ride.tooFar": "{vehicle} jìn jù ({distance}m)",
  "ride.arrived": "A ti dé {destination} láyọ̀!",
  "ride.canceled": "A ti fagilé ìrìn-àjò pẹ̀lú {vehicle}",

  // Room verification
  "room.verify": "Ṣàyẹ̀wò yàrá {roomId}",
  "room.verified": "Yàrá {roomId} ti fìdí múlẹ̀ dáadáa",
  "room.pending": "Àyẹ̀wò ń lọ lọ́wọ́ fún yàrá {roomId}" ,
  "room.failed": "Àyẹ̀wò yàrá {roomId} kùnà: {reason}",
  "room.locked": "Ilẹ̀kùn yàrá ti tì",
  "room.unlocked": "Ilẹ̀kùn yàrá ti ṣí",

  // Status alerts
  "alerts.networkOnline": "Íńtánẹ́ẹ̀tì ti sopọ̀",
  "alerts.networkOffline": "Íńtánẹ́ẹ̀tì ti já",
  "alerts.lowEnergy": "Ìkìlọ̀: Agbára dínkù sí {value}%",
  "alerts.emergency": "Ìkìlọ̀ pàjáwìrì: {message}",
  "alerts.actionSuccess": "Àṣeyọrí: {action}",
  "alerts.actionError": "Àṣìṣe: {error}",
};

const HAW_US: Record<CoreDictionaryKey, string> = {
  // Map controls
  "map.recenter": "Hoʻihoʻi i ke kikowaena o ka palapala ʻāina",
  "map.zoomIn": "Hoʻokokoke",
  "map.zoomOut": "Hoʻomamao",
  "map.rotate": "Hoʻohuli i ke nānā",
  "map.layers": "Nā papa palapala ʻāina",

  // Needs indicators
  "needs.hunger": "Pololi (Ka ʻai)",
  "needs.energy": "Ikaika (Ke aho)",
  "needs.hygiene": "Maʻemaʻe",
  "needs.social": "Pilina (Hui pū)",
  "needs.comfort": "Oluolu",
  "needs.health": "Ola kino",
  "needs.criticalAlert": "Aʻo koʻikoʻi: Ua haʻahaʻa loa ka {need} ma {value}%!",
  "needs.warningAlert": "Aʻo: Ke emi nei ka {need} ma {value}%.",
  "needs.satisfy": "Mālama i ka {need}",

  // Greetings
  "greetings.welcome": "Aloha mai kāua iā {name}! E kipa mai i ke kūlanakauhale!",
  "greetings.goodMorning": "Aloha kakahiaka!",
  "greetings.goodAfternoon": "Aloha awakea!",
  "greetings.goodEvening": "Aloha ahiahi!",
  "greetings.farewell": "A hui hou, {name}! Mālama pono!",

  // Vouchers
  "vouchers.balance": "Kālā palapala: {count}",
  "vouchers.redeem": "Kūʻai me nā palapala {count} no {item}",
  "vouchers.insufficient": "ʻAʻole lawa nā palapala: makemake {needed}, he {available} wale nō kāu",
  "vouchers.earned": "Ua loaʻa iā ʻoe he {count} palapala!",
  "vouchers.transfer": "Hoʻolilo i nā palapala {count} iā {recipient}",

  // Ride hailing
  "ride.hail": "Kāhea i ke {vehicle}",
  "ride.arriving": "E hōʻea mai ana ke {vehicle} i loko o {minutes} minuke",
  "ride.inTransit": "Ke holo nei i {destination}",
  "ride.fare": "Uku holo: {fare} palapala",
  "ride.tooFar": "Mamao loa ke {vehicle} ({distance}m)",
  "ride.arrived": "Ua hōʻea maluhia i {destination}!",
  "ride.canceled": "Ua hoʻopau ʻia ka holo me ke {vehicle}",

  // Room verification
  "room.verify": "Hōʻoia i ke keʻena {roomId}",
  "room.verified": "Ua hōʻoia pono ʻia ke keʻena {roomId}",
  "room.pending": "Ke kali nei ka hōʻoia ʻana o ke keʻena {roomId}",
  "room.failed": "Ua hāʻule ka hōʻoia o ke keʻena {roomId}: {reason}",
  "room.locked": "Ua laka ʻia ka puka",
  "room.unlocked": "Ua wehe ʻia ka puka",

  // Status alerts
  "alerts.networkOnline": "Ua hoʻohui ʻia ke kuʻina punaewele",
  "alerts.networkOffline": "Ua hemo ke kuʻina punaewele",
  "alerts.lowEnergy": "Aʻo: Haʻahaʻa ka ikaika ma {value}%",
  "alerts.emergency": "Aʻo pilikia: {message}",
  "alerts.actionSuccess": "Pōmaikaʻi: {action}",
  "alerts.actionError": "Hewa: {error}",
};

export const DICTIONARIES: Record<SupportedLocale, Record<string, string>> = {
  "en-US": { ...EN_US },
  "pcm-NG": { ...PCM_NG },
  "yo-NG": { ...YO_NG },
  "haw-US": { ...HAW_US },
};

/** Aliases for convenience */
const KEY_ALIASES: Record<string, CoreDictionaryKey> = {
  "alerts.online": "alerts.networkOnline",
  "alerts.offline": "alerts.networkOffline",
  "alerts.success": "alerts.actionSuccess",
  "alerts.error": "alerts.actionError",
  "map.zoom": "map.zoomIn",
};

/**
 * Resolves alias to canonical core key if applicable.
 */
export function resolveCanonicalKey(key: string): string {
  return KEY_ALIASES[key] ?? key;
}

/**
 * String interpolation: replaces `{key}` in template with corresponding value from params.
 * If param is missing or undefined, keeps `{key}` intact.
 */
export function interpolate(
  template: string,
  params?: Record<string, string | number | null | undefined>
): string {
  if (!params || !template.includes("{")) {
    return template;
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, paramName) => {
    if (Object.prototype.hasOwnProperty.call(params, paramName)) {
      const val = params[paramName];
      return val !== undefined && val !== null ? String(val) : match;
    }
    return match;
  });
}

/**
 * Validates if the given string is a supported locale code.
 */
export function isSupportedLocale(locale: unknown): locale is SupportedLocale {
  return (
    typeof locale === "string" &&
    (SUPPORTED_LOCALES as readonly string[]).includes(locale)
  );
}

/**
 * I18nManager: handles stateful locale switching, fallbacks, and event subscriptions.
 */
export class I18nManager {
  private currentLocale: SupportedLocale = DEFAULT_LOCALE;
  private listeners: Set<(locale: SupportedLocale) => void> = new Set();
  private customDictionaries: Map<string, Record<string, string>> = new Map();

  constructor(initialLocale: SupportedLocale = DEFAULT_LOCALE) {
    if (isSupportedLocale(initialLocale)) {
      this.currentLocale = initialLocale;
    }
  }

  public getLocale(): SupportedLocale {
    return this.currentLocale;
  }

  public setLocale(locale: SupportedLocale): boolean {
    if (!isSupportedLocale(locale)) {
      return false;
    }
    if (this.currentLocale !== locale) {
      this.currentLocale = locale;
      for (const listener of this.listeners) {
        try {
          listener(this.currentLocale);
        } catch {
          // Keep other listeners intact
        }
      }
    }
    return true;
  }

  public subscribe(listener: (locale: SupportedLocale) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Register or override translations for a locale.
   */
  public registerTranslations(
    locale: string,
    translations: Record<string, string>
  ): void {
    const existing = this.customDictionaries.get(locale) ?? {};
    this.customDictionaries.set(locale, { ...existing, ...translations });
  }

  /**
   * Resolves translation with fallback resolution logic:
   * 1. Target locale (override or current) custom dictionary
   * 2. Target locale built-in dictionary
   * 3. Fallback to default locale ('en-US') custom dictionary
   * 4. Fallback to default locale ('en-US') built-in dictionary
   * 5. Fallback to key string
   */
  public translate(
    key: DictionaryKey | string,
    params?: Record<string, string | number | null | undefined>,
    localeOverride?: SupportedLocale
  ): string {
    const targetLocale =
      localeOverride && isSupportedLocale(localeOverride)
        ? localeOverride
        : this.currentLocale;

    const canonicalKey = resolveCanonicalKey(key);

    let template: string | undefined;

    // 1. Target locale custom dictionary
    const customTarget = this.customDictionaries.get(targetLocale);
    if (customTarget && customTarget[canonicalKey] !== undefined) {
      template = customTarget[canonicalKey];
    }

    // 2. Target locale built-in dictionary
    if (template === undefined) {
      const builtInTarget = DICTIONARIES[targetLocale];
      if (builtInTarget && builtInTarget[canonicalKey] !== undefined) {
        template = builtInTarget[canonicalKey];
      }
    }

    // 3. Fallback to DEFAULT_LOCALE custom dictionary
    if (template === undefined && targetLocale !== DEFAULT_LOCALE) {
      const customDefault = this.customDictionaries.get(DEFAULT_LOCALE);
      if (customDefault && customDefault[canonicalKey] !== undefined) {
        template = customDefault[canonicalKey];
      }
    }

    // 4. Fallback to DEFAULT_LOCALE built-in dictionary
    if (template === undefined && targetLocale !== DEFAULT_LOCALE) {
      const builtInDefault = DICTIONARIES[DEFAULT_LOCALE];
      if (builtInDefault && builtInDefault[canonicalKey] !== undefined) {
        template = builtInDefault[canonicalKey];
      }
    }

    // 5. Ultimate fallback: key itself
    if (template === undefined) {
      template = key;
    }

    return interpolate(template, params);
  }

  public t(
    key: DictionaryKey | string,
    params?: Record<string, string | number | null | undefined>,
    localeOverride?: SupportedLocale
  ): string {
    return this.translate(key, params, localeOverride);
  }

  /**
   * Returns list of missing keys in a target locale when compared against the default locale.
   */
  public getMissingKeys(targetLocale: SupportedLocale): string[] {
    const defaultDict = DICTIONARIES[DEFAULT_LOCALE];
    const targetDict = DICTIONARIES[targetLocale] ?? {};
    const missing: string[] = [];

    for (const key of Object.keys(defaultDict)) {
      if (!targetDict[key] || targetDict[key].trim() === "") {
        missing.push(key);
      }
    }

    return missing;
  }
}

/** Default singleton instance */
export const defaultI18n = new I18nManager(DEFAULT_LOCALE);

export function getLocale(): SupportedLocale {
  return defaultI18n.getLocale();
}

export function setLocale(locale: SupportedLocale): boolean {
  return defaultI18n.setLocale(locale);
}

export function subscribeLocale(
  listener: (locale: SupportedLocale) => void
): () => void {
  return defaultI18n.subscribe(listener);
}

export function translate(
  key: DictionaryKey | string,
  params?: Record<string, string | number | null | undefined>,
  localeOverride?: SupportedLocale
): string {
  return defaultI18n.translate(key, params, localeOverride);
}

export const t = translate;

export function getMissingKeys(targetLocale: SupportedLocale): string[] {
  return defaultI18n.getMissingKeys(targetLocale);
}

export function getSupportedLocales(): readonly SupportedLocale[] {
  return SUPPORTED_LOCALES;
}

export function getLocaleMetadata(locale: SupportedLocale): LocaleMeta {
  return LOCALE_METADATA[locale] ?? LOCALE_METADATA[DEFAULT_LOCALE];
}
