/**
 * NDU-UPG kids: optional bedtime card. Short verses from the King James Version (public domain in the
 * US) plus one original blessing written for this app. Parents can turn the card off in settings.
 */
export type Verse = { text: string; ref: string };
export const VERSES: Verse[] = [
  {
    text: "I will both lay me down in peace, and sleep: for thou, LORD, only makest me dwell in safety.",
    ref: "Psalm 4:8 (KJV)",
  },
  {
    text: "The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee.",
    ref: "Numbers 6:24–25 (KJV)",
  },
  {
    text: "Suffer little children, and forbid them not, to come unto me: for of such is the kingdom of heaven.",
    ref: "Matthew 19:14 (KJV)",
  },
  { text: "Casting all your care upon him; for he careth for you.", ref: "1 Peter 5:7 (KJV)" },
  { text: "He that keepeth thee will not slumber.", ref: "Psalm 121:3 (KJV)" },
];
export const BLESSING =
  "Goodnight, little one. You are loved today, tomorrow and always. Sleep in peace.";

/** One verse per day, the same all evening. */
export function verseFor(date: Date): Verse {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const day = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000,
  );
  return VERSES[day % VERSES.length];
}
