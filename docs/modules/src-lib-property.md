# src/lib/property

This folder provides utilities for generating content identifiers and property commitments. It implements cryptographic hashing and encoding to ensure data integrity and privacy for property-related records.

- `cid.ts`: Exports a function to generate IPFS CIDv1 strings for raw bytes using SHA-256 and base32 encoding.
- `commit.ts`: Exports utilities for NDU property commitments, including SHA-256 hashing, canonical JSON serialization, and geohashing.
