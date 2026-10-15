/** Adult gate. True only for a numeric age of 18 or more. Null is not allowed. */

export function ageAllowed(years: number | null): boolean {
  return typeof years === "number" && years >= 18;
}
