# Web worker convention

Workers in this repo are **static build outputs, not runtime-constructed code**.
That keeps SBOM, provenance attestation, the reproducibility gate, and CSP intact.

## Rules

1. **Layout.** One directory per domain under `src/workers/<domain>/`:
   `<domain>.protocol.ts` (shared message types + runtime guards),
   `<domain>.worker.ts` (worker entry), `<domain>.client.ts` (main-thread
   wrapper). Pure logic importable by both lives beside them (e.g. `pipeline.ts`).
2. **Construction.** Only
   `new Worker(new URL("./x.worker.ts", import.meta.url), { type: "module", name })`.
   Banned: `Blob`-URL workers, inline worker strings, `importScripts`,
   `eval` / `new Function`. Worker files add
   `/// <reference lib="webworker" />` so worker globals typecheck without
   colliding with DOM libs.
3. **Protocol.** Versioned discriminated unions (`{ v: 1, kind: "…" }`) defined
   once in `protocol.ts` and imported by both sides. Every inbound message is
   validated by a runtime guard before touching logic; unknown kinds are dropped
   and reported as `{ kind: "error" }`, never thrown across the boundary.
   Large payloads move via transferables, never by cloning megabytes.
4. **Lifecycle.** One worker per tool session, created lazily, terminated on
   reset/unmount. StrictMode double-mount safe. Stale completions are dropped
   by request id on the client. Only the worker touches its domain's OPFS/SQLite
   state; the main thread holds indexes + view-models.
5. **Verification.** Handler/pipeline functions stay pure and unit-tested
   directly in Jest (including a malformed-message test per protocol).
   Playwright runs the real bundled worker — no mocks. Worker chunks must show
   up in the SBOM artifact and the double-build gate must stay green.

Reference implementation: `sysdiagnose-ingest/`.
