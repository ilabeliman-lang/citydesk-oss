# ADR: License Choice for CityDesk Engine and Application

## Status
Draft

## Context
We need to select an appropriate open-source license for the CityDesk engine and application codebase. This decision impacts how others can use, modify, and distribute our code.

## Options Considered

### MIT License
- **Pros**: Simple, permissive, short text
- **Cons**: No protection against patent claims, no requirement to share improvements

### Apache 2.0 License
- **Pros**: Strong patent protection, clear grant of patent rights, explicit trademark protection
- **Cons**: More complex, requires attribution in documentation

### BSL (Business Source License)
- **Pros**: Provides a path to open source with a future license change
- **Cons**: Complex, potentially confusing for users, not widely adopted

## Decision
We choose the MIT License for the CityDesk engine and application.

## Rationale
The MIT License provides the necessary permissiveness while maintaining simplicity. It aligns well with our goal to encourage broad adoption and contribution. While Apache 2.0 offers stronger patent protections, it is more complex and may deter potential contributors seeking simpler licensing terms. BSL would be too restrictive for our needs.

## Implementation
Update all relevant files to include the MIT license header and reference the full license text in a LICENSE file.