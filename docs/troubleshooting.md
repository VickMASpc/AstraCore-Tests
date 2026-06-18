# Troubleshooting

## `GEMINI_API_KEY is required`

- Set `GEMINI_API_KEY` in `.env`.
- In tests only, an empty key is allowed.

## Bot starts and exits immediately

- Run `npm run build` before `npm start`.
- Confirm the compiled entrypoint exists at `dist/src/app.js`.
- Confirm the process can open the SQLite path and WhatsApp auth directory.

## Status server is empty

- Check `PUBLIC_STATUS_SERVER=true`.
- `GET /health` should still return JSON even before a WhatsApp connection is open.
- QR is only shown when `WHATSAPP_PRINT_QR=true`.

## WhatsApp does not connect

- Verify the auth directory is writable.
- Check whether the account needs a new pairing cycle.
- If using pairing code, set `WHATSAPP_PAIRING_NUMBER`.

## Research commands fail closed

- Check `ENABLE_GOOGLE_SEARCH=true`.
- Confirm Gemini API access is valid.

## Code execution requests fail closed

- Check `ENABLE_CODE_EXECUTION=true`.
- RPG commands should still reject tool usage by design.

## Repo analysis is rejected

- Only public `https://github.com/<owner>/<repo>` style URLs are accepted.
- Local filesystem paths and non-GitHub URLs are rejected.
