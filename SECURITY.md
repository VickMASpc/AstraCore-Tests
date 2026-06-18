# Security Policy

## Supported Scope

This repository is intended to run with:

- official Gemini API access through `@google/genai`
- a Baileys-compatible WhatsApp transport
- SQLite-first persistence

Anything outside that scope should be treated as unsupported until explicitly added.

## Hard Security Rules

- Do not commit secrets.
- Do not commit `node_modules`.
- Do not log WhatsApp session data.
- Do not log Gemini API keys.
- Do not hardcode owner numbers.
- Do not add self-modifying behavior.
- Do not add runtime code injection.
- Do not add media or sticker downloaders.
- Do not add adult-command menus.
- Do not execute analyzed public repositories locally.
- Do not use unofficial AI APIs or aggregators.

## Logging

- Use safe logger helpers only.
- Redact API keys, bearer tokens, private keys, `.env` style secrets, and WhatsApp auth/session strings before logging objects.
- Never log raw environment objects.

## Data Handling

- Professional AI and RPG must remain separated.
- RPG must not consume professional AI memory or tools.
- Group responses must not expose private user memory.
- QR output must only be visible when `WHATSAPP_PRINT_QR=true`.

## Reporting

If you find a security issue, do not open a public exploit write-up with secrets, session data, or live tokens. Share:

- affected component
- impact
- reproduction conditions
- mitigation recommendation

## Current Hardening Note

Repository writes still need end-to-end enforcement that stored `jid_hash` fields are populated with hashed values rather than raw JIDs. Treat that as a production hardening item.
