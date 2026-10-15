/**
 * Sun and moon positions — a minimal TypeScript port of SunCalc by Vladimir Agafonkin
 * (https://github.com/mourner/suncalc, BSD-2-Clause, (c) 2011-2015). Vendored instead of an npm
 * dependency so the shared node_modules stays untouched; only the functions NDU uses are kept.
 *
 * Copyright (c) 2014, Vladimir Agafonkin. All rights reserved.
 * Redistribution and use in source and binary forms, with or without modification, are permitted
 * provided that the following conditions are met: 1. Redistributions of source code must retain the
 * above copyright notice, this list of conditions and the following disclaimer. 2. Redistributions in
 * binary form must reproduce the above copyright notice, this list of conditions and the following
 * disclaimer in the documentation and/or other materials provided with the distribution.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
 * WARRANTIES ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY
 * DAMAGES ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE.
 */

const PI = Math.PI;
const rad = PI / 180;
const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquity of the Earth

const toJulian = (date: Date) => date.valueOf() / dayMs - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * dayMs);
const toDays = (date: Date) => toJulian(date) - J2000;

const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuthOf = (H: number, phi: number, dec: number) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitudeOf = (H: number, phi: number, dec: number) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d: number, lw: number) => rad * (280.16 + 360.9856235 * d) - lw;

function astroRefraction(h: number) {
  if (h < 0) h = 0; // formula works for positive altitudes only
  return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);

function eclipticLongitude(M: number) {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372; // perihelion of the Earth
  return M + C + P + PI;
}

function sunCoords(d: number) {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

/** Sun position. azimuth: radians from south, positive towards west (SunCalc convention); altitude: radians above horizon. */
export function getPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { azimuth: azimuthOf(H, phi, c.dec), altitude: altitudeOf(H, phi, c.dec) };
}

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, d: number) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
const observerAngle = (height: number) => (-2.076 * Math.sqrt(height)) / 60;

function getSetJ(h: number, lw: number, phi: number, dec: number, n: number, M: number, L: number) {
  const w = hourAngle(h, phi, dec);
  const a = approxTransit(w, lw, n);
  return solarTransitJ(a, M, L);
}

export type SunTimes = { solarNoon: Date; sunrise: Date; sunset: Date; goldenHourEnd: Date; goldenHour: Date; dawn: Date; dusk: Date };

/** Sunrise/sunset etc. for the UTC day containing `date` at the given place (invalid Dates at polar day/night). */
export function getTimes(date: Date, lat: number, lng: number, height = 0): SunTimes {
  const lw = rad * -lng;
  const phi = rad * lat;
  const dh = observerAngle(height);
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const pair = (angle: number) => {
    const h0 = (angle + dh) * rad;
    const Jset = getSetJ(h0, lw, phi, dec, n, M, L);
    const Jrise = Jnoon - (Jset - Jnoon);
    return [fromJulian(Jrise), fromJulian(Jset)] as const;
  };
  const [sunrise, sunset] = pair(-0.833);
  const [goldenHourEnd, goldenHour] = pair(6);
  const [dawn, dusk] = pair(-6);
  return { solarNoon: fromJulian(Jnoon), sunrise, sunset, goldenHourEnd, goldenHour, dawn, dusk };
}

function moonCoords(d: number) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  const dt = 385001 - 20905 * Math.cos(M);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
}

/** Moon position (same conventions as getPosition, altitude includes refraction). */
export function getMoonPosition(date: Date, lat: number, lng: number): { azimuth: number; altitude: number } {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitudeOf(H, phi, c.dec);
  h = h + astroRefraction(h);
  return { azimuth: azimuthOf(H, phi, c.dec), altitude: h };
}

/** Illuminated fraction of the moon, 0 (new) to 1 (full). */
export function getMoonFraction(date: Date): number {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000; // distance from Earth to Sun in km
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  return (1 + Math.cos(inc)) / 2;
}
