# Security Policy for CityDesk

## Supported Versions

We follow a security-first approach and actively support the latest version of CityDesk.

| Version | Supported          |
|---------|--------------------|
| Latest  | :white_check_mark: |
| Older   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in CityDesk, please report it responsibly by emailing us at security@citydesk.dev.

Please include the following information in your report:
- A clear description of the vulnerability
- Steps to reproduce the issue
- The potential impact
- Any suggested fixes

## Security Response

We will acknowledge receipt of your report within 24 hours and provide regular updates on our progress.

We strive to resolve all security issues quickly and transparently, while respecting the privacy of our users.

Thank you for helping keep CityDesk secure!
## Chain and key rules (apply to every contribution)
- **Devnet only.** Any code that can reach mainnet (cluster, RPC or genesis hash) must be refused by the existing mainnet guard. PRs that weaken it will be closed.
- **No keys.** The app and server never generate, store, log, or accept a private key or seed phrase, not even for devnet. No key in env files.
- **The user signs.** Every transaction is built unsigned and signed in the user's own wallet.
- **Receive-only.** No spend, trade, swap, payout or custody features.
- **Minting is off** by default (`PROPERTY_MINT_ENABLED=false`).
- Never commit `.env`, DB dumps, tunnel configs, or credentials. CI runs a secret scan.
- If you find a committed secret, report it privately (GitHub Security Advisories on this repo); do not open a public issue.
