# scripts/scan

This module provides tools for identifying 3D file formats and managing a background processing queue for scan assets. It enables both inline and standalone worker-based conversion of 3D models.

- `sniff.mjs`: Exports functions to determine a file's format by inspecting its magic bytes and validate USDZ zip structures.
- `jobs.mjs`: Manages the scan job lifecycle, including enqueuing, claiming, and executing the processing pipeline via child processes.
- `worker.mjs`: A standalone Node.js script that polls the database to process pending scan jobs.
