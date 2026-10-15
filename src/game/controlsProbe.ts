export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  setKeys: (codes: string[]) => void;
  setPos?: (x: number, z: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
