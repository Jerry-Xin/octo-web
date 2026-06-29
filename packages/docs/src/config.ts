// Deployment-level constants (frontend-design §9.1 `@octo/docs-contract`, §11.2).
//
// docs REST endpoints are addressed BARE-RELATIVE on WKApp.apiClient and inherit its
// `/api/v1/` baseURL, resolving to `/api/v1/docs/...`. There is intentionally NO
// separate axios instance / DOCS_API_BASE — the contract finalized on bare-relative
// (frontend-design §11.2(3), boss decision 2026-06-13).

/** collab-token issuing endpoint (bare-relative -> POST /api/v1/docs/collab-token). */
export const COLLAB_TOKEN_PATH = '/docs/collab-token'

/**
 * Read a build-time env var, treating empty/whitespace-only values as "unset".
 * Vite bakes `ENV FOO=${ARG}` as an EMPTY STRING when the build-arg is not passed
 * (not `undefined`), so `?? default` would wrongly keep the empty string. Normalize
 * blank values to the fallback so a missing build-arg falls back to the default.
 */
function envOr(value: unknown, fallback: string): string {
  const s = typeof value === 'string' ? value.trim() : ''
  return s.length > 0 ? s : fallback
}

/**
 * Hocuspocus WebSocket endpoint for ALL collaboration traffic.
 *
 * Both the doc editor (`collab/createCollabEditor.ts`) and the whiteboard board session
 * (`board/collab/useWhiteboardSession.ts`) connect to this SAME endpoint — the backend's
 * unified WS router resolves doc names and 5-segment `:wb:` board names on one server (see
 * the token contract note in `useWhiteboardSession.ts`). There is no separate "board collab"
 * service; boards reuse the doc Hocuspocus endpoint.
 *
 * Resolution order:
 *  1. `VITE_COLLAB_WS_ENDPOINT` (build-arg) — explicit per-environment override, used verbatim.
 *  2. Runtime origin-derived default — when the build-arg is not injected, derive the endpoint
 *     from the page's own host so the deployed bundle reaches the collab server co-located with
 *     it (`ws(s)://<page-host>:<port>`) instead of an unreachable placeholder. The collab port
 *     defaults to the Hocuspocus default 1234 and can be overridden with `VITE_COLLAB_WS_PORT`.
 *     This mirrors the same-origin asset-host trust below and the `window.location.origin`
 *     invite-link derivation — preferring a runtime-derived host over a hardcoded IP keeps the
 *     bundle multi-environment without a rebuild.
 *  3. SSR / unit-test fallback (no `window`) — localhost, never a public placeholder host.
 *
 * The previous default `wss://collab.octo.example.com` was an unreachable placeholder: any
 * deployment built without `VITE_COLLAB_WS_ENDPOINT` silently fell back to it, so every collab
 * socket failed with `net::ERR_CONNECTION_CLOSED` and real-time sync (doc + board) never worked.
 */
const DEFAULT_COLLAB_WS_PORT = '1234'

function originDerivedWsEndpoint(): string {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    // SSR / unit tests: a harmless local default (never a public placeholder host).
    return `ws://localhost:${DEFAULT_COLLAB_WS_PORT}`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const port = envOr(import.meta.env?.VITE_COLLAB_WS_PORT, DEFAULT_COLLAB_WS_PORT)
  return `${proto}//${window.location.hostname}:${port}`
}

export const WS_ENDPOINT = envOr(import.meta.env?.VITE_COLLAB_WS_ENDPOINT, originDerivedWsEndpoint())

/** Refresh collab token when it is within this window of expiry. */
export const TOKEN_REFRESH_LEEWAY_MS = 30_000

// ── Default document addressing (frontend-design §7.2) ───────────────────────
//
// The docs-backend currently exposes only per-doc endpoints (`/docs/:docId/...`)
// — there is no list/create endpoint yet — so `/docs` cannot enumerate documents.
// DocsHome therefore opens a SPECIFIC document: it reads `space`/`folder`/`doc`
// from the URL query (`/docs?space=…&folder=…&doc=…`) and falls back to these
// deployment-configured defaults. The previous hardcoded `d_welcome` pointed at a
// document that does not exist in any DB, so the editor sat forever on
// “Loading document…” (collab-token → not_found, comments → 404) and never mounted.
// Configure these to a real, accessible doc for the target environment.
export const DEFAULT_DOC_SPACE = envOr(import.meta.env?.VITE_DOCS_DEFAULT_SPACE, 'demo')
export const DEFAULT_DOC_FOLDER = envOr(import.meta.env?.VITE_DOCS_DEFAULT_FOLDER, 'f_default')
// DEFAULT_DOC_ID legitimately defaults to empty (no configured default doc).
export const DEFAULT_DOC_ID =
  (import.meta.env?.VITE_DOCS_DEFAULT_DOC as string | undefined)?.trim() || ''

/**
 * Octo object-storage host whitelist for image/attachment URLs (frontend-design §3.7).
 * Any host not in this set is rejected to prevent arbitrary external hotlinking.
 *
 * The presign service signs upload/render URLs whose host is environment-specific
 * (e.g. the real object-store / minio host the browser can reach). That host MUST be
 * whitelisted or sanitize.ts rejects the rendered image even when the backend signs a
 * valid URL. Configure additional hosts at build time via `VITE_DOCS_ASSET_HOSTS`
 * (comma/space-separated host list, e.g. "localhost:9000,minio.internal"). The example
 * defaults below are kept only as harmless placeholders for non-configured builds.
 */
function parseHostList(value: unknown): string[] {
  return typeof value === 'string'
    ? value
        .split(/[\s,]+/)
        .map((h) => h.trim())
        .filter((h) => h.length > 0)
    : []
}

/**
 * The host the page itself is served from (e.g. `192.168.214.189:3000`). Same-origin assets
 * are trusted by default so a deployment that serves images from its own origin (or via a
 * same-origin reverse proxy) renders them without needing an explicit VITE_DOCS_ASSET_HOSTS.
 * This is a safe addition: it only ever whitelists the page's OWN origin, never an arbitrary
 * external host. A separate object-store host (e.g. MinIO on :9000, distinct from the page
 * :3000) is NOT covered by this and still requires VITE_DOCS_ASSET_HOSTS. Empty under SSR/tests.
 */
function sameOriginHost(): string[] {
  return typeof window !== 'undefined' && window.location?.host ? [window.location.host] : []
}

export const ASSET_HOST_WHITELIST = new Set<string>([
  ...sameOriginHost(),
  'assets.octo.example.com',
  'cdn.octo.example.com',
  ...parseHostList(import.meta.env?.VITE_DOCS_ASSET_HOSTS),
])
