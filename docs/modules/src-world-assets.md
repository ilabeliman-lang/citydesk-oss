# src/world/assets

This folder contains mesh validation utilities for 3D assets in the CityDesk application. It provides functionality to validate GLB uploads, Three.js geometries, and raw vertex data against mobile tier limits and dimensional constraints.

- `meshValidator.ts`: Defines types and functions for validating 3D mesh geometry including triangle count limits, bounding dimensions, and various input formats. Provides validation helpers for procedural geometry and GLB uploads.