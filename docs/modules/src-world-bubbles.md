# src/world/bubbles

This folder contains the UI components and state management for the map's "bubble" interface. It provides a system of embossed round buttons and a top-bar pill for navigating the world and toggling UI modes.

- `TopPill.tsx`: Exports the `TopPill` component, which serves as the primary top navigation bar containing search, notifications, and a settings menu.
- `Bubble.tsx`: Exports the `Bubble` component, a reusable, embossed round button with optional badge support.
- `mode.ts`: Manages the global UI state for toggling between "bubbles" and "classic" display modes and handling map visibility.
