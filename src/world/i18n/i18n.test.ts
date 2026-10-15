import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  DICTIONARIES,
  LOCALE_METADATA,
  I18nManager,
  interpolate,
  resolveCanonicalKey,
  isSupportedLocale,
  getLocale,
  setLocale,
  translate,
  t,
  getMissingKeys,
  getSupportedLocales,
  getLocaleMetadata,
  subscribeLocale,
} from "./dictionary.ts";

describe("i18n: dictionary key completeness across all locales", () => {
  it("defines all four required supported locales", () => {
    assert.deepEqual(SUPPORTED_LOCALES, ["en-US", "pcm-NG", "yo-NG", "haw-US"]);
    assert.equal(DEFAULT_LOCALE, "en-US");
  });

  it("has metadata for all supported locales", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const meta = getLocaleMetadata(locale);
      assert.ok(meta, `Metadata missing for ${locale}`);
      assert.equal(meta.code, locale);
      assert.ok(meta.name.length > 0);
      assert.ok(meta.region.length > 0);
      assert.equal(meta.direction, "ltr");
    }
  });

  it("all supported locales have 0 missing keys compared to en-US", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const missing = getMissingKeys(locale);
      assert.deepEqual(
        missing,
        [],
        `Locale ${locale} is missing keys: ${missing.join(", ")}`
      );
    }
  });

  it("all translations across all locales are non-empty strings", () => {
    const defaultKeys = Object.keys(DICTIONARIES["en-US"]);
    assert.ok(defaultKeys.length >= 35, "Dictionary must contain all core items");

    for (const locale of SUPPORTED_LOCALES) {
      const dict = DICTIONARIES[locale];
      for (const key of defaultKeys) {
        assert.ok(
          typeof dict[key] === "string" && dict[key].trim().length > 0,
          `Key "${key}" in locale "${locale}" must be a non-empty string`
        );
      }
    }
  });

  it("covers core map controls in all locales", () => {
    const mapKeys = [
      "map.recenter",
      "map.zoomIn",
      "map.zoomOut",
      "map.rotate",
      "map.layers",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const k of mapKeys) {
        assert.ok(DICTIONARIES[locale][k], `Missing ${k} in ${locale}`);
      }
    }
  });

  it("covers all six needs indicators plus alert actions in all locales", () => {
    const needsKeys = [
      "needs.hunger",
      "needs.energy",
      "needs.hygiene",
      "needs.social",
      "needs.comfort",
      "needs.health",
      "needs.criticalAlert",
      "needs.warningAlert",
      "needs.satisfy",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const k of needsKeys) {
        assert.ok(DICTIONARIES[locale][k], `Missing ${k} in ${locale}`);
      }
    }
  });

  it("covers greetings in all locales", () => {
    const greetingKeys = [
      "greetings.welcome",
      "greetings.goodMorning",
      "greetings.goodAfternoon",
      "greetings.goodEvening",
      "greetings.farewell",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const k of greetingKeys) {
        assert.ok(DICTIONARIES[locale][k], `Missing ${k} in ${locale}`);
      }
    }
  });

  it("covers vouchers in all locales", () => {
    const voucherKeys = [
      "vouchers.balance",
      "vouchers.redeem",
      "vouchers.insufficient",
      "vouchers.earned",
      "vouchers.transfer",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const k of voucherKeys) {
        assert.ok(DICTIONARIES[locale][k], `Missing ${k} in ${locale}`);
      }
    }
  });

  it("covers ride hailing in all locales", () => {
    const rideKeys = [
      "ride.hail",
      "ride.arriving",
      "ride.inTransit",
      "ride.fare",
      "ride.tooFar",
      "ride.arrived",
      "ride.canceled",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const k of rideKeys) {
        assert.ok(DICTIONARIES[locale][k], `Missing ${k} in ${locale}`);
      }
    }
  });

  it("covers room verification in all locales", () => {
    const roomKeys = [
      "room.verify",
      "room.verified",
      "room.pending",
      "room.failed",
      "room.locked",
      "room.unlocked",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const k of roomKeys) {
        assert.ok(DICTIONARIES[locale][k], `Missing ${k} in ${locale}`);
      }
    }
  });

  it("covers status alerts in all locales", () => {
    const alertKeys = [
      "alerts.networkOnline",
      "alerts.networkOffline",
      "alerts.lowEnergy",
      "alerts.emergency",
      "alerts.actionSuccess",
      "alerts.actionError",
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const k of alertKeys) {
        assert.ok(DICTIONARIES[locale][k], `Missing ${k} in ${locale}`);
      }
    }
  });

  it("resolves key aliases correctly", () => {
    assert.equal(resolveCanonicalKey("alerts.online"), "alerts.networkOnline");
    assert.equal(resolveCanonicalKey("alerts.offline"), "alerts.networkOffline");
    assert.equal(resolveCanonicalKey("alerts.success"), "alerts.actionSuccess");
    assert.equal(resolveCanonicalKey("alerts.error"), "alerts.actionError");
    assert.equal(resolveCanonicalKey("map.zoom"), "map.zoomIn");
  });
});

