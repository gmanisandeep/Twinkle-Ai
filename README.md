# TwinkleOS

TwinkleOS is an authenticated personal AI workspace with streaming chat, multi-provider fallback, bounded agent execution, permissioned tools, per-user memory and projects, searchable knowledge, voice input, scheduled-goal interfaces, and data controls.

## Security model

- AI, search, embedding, connector, and worker credentials are server-side environment variables only.
- Firebase ID tokens authenticate every gateway and platform request.
- Firestore documents are namespaced by Firebase UID and accessed only with a server-side service account; deploy `firestore.rules` before enabling durable storage.
- Tools are classified as `safe`, `sensitive`, `dangerous`, or `disabled`. Sensitive and dangerous actions pause for explicit approval.
- Public page reading rejects credentials, non-HTTP protocols, private IP ranges, private DNS results, oversized pages, and excessive redirects.
- Provider errors and logs do not return credentials or raw upstream error bodies.

Never commit real keys. Revoke any previously exposed provider key before configuring its replacement.

## Local verification

```powershell
pnpm test
```

The test suite uses only local mocks and does not contact providers or third-party targets.

## Deployment

1. Configure the required variables in `.env.example` through the hosting provider's secret manager.
2. Deploy the Firestore rules in `firestore.rules` to the Firebase project used by authentication.
3. Deploy the `public/` directory and `netlify/functions/` through Netlify.
4. Configure a persistent worker endpoint only if away-from-browser scheduled execution is required.
5. Configure current provider pricing variables only when cost estimates are desired; Twinkle does not hard-code prices.

See `docs/PLATFORM_ARCHITECTURE.md` for component boundaries, production requirements, and operational controls.
