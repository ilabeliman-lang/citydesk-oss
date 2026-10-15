/** Key names that look like credentials. Values are never read or returned. */

const LEAK_PARTS = ["password", "token", "kek", "secret"] as const;

/** NDU-UPG u-117: value-shaped PII key names (more than the original four). */
const PII_PARTS = [
  "ssn",
  "nationalid",
  "national_id",
  "nin",
  "iban",
  "sortcode",
  "routing",
  "creditcard",
  "cardnumber",
  "card_number",
  "cvv",
  "cvc",
  "passport",
  "driverslicense",
  "drivers_license",
  "dateofbirth",
  "date_ofbirth",
  "date_of_birth",
  "birthdate",
  "birth_date",
  "dob",
  "taxid",
  "tax_id",
  "phonenumber",
  "phone_number",
  "mobile",
  "streetaddress",
  "street_address",
  "postcode",
  "postalcode",
  "postal_code",
  "zipcode",
  "zip_code",
  "latitude",
  "longitude",
  "ipaddress",
  "ip_address",
  "privatekey",
  "private_key",
  "mnemonic",
  "seedphrase",
  "seed_phrase",
  "apikey",
  "api_key",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "sessionkey",
  "session_key",
  "bearer",
  "authorization",
] as const;

function isLeakKey(key: string): boolean {
  const lower = key.toLowerCase();
  return LEAK_PARTS.some((part) => lower.includes(part)) || PII_PARTS.some((part) => lower.includes(part));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Own key names containing password, token, kek, or secret.
 * Plain-object values are scanned one level down. Nothing deeper.
 */
export function leakKeys(obj: unknown): string[] {
  if (!isRecord(obj)) return [];
  const found: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (isLeakKey(key)) found.push(key);
    if (!isRecord(value)) continue;
    for (const nested of Object.keys(value)) {
      if (isLeakKey(nested)) found.push(nested);
    }
  }
  return found;
}
