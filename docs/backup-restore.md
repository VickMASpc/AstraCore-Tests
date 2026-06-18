# Backup and Restore

## SQLite Backup

Default database path:

- `./data/astracore.sqlite`

For a clean backup, stop the process first and copy:

- `astracore.sqlite`
- `astracore.sqlite-wal` when present
- `astracore.sqlite-shm` when present

Example:

```bash
cp data/astracore.sqlite backup/astracore.sqlite
cp data/astracore.sqlite-wal backup/astracore.sqlite-wal
cp data/astracore.sqlite-shm backup/astracore.sqlite-shm
```

Also back up:

- `./data/wa-auth/`

Without WhatsApp auth backup, the bot may need to pair again.

## Restore

1. Stop the bot.
2. Restore the database files into `./data/`.
3. Restore `./data/wa-auth/` if needed.
4. Start the bot again.

## Notes

- Keep backups encrypted at rest.
- Do not store backups in the repository.
- Test restore periodically before relying on backups in production.
