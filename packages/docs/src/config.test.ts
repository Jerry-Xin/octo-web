import { describe, it, expect, afterEach, vi } from 'vitest'

// WS_ENDPOINT is resolved at module load from import.meta.env + window.location, so each
// case stubs the inputs, resets the module cache, and re-imports to observe the resolution.
async function loadWsEndpoint(): Promise<string> {
  vi.resetModules()
  return (await import('./config.ts')).WS_ENDPOINT
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('WS_ENDPOINT resolution (XIN-124)', () => {
  it('uses VITE_COLLAB_WS_ENDPOINT verbatim when injected', async () => {
    vi.stubEnv('VITE_COLLAB_WS_ENDPOINT', 'ws://192.168.214.189:1234')
    expect(await loadWsEndpoint()).toBe('ws://192.168.214.189:1234')
  })

  it('derives ws://<page-host>:1234 from the page origin when the build-arg is unset', async () => {
    vi.stubEnv('VITE_COLLAB_WS_ENDPOINT', '')
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: '192.168.214.189' } })
    expect(await loadWsEndpoint()).toBe('ws://192.168.214.189:1234')
  })

  it('uses wss when the page is served over https', async () => {
    vi.stubEnv('VITE_COLLAB_WS_ENDPOINT', '')
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'docs.acme.io' } })
    expect(await loadWsEndpoint()).toBe('wss://docs.acme.io:1234')
  })

  it('honours VITE_COLLAB_WS_PORT for the origin-derived default', async () => {
    vi.stubEnv('VITE_COLLAB_WS_ENDPOINT', '')
    vi.stubEnv('VITE_COLLAB_WS_PORT', '9999')
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'host.internal' } })
    expect(await loadWsEndpoint()).toBe('ws://host.internal:9999')
  })

  it('never falls back to an unreachable placeholder host', async () => {
    vi.stubEnv('VITE_COLLAB_WS_ENDPOINT', '')
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: 'localhost' } })
    expect(await loadWsEndpoint()).not.toContain('example.com')
  })
})
