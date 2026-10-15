# Atmosphere Module Documentation

## Overview

The Atmosphere module is responsible for simulating realistic sky dynamics and weather conditions in a virtual environment. It includes two main components: `skyGradient.ts` for celestial dome visualization and `weatherEngine.ts` for atmospheric conditions and weather dynamics.

## Components

### 1. Sky Gradient Module (`skyGradient.ts`)

This module handles the computation of celestial sky dome colors, ambient lighting, and phase transitions based on sun position.

#### Key Features:
- Supports 6 celestial phases: night, twilight, dawn, golden_hour, noon, dusk
- Computes smooth color transitions between phases
- Generates CSS gradient strings for rendering
- Provides ambient lighting information for hemisphere lighting

#### Exports:
- `CelestialPhase`: Type definition for different sky phases
- `SkyColorStop`: Interface for gradient color stops
- `HemisphereAmbientLight`: Ambient light information for sky and ground
- `CelestialSky`: Complete sky information including phase, colors, and lighting
- `SkyGradientOptions`: Options for computing the sky
- `computeSkyGradient()`: Main function to compute the sky dome based on altitude and azimuth

#### Celestial Phases:
- **Night**: Stars and deep space colors
- **Twilight**: Transition between night and day
- **Dawn**: Sunrise colors
- **Golden Hour**: Warm sunlight before sunset
- **Noon**: Midday with clear blue sky
- **Dusk**: Sunset colors

### 2. Weather Engine Module (`weatherEngine.ts`)

This module manages atmospheric conditions including weather states, wind dynamics, and transitions between different weather conditions.

#### Key Features:
- Supports 6 weather conditions: clear, overcast, rain, tropical_storm, harmattan_haze, volcanic_vog
- Smooth interpolation between different weather states
- Wind vector calculations with 3D coordinate system
- Particle velocity simulation (e.g., rain drops)
- Cloud drift and precipitation slant calculations

#### Exports:
- `WeatherCondition`: Type definition for different weather conditions
- `WeatherState`: Complete weather information including cloud cover, precipitation, wind, etc.
- `Vector3D`: 3D vector structure
- `WindVector`: Wind vector with components in 3D space
- `WeatherEngine`: Main class for managing weather transitions and updates

#### Weather Conditions:
- **Clear**: Sunny skies with minimal cloud cover
- **Overcast**: Cloudy skies with reduced visibility
- **Rain**: Precipitation with fog and reduced visibility
- **Tropical Storm**: Severe weather with high winds and heavy rain
- **Harmattan Haze**: Saharan dust conditions common in West Africa
- **Volcanic Vog**: Volcanic smog conditions (e.g., Hawaii)

## Integration

The two modules work together to provide a complete atmospheric simulation:
1. `skyGradient.ts` calculates the visual appearance of the sky based on sun position
2. `weatherEngine.ts` manages the atmospheric conditions and weather states
3. Both can be used independently or in combination for realistic environment rendering

## Usage Example

```typescript
// Setup sky gradient
const sky = computeSkyGradient({
  sunAltitude: 30, // degrees above horizon
  sunAzimuth: 180, // direction (0 = North)
});

// Setup weather engine
const weatherEngine = new WeatherEngine('clear');
weatherEngine.transitionTo('rain', 60); // Transition to rain over 60 seconds

// Update both in your main loop
function update(deltaSeconds: number) {
  const sky = computeSkyGradient({
    sunAltitude: sunPosition.altitude,
    sunAzimuth: sunPosition.azimuth
  });

  const weather = weatherEngine.update(deltaSeconds);
}
```
