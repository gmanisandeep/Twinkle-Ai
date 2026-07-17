# Twinkle recovered source

Recovered from the public Netlify deployment at:

https://twinkleos.netlify.app/

Recovery date: 2026-07-15

## What was recovered

- The complete deployed `index.html`, under `public/`
- Both deployed CSS files, under `public/css/`
- All ten deployed frontend JavaScript files, under `public/js/`
- The deployed Netlify Function source at `netlify/functions/chat.js`
- The deployed project README, preserved as `README.original.md`

The deployed frontend files were served as readable, unbundled source, so they
are exact copies of the public deployment rather than a decompilation.

## What was reconstructed

- `netlify.toml`, using a separate `public/` directory so function source is not
  published as a static asset
- `.env.example`, based on the environment variables referenced by the function
- `.gitignore`

The original Git history, Netlify dashboard configuration, environment-variable
values, and any files not published by the deployment cannot be recovered from
the public site.

## Run locally

Install the Netlify CLI, copy `.env.example` to `.env`, add your own secret
values, then run:

```powershell
netlify dev
```

The Firebase client configuration is embedded in `js/auth.js`, as it is in the
live deployment. Restrict that Firebase API key to the expected domains and APIs
in Google Cloud/Firebase settings.

## Deploy

Connect this folder to a Netlify site and configure these environment variables:

- `DEEPSEEK_API_KEY`
- `FIREBASE_API_KEY`

`GEMINI_API_KEY` is optional and enables the Google Gemini fallback.

Optional production controls:

- `DEEPSEEK_MODEL` (default `deepseek-v4-pro`)
- `GEMINI_MODELS` (comma-separated fallback order)
- `ALLOWED_ORIGINS` (up to 50 comma-separated, exact HTTP(S) browser origins)
- `RATE_LIMIT_PER_MINUTE` (default `20` per authenticated user and warm function instance)
- `RATE_LIMIT_WINDOW_MS` (default `60000`, clamped between 1 second and 1 hour)
- `PROVIDER_TIMEOUT_MS` (default `45000`, clamped between 5 and 120 seconds)

The gateway accepts same-origin browser calls automatically. Provider keys are
read only inside Netlify Functions and must never be added to files under
`public/`.

The built-in rate limiter is a bounded, best-effort safeguard in each warm
serverless function instance. Use a durable shared rate-limit store if strict
cross-instance enforcement is required.

Do not commit real secret values.
