# Contributing to CityDesk

Thank you for your interest in contributing to CityDesk! We're excited to have you join our community.

## Code of Conduct

Please read and follow our CODE_OF_CONDUCT.md before participating in our project.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:
- A clear description of the problem
- Steps to reproduce it
- Your environment details

### Suggesting Enhancements

We welcome suggestions for improvements. Please open an issue explaining your enhancement idea.

### Pull Requests

When submitting a pull request:
1. Ensure your code follows our style guide
2. Add tests for new functionality
3. Update documentation if needed
4. Write clear commit messages

## Development Setup

To set up the project locally, please follow the instructions in the README.md file.

## Code Review Process

All submissions will be reviewed by maintainers. Make sure to address feedback promptly.

Thank you for contributing!
## Building on CityDesk (open-source workflow)
1. Pick an item from [docs/ROADMAP.md](docs/ROADMAP.md) or [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md).
2. Add on top of existing code; no rewrites of working modules without an ADR in `docs/adr/`.
3. New features ship behind a flag that defaults **off**.
4. Every PR: `npm test`, `npm run typecheck`, `npm run lint`, and the item's acceptance check.
5. Follow [SECURITY.md](SECURITY.md) chain and key rules. No secrets, ever.
6. By contributing you agree your work is licensed under the project license (MIT).
