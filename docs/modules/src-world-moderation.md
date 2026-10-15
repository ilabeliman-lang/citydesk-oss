# src/world/moderation

This folder contains client-side moderation tools that allow users to report other users and block them. Reports and blocks are stored locally in the browser's localStorage and do not persist across sessions or devices.

- `store.ts`: Provides functions for reporting users, blocking/unblocking users, and retrieving moderation lists with reports and blocked user IDs.
- `store.test.ts`: Contains unit tests for the moderation store functions including reporting, blocking/unblocking, and list operations.
- `ReportButton.tsx`: A React component that allows users to report other users through a UI button.
