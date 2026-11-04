# Security model

- **BYOK credentials**: stored server-side only, envelope-encrypted (per-row data key, AES-256-GCM; master key in the host's secret manager / KMS, rotatable by re-wrapping data keys). The app sends a key once over TLS and only ever sees `last4` + status afterwards. Revocation deletes the ciphertext.
- **Tenant isolation**: every row carries `owner_id`; Postgres row-level security enforces `owner_id = auth.uid()` in addition to API checks. Workers act with the job owner's identity.
- **Logs**: structured logs pass through a redactor (keys, bearer tokens, signed URLs). Provider errors are stored without request headers.
- **Media**: uploads validated by ffprobe (container, codecs, duration, size) before processing; storage keys are random, objects private, access via short-lived signed URLs.
- **Webhooks**: signature verified (Standard Webhooks for Higgsfield, ED25519/JWKS for fal), deduped by delivery id, timestamp window enforced.
- **YouTube**: OAuth tokens encrypted like BYOK keys; minimal scope `youtube.upload` (+ `youtube.readonly` for channel display); `privacyStatus` always sent explicitly; publishing only from an approved review state and the user's publishing policy.
- **Clip Studio rights**: ingestion only from user uploads or authorized sources; no YouTube downloading.
- **Rate limiting**: per-user limits on job creation and credential tests; budget guard on every paid node.
- Threat model and test coverage grow with Phase C; status per control is tracked in `DEVELOPMENT_PROGRESS.md`.

## Database access contract (enforced by `db/migrations`, tested in `db/tests/rls_test.sql`)
- The API logs in as `feista_api` (no privileges of its own) and runs every request as `SET ROLE feista_app` inside an explicit transaction with `SET LOCAL app.user_id = <verified session user>`. `RESET ROLE` therefore drops to a role that can read nothing.
- `app.user_id` comes **only** from the verified auth session, never from client input; RLS stops buggy queries, not an attacker who can run arbitrary SQL — so the API never executes client-supplied SQL and uses parameterized queries only.
- Users are created and emails changed only by the privileged auth path; `feista_app` cannot insert users or update emails.
- Storage keys are generated server-side as `<project_id>/...` and the DB rejects any other prefix.
- Temp tables are revoked from PUBLIC and RLS helper functions pin `search_path`, so nothing can shadow `projects`.
- The privileged migration role (or Supabase `service_role`, which bypasses RLS) is never available to request handlers.
