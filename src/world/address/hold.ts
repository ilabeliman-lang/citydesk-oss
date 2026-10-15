/** An address is the building. People hold the title, a floor, or a flat. Not an agent office. */
export type HoldKind = "title" | "floor" | "flat";

export type Hold = {
  addressId: string;
  userId: string;
  name: string;
  kind: HoldKind;
  /** 0 with kind "title" means the whole shell. A floor or flat names its storey (1 = street floor). */
  floor: number;
  /** Empty except for a flat, e.g. "A". */
  unit: string;
};

const KEY = "ndu.address.v1";

export function readHolds(): Hold[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]") as Hold[];
    return Array.isArray(raw) ? raw.filter((h) => h && h.addressId && h.userId && h.kind) : [];
  } catch {
    return [];
  }
}

function writeHolds(rows: Hold[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event("ndu-address"));
}

export function onHolds(fn: () => void): () => void {
  window.addEventListener("ndu-address", fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener("ndu-address", fn);
    window.removeEventListener("storage", fn);
  };
}

export function holdsAt(addressId: string): Hold[] {
  return readHolds().filter((h) => h.addressId === addressId);
}

/** Title holders share the shell. One renter per floor. One name per flat. */
export function claimHold(next: Hold): { ok: true } | { ok: false; reason: string } {
  const rows = readHolds();
  const same = (h: Hold) => h.addressId === next.addressId && h.userId === next.userId && h.kind === next.kind && h.floor === next.floor && h.unit === next.unit;
  if (rows.some(same)) return { ok: true };
  if (next.kind === "floor") {
    const taken = rows.find((h) => h.addressId === next.addressId && h.kind === "floor" && h.floor === next.floor && h.userId !== next.userId);
    if (taken) return { ok: false, reason: `Floor ${next.floor} is held by ${taken.name}` };
  }
  if (next.kind === "flat") {
    const taken = rows.find((h) => h.addressId === next.addressId && h.kind === "flat" && h.floor === next.floor && h.unit === next.unit && h.userId !== next.userId);
    if (taken) return { ok: false, reason: `Flat ${next.unit} is held by ${taken.name}` };
  }
  writeHolds([...rows, next]);
  return { ok: true };
}

export function revokeHold(target: Hold, byUserId: string, operator: boolean): boolean {
  const rows = readHolds();
  const next = rows.filter((h) => !(h.addressId === target.addressId && h.userId === target.userId && h.kind === target.kind && h.floor === target.floor && h.unit === target.unit));
  if (next.length === rows.length) return false;
  if (!operator && target.userId !== byUserId) return false;
  writeHolds(next);
  return true;
}

/** Title: every floor. Floor renter: that storey. Flat: that unit's storey. */
export function canDress(addressId: string, userId: string, floor: number): boolean {
  return holdsAt(addressId).some((h) => h.userId === userId && (h.kind === "title" || (h.floor === floor && (h.kind === "floor" || h.kind === "flat"))));
}
