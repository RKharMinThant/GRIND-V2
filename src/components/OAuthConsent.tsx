import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** What the consent card needs. Everything here comes from the OAuth client, so it is untrusted text. */
export type ConsentDetails = {
  clientName: string
  logoUri?: string
  redirectUri: string
}

type Props = {
  email: string
  details: ConsentDetails
  onApprove: () => Promise<void>
  onDeny: () => Promise<void>
  onSignOut: () => void
}

const PERMISSIONS = [
  'Read your workouts, lifts, measurements and Fitbit health data',
  'Log, edit and delete sessions, lifts and measurements',
  'Add a photo to a log that has none (it can’t view, replace or remove photos)',
  'Change your goals, units and notification settings',
]

/** Where the user lands after deciding: shown up front so a phishing redirect stands out. */
function redirectHost(uri: string): string | null {
  try {
    const u = new URL(uri)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.host : `${u.protocol}//${u.host}`
  } catch {
    return null
  }
}

const KNOWN_HOSTS = ['chatgpt.com', 'openai.com', 'claude.ai', 'claude.com', 'cursor.com', 'meta.ai', 'meta.com', 'localhost', '127.0.0.1']
const KNOWN_SCHEMES = ['cursor:', 'vscode:']
const BLOCKED_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:']

const isLocal = (hostname: string) => hostname === 'localhost' || hostname === '127.0.0.1'

/** Redirect hosts GRIND recognises. Anything else gets a warning, since the client's own text is untrusted. */
function isKnownRedirect(uri: string): boolean {
  try {
    const u = new URL(uri)
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return KNOWN_HOSTS.some((h) => u.hostname === h || (h.includes('.') && u.hostname.endsWith(`.${h}`)))
    }
    return KNOWN_SCHEMES.includes(u.protocol)
  } catch {
    return false
  }
}

/** Only follow redirects that can't run script: https, http to localhost, or a custom app scheme (cursor://). */
function go(url: string) {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error('Unsafe redirect blocked')
  }
  const ok =
    u.protocol === 'https:' ||
    (u.protocol === 'http:' && isLocal(u.hostname)) ||
    (/^[a-z][a-z0-9+.-]*:$/.test(u.protocol) &&
      u.protocol !== 'http:' &&
      !BLOCKED_SCHEMES.includes(u.protocol))
  if (!ok) throw new Error('Unsafe redirect blocked')
  window.location.assign(u.href)
}

function Wordmark() {
  return (
    <div className="logo oauth-logo">
      GRIND<span>.</span>
    </div>
  )
}

