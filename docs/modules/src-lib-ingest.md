# src/lib/ingest

This folder provides isomorphic, dependency-free utilities for safe content ingestion. It includes tools for image deduplication, feature flag management, and scam detection.

- `phash.ts`: Implements a DCT-based perceptual hash for images and Hamming distance matching to identify duplicate pictures.
- `flags.ts`: Manages ingestion feature flags with support for environment variables on the server and URL/localStorage overrides on the client.
- `scam.ts`: Provides text analysis using rules and a Naive Bayes classifier to flag potential scams or impersonations.
