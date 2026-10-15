# src/world/ingest

This module handles the browser-side preprocessing of photos before they are uploaded to the server. It performs metadata stripping, NSFW gating, face detection, and licence plate masking to ensure privacy and safety.

- `safePhoto.ts`: Exports `inspectPhoto` and `finishPhoto` to coordinate the full ingest pipeline, including image decoding, resizing, and final blob generation.
- `models.ts`: Manages the lazy loading, caching, and execution of ONNX runtime sessions for NSFW and face detection models.
- `plates.ts`: Provides `plateBoxes` to detect licence-plate bands in images using luminance contrast analysis without relying on external models.
