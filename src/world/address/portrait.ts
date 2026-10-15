/** Your own photo, on your figure only. Neighbours stay faceless. Kept on this phone. */
const KEY = "ndu.portrait.v1";
const MAX = 140_000;

export function readPortrait(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw && raw.startsWith("data:image/") && raw.length <= MAX ? raw : null;
  } catch {
    return null;
  }
}

export function savePortrait(dataUrl: string): boolean {
  if (!dataUrl.startsWith("data:image/") || dataUrl.length > MAX) return false;
  try {
    localStorage.setItem(KEY, dataUrl);
    window.dispatchEvent(new Event("ndu-portrait"));
    return true;
  } catch {
    return false;
  }
}

export function clearPortrait() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("ndu-portrait"));
}

export function onPortrait(fn: () => void): () => void {
  window.addEventListener("ndu-portrait", fn);
  return () => window.removeEventListener("ndu-portrait", fn);
}

/** Shrink a chosen photo to a small face disc before it is stored. */
export function shrinkFace(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const g = c.getContext("2d");
      if (!g) {
        URL.revokeObjectURL(url);
        reject(new Error("no canvas"));
        return;
      }
      const s = Math.min(img.width, img.height);
      g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}
