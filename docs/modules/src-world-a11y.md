# src/world/a11y

This module manages accessibility features including motion preferences, contrast settings, and screen reader announcements for the 3D world.

It provides utilities to detect and override system accessibility preferences, manage ARIA live region announcements, and handle server-side rendering safely.

- `a11yGuard.ts`: Implements the accessibility manager that handles prefers-reduced-motion, prefers-contrast detection and overrides, screen reader announcer queue for live region ARIA messages, and safe SSR fallbacks