/**
 * XR device matrix. Pure data — this module never starts a WebXR session.
 */

export type XrDeviceName = "phone" | "headset" | "glasses";

export type XrDeviceStatus = "untested";

export type XrDeviceRow = {
  name: XrDeviceName;
  status: XrDeviceStatus;
};

/** Phone, headset, and glasses. None have been session-tested. */
export function deviceMatrix(): readonly XrDeviceRow[] {
  return [
    { name: "phone", status: "untested" },
    { name: "headset", status: "untested" },
    { name: "glasses", status: "untested" },
  ];
}
