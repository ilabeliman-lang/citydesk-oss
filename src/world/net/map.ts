/**
 * Where each part of City Desk lives. A content id names frozen bytes.
 * It cannot be the street, a login, or a floor that someone can give back.
 */
export const NETWORK_MAP = [
  { part: "The street and the buildings", home: "This server", because: "The map changes. A content id is a snapshot, not a live street." },
  { part: "Who holds a floor or a flat", home: "The database", because: "A hold can be removed. A pinned file cannot be edited." },
  { part: "A public claim receipt", home: "A content id", because: "The receipt is frozen bytes. The same hash is its address on IPFS, once a node pins it." },
  { part: "Photos, receipts, and scans", home: "Encrypted on this server", because: "They are private. A public network would publish them." },
  { part: "A machine offered for hire", home: "The database", because: "An offer can be paused. Nothing is paid from here." },
  { part: "A mint on Solana", home: "Your wallet, later", because: "Devnet only, and this server does not hold a signing key." },
  { part: "A permanent archive", home: "Not connected", because: "Arweave and Irys charge a wallet. Nothing is uploaded, and no new coin is involved." },
] as const;
