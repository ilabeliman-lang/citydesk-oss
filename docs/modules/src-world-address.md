# src/world/address

This folder manages address holdings and user portraits within the 3D world. It handles claims, revocations, and visibility of different types of holds (title, floor, flat) for addresses, as well as managing user profile pictures.

- `hold.ts`: Defines the Hold type and functions for managing local storage of address holdings, including claiming, revoking, and checking permissions.
- `portrait.ts`: Provides functions for storing and retrieving user portrait images in local storage, including face shrinking functionality.
- `hold.server.ts`: Exports server-side functions for handling address holds with database persistence, including claiming, revoking, and listing holds.