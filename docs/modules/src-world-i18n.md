# Internationalization (i18n) Module

The i18n module provides internationalization support for the application, allowing for translation of content into multiple languages with proper fallback mechanisms and locale management.

## Supported Locales

The system supports four locales:
- **English (United States)** (`en-US`) - Default locale
- **Nigerian Pidgin** (`pcm-NG`)
- **Yoruba (Nigeria)** (`yo-NG`)
- **Hawaiian (United States)** (`haw-US`)

## Core Components

### I18nManager Class

The `I18nManager` class is responsible for handling locale switching, translation, and event subscriptions.

#### Constructor
```typescript
new I18nManager(initialLocale?: SupportedLocale)
```

Creates a new instance with an optional initial locale. If no locale is specified, it defaults to "en-US".

#### Methods

- **getLocale()**: Returns the current locale.
- **setLocale(locale: SupportedLocale)**: Sets the current locale and returns `true` if successful.
- **subscribe(listener: (locale: SupportedLocale) => void)**: Subscribes to locale change events. Returns a function to unsubscribe.
- **registerTranslations(locale: string, translations: Record<string, string>)**: Registers or overrides translations for a specific locale.
- **translate(key: DictionaryKey | string, params?: Record<string, string | number | null | undefined>, localeOverride?: SupportedLocale)**: Translates a key and interpolates parameters. Returns the translated text.
- **t(key: DictionaryKey | string, params?: Record<string, string | number | null | undefined>, localeOverride?: SupportedLocale)**: Alias for `translate()`.
- **getMissingKeys(targetLocale: SupportedLocale)**: Returns list of missing keys in a target locale compared to the default locale.

### Utility Functions

- **resolveCanonicalKey(key: string)**: Resolves alias keys to their canonical form.
- **interpolate(template: string, params?: Record<string, string | number | null | undefined>)**: Replaces placeholders in a template string with provided values.
- **isSupportedLocale(locale: unknown)**: Validates if the given string is a supported locale code.
- **getLocale()**: Returns the current locale from the default instance.
- **setLocale(locale: SupportedLocale)**: Sets the current locale on the default instance.
- **subscribeLocale(listener: (locale: SupportedLocale) => void)**: Subscribes to locale changes on the default instance.
- **translate(key, params, localeOverride)**: Translates using the default instance.
- **t(key, params, localeOverride)**: Alias for translate using default instance.
- **getMissingKeys(targetLocale)**: Gets missing keys from the default instance.
- **getSupportedLocales()**: Returns all supported locales.
- **getLocaleMetadata(locale: SupportedLocale)**: Returns metadata for a given locale.

## Translation Keys

The system provides translation key templates for:
- Greetings: `greetings.welcome`, `greetings.goodMorning`, etc.
- Voucher operations: `vouchers.balance`, `vouchers.redeem`, etc.
- Map controls: `map.recenter`, `map.zoomIn`, etc.
- Room verification: `room.verify`, `room.verified`, etc.
- Alerts: `alerts.networkOnline`, `alerts.actionSuccess`, etc.
- Need indicators: `needs.hunger`, `needs.energy`, etc.

## Fallback Resolution Logic

The translation system follows this priority order for resolving translations:
1. Target locale custom dictionary
2. Target locale built-in dictionary
3. Fallback to default locale (`en-US`) custom dictionary
4. Fallback to default locale (`en-US`) built-in dictionary
5. Fallback to key string itself

## Usage Examples

### Basic Translation
```javascript
import { t } from './lib/i18n';

// Translate with default locale
const greeting = t('greetings.welcome');

// Translate with parameters
const personalizedGreeting = t('greetings.welcome', { name: 'Alice' });
```

### Locale Switching
```javascript
import { setLocale, getLocale } from './lib/i18n';

// Change locale
setLocale('pcm-NG');
console.log(getLocale()); // 'pcm-NG'

// Subscribe to locale changes
const unsubscribe = subscribeLocale((newLocale) => {
  console.log(`Locale changed to ${newLocale}`);
});
```

### Custom Translations
```javascript
import { defaultI18n } from './lib/i18n';

// Register custom translation
defaultI18n.registerTranslations('en-US', {
  'greetings.welcome': 'Hello and welcome!'
});
```

## Template Interpolation

Translation templates support parameter interpolation using `{key}` syntax:

```javascript
const message = t('greetings.welcome', { name: 'Alice' });
// Results in: "Welcome to the city, Alice!"

const countMessage = t('vouchers.balance', { count: 42 });
// Results in: "Your voucher balance: 42"
```

## API Reference

All functions provide type safety and are exported from the main module. The `defaultI18n` instance is pre-configured with the default locale set to "en-US".

The module also includes comprehensive tests ensuring proper behavior of all translation and locale management features.