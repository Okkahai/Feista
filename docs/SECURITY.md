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