describe("i18n: string interpolation & formatting", () => {
  it("interpolates single placeholder", () => {
    const res = interpolate("Hello, {name}!", { name: "Amaka" });
    assert.equal(res, "Hello, Amaka!");
  });

  it("interpolates multiple placeholders with numbers and strings", () => {
    const res = interpolate("Pay {count} vouchers for {item}.", {
      count: 5,
      item: "Keke Ride",
    });
    assert.equal(res, "Pay 5 vouchers for Keke Ride.");
  });

  it("leaves unmatched placeholders intact", () => {
    const res = interpolate("Need {needed}, have {available}", {
      needed: 10,
    });
    assert.equal(res, "Need 10, have {available}");
  });

  it("returns original template when params are empty or null", () => {
    assert.equal(interpolate("No params here"), "No params here");
    assert.equal(interpolate("Placeholder {var}", {}), "Placeholder {var}");
  });

  it("formats greetings across all locales with parameters", () => {
    const en = t("greetings.welcome", { name: "Koa" }, "en-US");
    assert.equal(en, "Welcome to the city, Koa!");

    const pcm = t("greetings.welcome", { name: "Emeka" }, "pcm-NG");
    assert.equal(pcm, "How far Emeka! You dey welcome to the city!");

    const yo = t("greetings.welcome", { name: "Ade" }, "yo-NG");
    assert.equal(yo, "Ẹ kú àbọ̀ sí ìlú, Ade!");

    const haw = t("greetings.welcome", { name: "Keanu" }, "haw-US");
    assert.equal(
      haw,
      "Aloha mai kāua iā Keanu! E kipa mai i ke kūlanakauhale!"
    );
  });

  it("formats voucher transactions with multi-param interpolation", () => {
    const en = t(
      "vouchers.insufficient",
      { needed: 15, available: 5 },
      "en-US"
    );
    assert.equal(
      en,
      "Insufficient vouchers: required 15, available 5"
    );

    const pcm = t(
      "vouchers.insufficient",
      { needed: 15, available: 5 },
      "pcm-NG"
    );
    assert.equal(
      pcm,
      "Voucher no reach: need 15, but na 5 you get"
    );

    const yo = t(
      "vouchers.insufficient",
      { needed: 15, available: 5 },
      "yo-NG"
    );
    assert.equal(
      yo,
      "Iwe-ẹri kò tó: o nílò 15, ṣùgbọ́n o ní 5"
    );

    const haw = t(
      "vouchers.insufficient",
      { needed: 15, available: 5 },
      "haw-US"
    );
    assert.equal(
      haw,
      "ʻAʻole lawa nā palapala: makemake 15, he 5 wale nō kāu"
    );
  });
});

describe("i18n: locale switching & fallback resolution logic", () => {
  beforeEach(() => {
    setLocale("en-US");
  });

  it("switches active locale and notifies subscribers", () => {
    let notified: string | null = null;
    const unsub = subscribeLocale((newLoc) => {
      notified = newLoc;
    });

    assert.equal(getLocale(), "en-US");
    assert.equal(setLocale("pcm-NG"), true);
    assert.equal(getLocale(), "pcm-NG");
    assert.equal(notified, "pcm-NG");

    // Translation reflects new locale
    assert.equal(t("map.recenter"), "Bring map come center");

    unsub();
    setLocale("yo-NG");
    // Notified should not change after unsubscribe
    assert.equal(notified, "pcm-NG");
  });

  it("rejects invalid locale strings safely", () => {
    assert.equal(isSupportedLocale("fr-FR"), false);
    assert.equal(setLocale("fr-FR" as any), false);
    assert.equal(getLocale(), "en-US");
  });

  it("allows locale override per call without mutating global locale", () => {
    setLocale("en-US");
    const yorubaTranslation = t("needs.hunger", undefined, "yo-NG");
    assert.equal(yorubaTranslation, "Ebi (Oúnjẹ)");
    assert.equal(getLocale(), "en-US");
  });

  it("falls back to en-US when key is missing in target locale", () => {
    const mgr = new I18nManager("pcm-NG");
    // Create custom registry simulating a missing key in a partial locale
    mgr.registerTranslations("pcm-NG", {
      "custom.localOnly": "Local pidgin string",
    });
    mgr.registerTranslations("en-US", {
      "custom.fallbackKey": "Fallback English string",
    });

    // Found in pcm-NG
    assert.equal(mgr.t("custom.localOnly"), "Local pidgin string");
    // Missing in pcm-NG, falls back to en-US
    assert.equal(mgr.t("custom.fallbackKey"), "Fallback English string");
  });

  it("falls back to key string when completely unknown everywhere", () => {
    const key = "unknown.random.key";
    assert.equal(t(key), key);
  });
});
