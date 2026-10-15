/**
 * NDU/CityDesk Weather Engine & Dynamics (#301–#350)
 * Pure state interpolation, transition management, and wind vector physics.
 * Pure math & standard Node/browser built-ins; zero external packages.
 */

import { clamp, lerp, lerpHex } from "./skyGradient.ts";

export type WeatherCondition =
  | 'clear'
  | 'overcast'
  | 'rain'
  | 'tropical_storm'
  | 'harmattan_haze'
  | 'volcanic_vog';

export interface WeatherState {
  condition: WeatherCondition;
  cloudCover: number;         // 0..1
  precipitation: number;      // 0..1 (rain/storm rate)
  fogDensity: number;         // 0..1
  visibilityKm: number;       // visibility distance in km
  windSpeed: number;          // m/s
  windDirection: number;      // degrees 0..360 (from which the wind blows)
  hazeIntensity: number;      // 0..1
  hazeColor: string;          // Hex color of atmospheric aerosol haze
  lightningFrequency: number; // 0..1
  wetness: number;            // 0..1 (ground water accumulation)
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface WindVector {
  directionDegrees: number;
  speedMps: number;
  /** Eastward velocity component (m/s) */
  east: number;
  /** Northward velocity component (m/s) */
  north: number;
  /** Three.js / CityDesk 3D world space velocity X (East = +X) */
  vx: number;
  /** Vertical drift / convection turbulence Y (Up = +Y) */
  vy: number;
  /** Three.js / CityDesk 3D world space velocity Z (South = +Z, North = -Z) */
  vz: number;
}

export const WEATHER_PRESETS: Record<WeatherCondition, WeatherState> = {
  clear: {
    condition: 'clear',
    cloudCover: 0.05,
    precipitation: 0.0,
    fogDensity: 0.02,
    visibilityKm: 42.0,
    windSpeed: 2.2,
    windDirection: 90.0, // Mild trade winds from East
    hazeIntensity: 0.0,
    hazeColor: '#d6e9f8',
    lightningFrequency: 0.0,
    wetness: 0.0,
  },
  overcast: {
    condition: 'overcast',
    cloudCover: 0.95,
    precipitation: 0.0,
    fogDensity: 0.18,
    visibilityKm: 18.0,
    windSpeed: 5.0,
    windDirection: 120.0,
    hazeIntensity: 0.05,
    hazeColor: '#bec9d2',
    lightningFrequency: 0.0,
    wetness: 0.1,
  },
  rain: {
    condition: 'rain',
    cloudCover: 1.0,
    precipitation: 0.65,
    fogDensity: 0.38,
    visibilityKm: 5.5,
    windSpeed: 8.5,
    windDirection: 195.0,
    hazeIntensity: 0.12,
    hazeColor: '#8c9ea8',
    lightningFrequency: 0.05,
    wetness: 0.85,
  },
  tropical_storm: {
    condition: 'tropical_storm',
    cloudCover: 1.0,
    precipitation: 1.0,
    fogDensity: 0.72,
    visibilityKm: 1.2,
    windSpeed: 25.0,
    windDirection: 220.0,
    hazeIntensity: 0.25,
    hazeColor: '#47535f',
    lightningFrequency: 0.85,
    wetness: 1.0,
  },
  harmattan_haze: {
    // West Africa / Sahara dust plume (#306)
    condition: 'harmattan_haze',
    cloudCover: 0.25,
    precipitation: 0.0,
    fogDensity: 0.62,
    visibilityKm: 2.8,
    windSpeed: 6.8,
    windDirection: 45.0, // North-easterly trade wind
    hazeIntensity: 0.88,
    hazeColor: '#c89e6c', // Ochre / terracotta dust
    lightningFrequency: 0.0,
    wetness: 0.0,
  },
  volcanic_vog: {
    // Hawaii / Kilauea volcanic smog (#306)
    condition: 'volcanic_vog',
    cloudCover: 0.38,
    precipitation: 0.0,
    fogDensity: 0.68,
    visibilityKm: 2.1,
    windSpeed: 3.2,
    windDirection: 75.0,
    hazeIntensity: 0.92,
    hazeColor: '#b4ac8a', // Sulfurous pale olive/khaki smog
    lightningFrequency: 0.0,
    wetness: 0.0,
  },
};

export function getWeatherPreset(condition: WeatherCondition): WeatherState {
  return { ...WEATHER_PRESETS[condition] };
}

/**
 * Shortest angular distance interpolation for compass bearings (0..360°).
 */
export function lerpAngleDegrees(a: number, b: number, t: number): number {
  const normA = (((a % 360) + 360) % 360);
  const normB = (((b % 360) + 360) % 360);
  const diff = ((normB - normA + 540) % 360) - 180;
  const result = normA + diff * clamp(t, 0, 1);
  return (((result % 360) + 360) % 360);
}

/**
 * Interpolate smoothly between two weather states with a blend factor 0..1.
 */
export function interpolateWeatherState(
  from: WeatherState,
  to: WeatherState,
  blendFactor: number
): WeatherState {
  const t = clamp(blendFactor, 0, 1);
  return {
    condition: t >= 0.5 ? to.condition : from.condition,
    cloudCover: lerp(from.cloudCover, to.cloudCover, t),
    precipitation: lerp(from.precipitation, to.precipitation, t),
    fogDensity: lerp(from.fogDensity, to.fogDensity, t),
    visibilityKm: lerp(from.visibilityKm, to.visibilityKm, t),
    windSpeed: lerp(from.windSpeed, to.windSpeed, t),
    windDirection: lerpAngleDegrees(from.windDirection, to.windDirection, t),
    hazeIntensity: lerp(from.hazeIntensity, to.hazeIntensity, t),
    hazeColor: lerpHex(from.hazeColor, to.hazeColor, t),
    lightningFrequency: lerp(from.lightningFrequency, to.lightningFrequency, t),
    wetness: lerp(from.wetness, to.wetness, t),
  };
}

/**
 * Compute wind velocity vector from meteorological bearing (direction FROM) and speed (m/s).
 * - 0° is North wind (air moving toward South: vy = 0, north = -speed, vz = +speed)
 * - 90° is East wind (air moving toward West: vy = 0, east = -speed, vx = -speed)
 * - 180° is South wind (air moving toward North: vy = 0, north = +speed, vz = -speed)
 * - 270° is West wind (air moving toward East: vy = 0, east = +speed, vx = +speed)
 */
export function computeWindVector(directionDegrees: number, speedMps: number): WindVector {
  const rad = (((directionDegrees % 360) + 360) % 360) * (Math.PI / 180);
  const speed = Math.max(0, speedMps);

  // Direction wind is blowing TOWARDS is opposite to the compass origin
  const east = -Math.sin(rad) * speed;
  const north = -Math.cos(rad) * speed;

  // 3D Cartesian coordinates (X = East, Y = Up, Z = -North / South):
  const vx = east;
  const vy = 0;
  const vz = -north;

  return {
    directionDegrees: (((directionDegrees % 360) + 360) % 360),
    speedMps: speed,
    east,
    north,
    vx,
    vy,
    vz,
  };
}

/**
 * Compute resultant particle velocity under wind drag (e.g. rain drops, dust motes).
 * @param baseVelocity Free-fall velocity without wind (e.g. { x: 0, y: -9.5, z: 0 } for rain)
 * @param wind Computed wind vector
 * @param dragFactor Horizontal coupling coefficient (0 = no wind effect, 1 = carried at full wind speed)
 */
export function computeParticleVelocity(
  baseVelocity: Vector3D,
  wind: WindVector,
  dragFactor: number = 0.5
): Vector3D {
  const drag = clamp(dragFactor, 0, 1);
  return {
    x: baseVelocity.x + wind.vx * drag,
    y: baseVelocity.y + wind.vy * drag,
    z: baseVelocity.z + wind.vz * drag,
  };
}

/**
 * Compute cloud drift displacement over time (dt in seconds).
 * Clouds at higher altitudes drift with the wind, scaled by an altitude layer factor.
 */
export function computeCloudDrift(
  wind: WindVector,
  dtSeconds: number,
  altitudeMultiplier: number = 1.2
): { dx: number; dz: number } {
  const dt = Math.max(0, dtSeconds);
  const factor = Math.max(0.1, altitudeMultiplier);
  return {
    dx: wind.vx * factor * dt,
    dz: wind.vz * factor * dt,
  };
}

/**
 * Compute rain slant angle and ratio based on wind speed and vertical terminal fall velocity.
 */
export function computeRainSlant(
  windSpeedMps: number,
  fallSpeedMps: number = 9.0
): { angleDegrees: number; slantRatio: number } {
  const fall = Math.max(0.1, fallSpeedMps);
  const wind = Math.max(0, windSpeedMps);
  const angleRad = Math.atan2(wind, fall);
  const angleDegrees = angleRad * (180 / Math.PI);
  return {
    angleDegrees,
    slantRatio: wind / fall,
  };
}

/**
 * Weather Engine managing state, smooth transitions, and dynamic updates.
 */
export class WeatherEngine {
  private currentState: WeatherState;
  private previousState: WeatherState;
  private targetState: WeatherState;
  private transitionDuration: number = 0;
  private transitionElapsed: number = 0;
  private transitioning: boolean = false;

