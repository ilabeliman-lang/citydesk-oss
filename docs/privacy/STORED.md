# What the street stores

This is a short note of what the street keeps today. It is not a legal opinion and not a finished DPIA.

The street stores the account name. Sign-in writes it on the account row (`user.name`), in the clear. A presence row may also keep a display name. This note does not inventory email, sessions, or tokens.

The street stores placed scans. An imported scan is a `scan_assets` row: a name, a format, a hash, and a storage key for the file on disk. When the owner places it, longitude, latitude, rotation, and scale are stored in the clear, with `placed_at`. Visibility defaults to private. Those scan files are not ciphertext. The placement coordinates are still plaintext.

The street stores property ciphertext. Item labels and group names are stored encrypted (`label_enc`, `name_enc`). Receipt and photo bytes are sealed on disk, and the wrapped data key is stored with them. The server can still open that ciphertext. This is encryption at rest, not end-to-end.

The street stores more than these three things. This note only covers the account name, placed scans, and property ciphertext.
