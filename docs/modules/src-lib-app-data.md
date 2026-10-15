# src/lib/app-data

This module provides types, constants, and utility functions for handling external connector integrations. It manages the definition of available connectors, their associated tools, and the logic for handling login requirements.

- `types.ts`: Defines connector types, tool names, and TypeScript interfaces for tool call results and options.
- `login.ts`: Provides utility functions to check login status and handle redirection to login URLs.
- `index.ts`: Acts as the public entry point, exporting key types and functions from the module.
