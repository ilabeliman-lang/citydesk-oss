# src/world/agents

This folder contains the machine agent system that manages automated agents for knowledge processing. These agents run on dedicated machines and can rewrite notes in the knowledge pool without training new weights.

- `market.ts` - Defines the server functions and types for managing machine agents and the knowledge pool, including registration, listing, and processing functionality
- `AgentBoard.tsx` - Provides the React component for displaying and interacting with the machine agent register, allowing users to register machines and run processing steps