import assert from "node:assert/strict";
import { leakKeys } from "./scan.ts";

const sample = {
  username: "ada",
  password: "redacted-a",
  publicName: "desk",
  SessionSecret: "redacted-b",
  profile: {
    city: "lagos",
    apiToken: "redacted-c",
    wrappedKek: "redacted-d",
    nested: {
      deepPassword: "redacted-e",
    },
  },
  notes: ["token is only in this string"],
  count: 2,
};

const found = leakKeys(sample);
assert.deepEqual(found, ["password", "SessionSecret", "apiToken", "wrappedKek"]);

assert.deepEqual(
  leakKeys({
    PASSWORD: 1,
    access_token: 1,
    KEK: 1,
    client_secret: 1,
    email: 1,
    key: 1,
  }),
  ["PASSWORD", "access_token", "KEK", "client_secret"],
);

assert.deepEqual(leakKeys({ label: "password", title: "token", blurb: "secret", tag: "kek" }), []);
assert.deepEqual(leakKeys({ secret: 1, box: { secret: 2 } }), ["secret", "secret"]);
assert.deepEqual(leakKeys({ bag: { items: { password: 1 } } }), []);
assert.deepEqual(leakKeys({ password: null, profile: null }), ["password"]);
assert.deepEqual(leakKeys({}), []);
assert.deepEqual(leakKeys(null), []);
assert.deepEqual(leakKeys(undefined), []);
assert.deepEqual(leakKeys("password"), []);
assert.deepEqual(leakKeys(["token"]), []);

for (const name of found) {
  assert.equal(name.includes("redacted"), false);
}

console.log(found.join("\n"));

// NDU-UPG u-117: value-shaped PII key names (expanded pattern set)
assert.deepEqual(
  leakKeys({
    ssn: "x",
    nationalId: "x",
    iban: "x",
    sortCode: "x",
    creditCard: "x",
    cvv: "x",
    passportNumber: "x",
    dateOfBirth: "x",
    taxId: "x",
    phoneNumber: "x",
    streetAddress: "x",
    postcode: "x",
    latitude: 1,
    longitude: 2,
    ipAddress: "x",
    privateKey: "x",
    mnemonic: "x",
    apiKey: "x",
    refreshToken: "x",
    bearer: "x",
    // safe keys must still pass through untouched
    username: "ada",
    city: "lagos",
    label: "front door",
    count: 3,
  }).sort(),
  [
    "apiKey", "bearer", "creditCard", "cvv", "dateOfBirth", "iban", "ipAddress",
    "latitude", "longitude", "mnemonic", "nationalId", "passportNumber", "phoneNumber",
    "postcode", "privateKey", "refreshToken", "sortCode", "ssn", "streetAddress", "taxId",
  ].sort(),
);

// one level deep still applies to the new patterns
assert.deepEqual(leakKeys({ profile: { cardNumber: "x", city: "lagos" } }), ["cardNumber"]);
// two levels deep stays out of scope (documented behaviour)
assert.deepEqual(leakKeys({ bag: { items: { ssn: "x" } } }), []);
// values are never read: a plain string mentioning PII is not a leak
assert.deepEqual(leakKeys({ notes: "ssn 123-45-6789, card 4111" }), []);
