/** Product work that is blocked on a decision, a licence, or a spend. Shown as Coming soon. Not a promise of a date. */
export type ComingSoonItem = { id: string; title: string; detail: string };

export const COMING_SOON: readonly ComingSoonItem[] = [
  { id: "GAP-5", title: "Photoreal 3D cities", detail: "Google and Cesium 3D tiles, once the licence and the cost are accepted. Not mixed into this map before that." },
  { id: "GAP-6", title: "Offline ward maps", detail: "A saved map for each city, so the block still opens when the live feed is slow." },
  { id: "GAP-8", title: "Cloud scans", detail: "Your room scan stored for you, not only on this phone." },
  { id: "JV-3", title: "Ada beside you", detail: "A guide that walks with you and talks, after a small safe model is chosen." },
  { id: "W2E", title: "Walk to earn", detail: "Stops at real shops. No token, no pay-to-walk, until you set the rules." },
  { id: "NL", title: "Neura laptop", detail: "A desk that can share spare computer time. No money moves until you say so." },
  { id: "OPS-6", title: "Ada in production", detail: "The assistant stays off on the public site until the guard is on." },
  { id: "SEC-9", title: "Server photo check", detail: "A second check on uploads, after the model is chosen. The phone check stays." },
  { id: "AI-GPU", title: "Generated rooms", detail: "Photo-to-3D and restyle. Needs a GPU budget. Not running." },
  { id: "NDU-42", title: "Phone AR", detail: "Look through the camera into the block. Stretch, and not on every phone." },
];
