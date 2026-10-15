/** In-memory accounts and records. No database. No real users. */

export type Account = {
  id: string;
};

export type DeskRecord = {
  id: string;
  text: string;
};

const accounts = new Map<string, Account>();
const records = new Map<string, { ownerId: string; record: DeskRecord }>();

export function createAccount(id: string): Account {
  const existing = accounts.get(id);
  if (existing) return existing;
  const account: Account = { id };
  accounts.set(id, account);
  return account;
}

export function putRecord(owner: Account, record: DeskRecord): void {
  if (!accounts.has(owner.id)) {
    throw new Error("unknown account");
  }
  records.set(record.id, {
    ownerId: owner.id,
    record: { id: record.id, text: record.text },
  });
}

/** A reader who is not the owner gets null. Missing records are null too. */
export function readRecord(reader: Account, id: string): DeskRecord | null {
  const row = records.get(id);
  if (!row || row.ownerId !== reader.id) return null;
  return { id: row.record.id, text: row.record.text };
}