  constructor(
    initialCondition: WeatherCondition = 'clear',
    customInitial?: Partial<WeatherState>
  ) {
    const base = getWeatherPreset(initialCondition);
    this.currentState = { ...base, ...customInitial };
    this.previousState = { ...this.currentState };
    this.targetState = { ...this.currentState };
  }

  getCurrentState(): WeatherState {
    return { ...this.currentState };
  }

  getTargetState(): WeatherState {
    return { ...this.targetState };
  }

  getBlendFactor(): number {
    if (!this.transitioning || this.transitionDuration <= 0) {
      return 1.0;
    }
    return clamp(this.transitionElapsed / this.transitionDuration, 0, 1);
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  getTransitionDuration(): number {
    return this.transitionDuration;
  }

  getTransitionElapsed(): number {
    return this.transitionElapsed;
  }

  /**
   * Set condition immediately without transition.
   */
  setCondition(condition: WeatherCondition): WeatherState {
    this.currentState = getWeatherPreset(condition);
    this.previousState = { ...this.currentState };
    this.targetState = { ...this.currentState };
    this.transitioning = false;
    this.transitionElapsed = 0;
    this.transitionDuration = 0;
    return this.getCurrentState();
  }

  /**
   * Begin smooth transition to target condition or custom state over duration (seconds).
   */
  transitionTo(
    target: WeatherCondition | Partial<WeatherState>,
    durationSeconds: number = 10.0
  ): void {
    const targetState: WeatherState =
      typeof target === 'string'
        ? getWeatherPreset(target)
        : { ...this.currentState, ...target };

    if (durationSeconds <= 0) {
      this.currentState = { ...targetState };
      this.previousState = { ...targetState };
      this.targetState = { ...targetState };
      this.transitioning = false;
      this.transitionElapsed = 0;
      this.transitionDuration = 0;
      return;
    }

    this.previousState = { ...this.currentState };
    this.targetState = { ...targetState };
    this.transitionDuration = Math.max(0.01, durationSeconds);
    this.transitionElapsed = 0;
    this.transitioning = true;
  }

  /**
   * Advance simulation time by deltaSeconds.
   */
  update(deltaSeconds: number): WeatherState {
    if (!this.transitioning) {
      return this.getCurrentState();
    }

    this.transitionElapsed += Math.max(0, deltaSeconds);
    const blend = this.getBlendFactor();
    this.currentState = interpolateWeatherState(this.previousState, this.targetState, blend);

    if (this.transitionElapsed >= this.transitionDuration) {
      this.transitioning = false;
      this.currentState = { ...this.targetState };
    }

    return this.getCurrentState();
  }

  /**
   * Dynamically adjust wind parameters on current and target states.
   */
  setWind(speedMps: number, directionDegrees: number): void {
    const speed = Math.max(0, speedMps);
    const dir = (((directionDegrees % 360) + 360) % 360);
    this.currentState.windSpeed = speed;
    this.currentState.windDirection = dir;
    this.targetState.windSpeed = speed;
    this.targetState.windDirection = dir;
  }

  /**
   * Get current wind vector.
   */
  getWindVector(): WindVector {
    return computeWindVector(this.currentState.windDirection, this.currentState.windSpeed);
  }
}
