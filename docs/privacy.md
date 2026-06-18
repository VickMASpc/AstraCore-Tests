# Privacy

## Separation Rules

- Professional AI and RPG use separate commands and state.
- RPG does not use professional AI memory.
- RPG does not use Google Search or Gemini code execution.
- Group profile views must not reveal private user memory.

## Privacy Modes

- `minimal`: explicit memories only
- `normal`: explicit memories plus low-sensitivity derived preferences
- `rich`: broader professional preferences, still no sensitive inferred traits by default

## Stored Data Categories

- profile facts
- explicit memory facts
- privacy settings
- AI conversation history
- grounded research sources
- public repo analysis metadata
- RPG character and session state

## Logging Restrictions

- no raw env logging
- no Gemini key logging
- no WhatsApp session logging
- no intentional owner-number exposure

## Current Gap

Application logic expects hashed identifiers in audit-style contexts, but repository persistence still writes raw JIDs into some `jid_hash` columns. Fix that before calling the system fully privacy-hardened.