/** Full-screen consent view. No data fetching here; see OAuthConsentRoute. */
export function OAuthConsent({ email, details, onApprove, onDeny, onSignOut }: Props) {
  const [busy, setBusy] = useState<'allow' | 'deny' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<(() => void) | null>(null)
  const [logoOk, setLogoOk] = useState(true)

  const host = redirectHost(details.redirectUri)
  const known = isKnownRedirect(details.redirectUri)
  const logo = details.logoUri && /^https:\/\//i.test(details.logoUri) && logoOk ? details.logoUri : null
  const name = details.clientName.trim() || 'An app'

  // Busy stays on after success: the page is about to navigate away.
  const run = useCallback(async (kind: 'allow' | 'deny', fn: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    setRetry(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setRetry(() => () => void run(kind, fn))
      setBusy(null)
    }
  }, [])

  return (
    <main className="oauth-screen">
      <div className="oauth-card">
        <Wordmark />

        <div className="oauth-agent">
          {logo && (
            <img
              className="oauth-agent-logo"
              src={logo}
              alt=""
              width={56}
              height={56}
              referrerPolicy="no-referrer"
              onError={() => setLogoOk(false)}
            />
          )}
          <h1 className="oauth-title">
            <span className="oauth-agent-name">{name}</span> wants to access your GRIND account
          </h1>
          {host && (
            <p className="oauth-site">
              Will send you back to <strong>{host}</strong>
            </p>
          )}
          <p className="oauth-site oauth-muted">Name provided by the app</p>
        </div>

        <p className="oauth-who">
          Signed in as <strong>{email}</strong> ·{' '}
          <button type="button" className="oauth-link" onClick={onSignOut}>
            Not you? Sign out
          </button>
        </p>

        <p className="t-eyebrow oauth-eyebrow">It will be able to</p>
        <ul className="list-group oauth-perms" aria-label="What this agent can do">
          {PERMISSIONS.map((p) => (
            <li className="list-row oauth-perm" key={p}>
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="m3 8.5 3.2 3.2L13 4.8" />
              </svg>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <p className="oauth-note">
          It acts as you inside GRIND. It can’t view, replace or remove your workout photos, or see your password. You can
          disconnect it any time in Settings → Connected agents.
        </p>

        {!known && (
          <p className="oauth-error" role="alert">
            <span>
              GRIND doesn’t recognise this app. Only allow it if you started this from an app you trust.
            </span>
          </p>
        )}

        {error && (
          <p className="oauth-error" role="alert">
            <span>{error}</span>
            {retry && (
              <button type="button" className="oauth-link" onClick={retry}>
                Retry
              </button>
            )}
          </p>
        )}

        <div className="oauth-actions">
          <button
            type="button"
            className="btn btn-primary btn-lg btn-full"
            disabled={busy !== null}
            aria-busy={busy === 'allow'}
            onClick={() => void run('allow', onApprove)}
          >
            {busy === 'allow' ? 'Allowing…' : 'Allow'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-lg btn-full"
            disabled={busy !== null}
            aria-busy={busy === 'deny'}
            onClick={() => void run('deny', onDeny)}
          >
            {busy === 'deny' ? 'Declining…' : 'Don’t allow'}
          </button>
        </div>
      </div>
    </main>
  )
}

function InvalidLink() {
  return (
    <main className="oauth-screen">
      <div className="oauth-card">
        <Wordmark />
        <div className="card oauth-invalid" role="alert">
          <h1 className="oauth-title">Sign-in link problem</h1>
          <p className="oauth-note">
            This sign-in link has expired or is invalid. Start connecting again from your AI app.
          </p>
          <a className="btn btn-primary btn-full" href="/app">
            Go to GRIND
          </a>
        </div>
      </div>
    </main>
  )
}

type Load =
  | { state: 'loading' }
  | { state: 'invalid' }
  | { state: 'ready'; id: string; details: ConsentDetails }

/** Real wiring: reads ?authorization_id, loads details from Supabase, approves/denies on click only. */
export function OAuthConsentRoute({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  useEffect(() => {
    // Never fetch details inside a frame: a hostile page could overlay the Allow button.
    if (window.top !== window.self) {
      setLoad({ state: 'invalid' })
      return
    }
    const id = new URLSearchParams(window.location.search).get('authorization_id')
    const api = (supabase.auth as { oauth?: typeof supabase.auth.oauth }).oauth
    if (!id || !api) {
      setLoad({ state: 'invalid' })
      return
    }
    let live = true
    api
      .getAuthorizationDetails(id)
      .then(({ data, error }) => {
        if (!live) return
        if (error || !data) return setLoad({ state: 'invalid' })
        // Already consented: Supabase hands back the redirect straight away.
        if (!('authorization_id' in data)) {
          try {
            go(data.redirect_url)
          } catch {
            setLoad({ state: 'invalid' })
          }
          return
        }
        setLoad({
          state: 'ready',
          id,
          details: {
            clientName: data.client?.name ?? '',
            logoUri: data.client?.logo_uri,
            redirectUri: data.redirect_uri,
          },
        })
      })
      .catch(() => live && setLoad({ state: 'invalid' }))
    return () => {
      live = false
    }
  }, [])

  if (load.state === 'invalid') return <InvalidLink />
  if (load.state === 'loading') {
    return (
      <div className="boot-screen" role="status" aria-label="Loading">
        <div className="logo" style={{ fontSize: '1.4rem' }}>
          GRIND<span>.</span>
        </div>
        <div className="spinner" />
      </div>
    )
  }

  const { id, details } = load
  async function decide(fn: typeof supabase.auth.oauth.approveAuthorization) {
    // skipBrowserRedirect: we navigate ourselves so the redirect can be screened.
    const { data, error } = await fn(id, { skipBrowserRedirect: true })
    if (error || !data?.redirect_url) throw new Error(error?.message ?? 'No redirect returned')
    go(data.redirect_url)
  }

  return (
    <OAuthConsent
      email={email}
      details={details}
      onSignOut={onSignOut}
      onApprove={() => decide((i, o) => supabase.auth.oauth.approveAuthorization(i, o))}
      onDeny={() => decide((i, o) => supabase.auth.oauth.denyAuthorization(i, o))}
    />
  )
}
