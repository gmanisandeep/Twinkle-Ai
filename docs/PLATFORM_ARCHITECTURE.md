# TwinkleOS platform architecture

## Implemented flow

```text
Firebase user
  -> authenticated Netlify gateway
  -> provider routing and bounded fallback
  -> resumable agent loop
  -> permission policy
  -> tool execution
  -> per-user store and audit log
  -> deterministic verification
  -> browser text or speech response
```

The `assistant` function owns the authenticated platform API. The browser never receives provider, embedding, search, connector, or worker secrets.

## Providers

The provider layer supports Gemini, DeepSeek, OpenAI-compatible chat-completion endpoints, and a loopback-only Ollama adapter. It normalizes text and token usage, retries transient failures, uses a short circuit-breaker cooldown after repeated failures, and automatically falls back in configured order. Pricing is not assumed: cost estimates are produced only when current per-million-token environment values are configured.

Regular streaming supports Gemini and DeepSeek. When only an OpenAI-compatible provider or Ollama is configured, the stream endpoint returns `501` and the browser automatically uses the normalized non-streaming chat endpoint.

## Agent execution

Agent executions are saved after every round. Each run has configurable round limits, daily quotas, repeated-action detection, provider metadata, tool results, approval state, and a deterministic final verification report. A cold start can resume an approval when Firestore is configured.

Sensitive tools require approval once per execution. Dangerous tools require approval for every unique call. Disabled tools are omitted from execution. The browser permission dialog is a presentation layer; enforcement also happens on the server.

## Tools and connectors

Built-in tools cover web search/page reading, memory, knowledge, projects, tasks, notes, email drafts, reminder records, project files, GitHub connector requests, sandbox execution, and MCP gateway calls. Email tools only create drafts; sending requires a separately configured connector and should remain dangerous.

Search, GitHub, sandbox, and MCP capabilities fail closed until HTTPS endpoints are configured. Code execution never occurs inside the Netlify function; it is delegated to an isolated runner.

## Memory, knowledge, and projects

When a server-side `FIREBASE_SERVICE_ACCOUNT_JSON` is present, data is stored through Firestore REST with a short-lived Google OAuth token. The included rules deny browser clients direct access to all server-owned `twinkleUsers/{uid}` descendants; Firebase Admin credentials bypass these rules inside the authenticated gateway. Without the service account, a process-local store supports development and tests but is intentionally not durable.

Knowledge ingestion extracts text locally in the browser from text, CSV, source code, basic PDFs, and DOCX files. JPEG, PNG, WebP, and GIF images up to 3 MB can be described through the configured Gemini vision model, after which only the description is retained as searchable knowledge. The server chunks extracted text and stores citations. Retrieval combines keyword scoring with semantic cosine similarity when an embedding endpoint is configured, otherwise it transparently falls back to keyword retrieval. Original binary documents are not retained.

## Background work

Users can create and run scheduled goals. The browser opportunistically runs due jobs after sign-in. The scheduled `background-dispatch` function can notify a separately deployed persistent worker every 15 minutes. Netlify alone is not represented as a durable long-running worker; away-from-browser execution remains disabled until `BACKGROUND_WORKER_URL` and `BACKGROUND_WORKER_TOKEN` are set.

The worker must authenticate its own users/tenants, load only due jobs, enforce the same approval policy and quotas, and write execution/audit results back to the user's isolated namespace.

## Voice and devices

Voice input and spoken output use browser speech APIs when supported. Recognition quality and availability vary by browser and operating system. Ollama local mode requires a self-hosted gateway on the same device or network because hosted functions cannot safely access a user's localhost.

## Global product controls

- Authentication: Firebase Google sign-in and server verification.
- Isolation: UID-scoped Firestore paths and security rules.
- Plans and quotas: daily agent-round and token usage records; plan limits are enforced server-side.
- Privacy: cloud/local model preference, user-visible memory, server-data export, and server-data deletion.
- Internationalization: locale engine with English, Hindi, and Telugu foundations.
- Accessibility: labelled controls, keyboard chat input, semantic workspace navigation, reduced reliance on icon-only actions.
- PWA: installable manifest and same-origin static-shell service worker; API responses are never cached.
- Monitoring: request IDs, sanitized structured logs, provider health state, audit records, and verification reports.
- Backups: configure Firestore managed backups and test restoration outside this repository.
- Billing: integrate a billing provider only after webhook signature verification and entitlement synchronization are implemented. No fake subscription state is included.
- Moderation and abuse: authenticated quotas, request-size limits, bounded tools, SSRF protection, connector isolation, and configurable tool disabling form the initial abuse-control layer.

## Production checklist

1. Revoke any key that has ever been shared publicly.
2. Deploy and test `firestore.rules`, then configure the service account only in the host secret manager.
3. Restrict Firebase browser keys by domain and API in Google Cloud.
4. Set exact `ALLOWED_ORIGINS` and current provider models.
5. Keep dangerous connectors disabled until their approval and audit paths are reviewed.
6. Add managed error monitoring with PII redaction and retention limits.
7. Enable Firestore backups, restore drills, account-deletion monitoring, and regional privacy notices.
8. Add signed billing webhooks before exposing paid plans.
9. Run load tests against a non-production environment before increasing quotas.
