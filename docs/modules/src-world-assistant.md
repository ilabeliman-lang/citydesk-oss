# src/world/assistant

This folder contains the logic for the NDU-AI avatar-bot assistant. It manages input moderation, intent routing, and feature availability.

- `flag.ts`: Exports a function to determine if the assistant is enabled based on environment variables and URL parameters.
- `plan.ts`: Provides the main logic for sanitizing input, moderating content, and routing user text to specific actions or tool calls.
- `match.ts`: Implements normalized string matching and scoring to help the assistant identify target names for "find" or "fly to" commands.
