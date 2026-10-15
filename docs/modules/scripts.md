# scripts

This folder contains utility scripts for managing the application's environment and database. These scripts handle database migrations, local preview server management, and agent-based knowledge processing.

* `migrate.mjs`: Applies pending SQL migration files to the database and tracks them in a `_migrations` table.
* `preview.mjs`: Manages the lifecycle of the QA preview server by stopping existing processes and restarting the server.
* `agent-tick.mjs`: Runs a loop that uses a local model to rewrite notes in the knowledge pool.
