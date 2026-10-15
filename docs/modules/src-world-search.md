# src/world/search

This module provides the infrastructure for searching locations, streets, and points of interest. It handles text normalization, document indexing from raw records, and a global search toggle.

- `text.ts`: Exports utilities for text folding, stemming, tokenization, and fuzzy matching via Damerau-Levenshtein distance.
- `docs.ts`: Provides logic to transform raw spatial records into searchable `SearchDoc` objects and generates text for embedding.
- `flag.ts`: Exports a utility to determine if search is enabled based on URL parameters or local storage.
