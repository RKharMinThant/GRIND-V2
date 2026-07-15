import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/* ── Types ─────────────────────────────────────────────────────────────── */
type Invite = {
  id: string
  code: string
  created_at: string
  expires_at: string | null
  max_uses: number
  uses: number
  note: string | null
  revoked: boolean
}

type Profile = {
  id: string
  display_name: string | null
  created_at: string
}

type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked'

function inviteStatus(invite: Invite): InviteStatus {
  if (invite.revoked) return 'revoked'
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return 'expired'
  if (invite.uses >= invite.max_uses) return 'accepted'
  return 'pending'
}

type ExpiryPreset = '24h' | '7d' | '30d' | 'never'
type Props = { onClose: () => void }

const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin

function inviteLink(code: string) {
  return `${SITE_ORIGIN}/invite/${code}`
}

function formatExpiry(expires_at: string | null): string {
  if (!expires_at) return 'Never'
  const d = new Date(expires_at)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function expiryDate(preset: ExpiryPreset): string | null {
  const now = new Date()
  if (preset === '24h') return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  if (preset === '7d')  return new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000).toISOString()
  if (preset === '30d') return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  return null
}

const EXPIRY_LABELS: Record<ExpiryPreset, string> = {
  '24h': '24h',
  '7d': '7 days',
  '30d': '30 days',
  'never': 'Never',
}

/* ── Component ──────────────────────────────────────────────────────────── */
export function AdminPanel({ onClose }: Props) {
  const [invites, setInvites]       = useState<Invite[]>([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState<string | null>(null)

  /* Tab state */
  const [activeTab, setActiveTab]   = useState<'invites' | 'users'>('invites')

  /* Profiles state */
  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)

  /* Generate-form state */
  const [note, setNote]       = useState('')
  const [expiry, setExpiry]   = useState<ExpiryPreset>('7d')
  const [maxUses, setMaxUses] = useState(1)

  const overlayRef = useRef<HTMLDivElement>(null)

  /* ── Fetch all invites ──────────────────────────────────────────────── */
  const fetchInvites = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setInvites((data as Invite[]) ?? [])
    setLoading(false)
  }, [])

  /* ── Fetch all profiles ─────────────────────────────────────────────── */
  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, display_name, created_at')
      .order('created_at', { ascending: false })
    if (err) setError(err.message)
    else setProfiles((data as Profile[]) ?? [])
    setLoadingProfiles(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'invites') {
      void fetchInvites()
    } else {
      void fetchProfiles()
    }
  }, [activeTab, fetchInvites, fetchProfiles])

  /* ── Close on backdrop click ────────────────────────────────────────── */
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  /* ── Generate invite ────────────────────────────────────────────────── */
  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not signed in')
      setGenerating(false)
      return
    }

    const { error: err } = await supabase
      .from('invites')
      .insert({
        created_by: user.id,
        note: note.trim() || null,
        expires_at: expiryDate(expiry),
        max_uses: maxUses,
      })
    if (err) {
      setError(err.message)
    } else {
      setNote('')
      setExpiry('7d')
      setMaxUses(1)
      await fetchInvites()
    }
    setGenerating(false)
  }

  /* ── Copy invite link ───────────────────────────────────────────────── */
  async function handleCopy(invite: Invite) {
    await navigator.clipboard.writeText(inviteLink(invite.code))
    setCopied(invite.id)
    setTimeout(() => setCopied(null), 2000)
  }

  /* ── Revoke invite ──────────────────────────────────────────────────── */
  async function handleRevoke(invite: Invite) {
    const { error: err } = await supabase
      .from('invites')
      .update({ revoked: true })
      .eq('id', invite.id)
    if (err) setError(err.message)
    else setInvites((prev) => prev.map((i) => i.id === invite.id ? { ...i, revoked: true } : i))
  }

  /* ── Stats ──────────────────────────────────────────────────────────── */
  const stats = {
    total:    invites.length,
    pending:  invites.filter((i) => inviteStatus(i) === 'pending').length,
    accepted: invites.filter((i) => inviteStatus(i) === 'accepted').length,
    expired:  invites.filter((i) => inviteStatus(i) === 'expired' || inviteStatus(i) === 'revoked').length,
  }

  return (
    <div className="admin-overlay" ref={overlayRef} onClick={handleOverlayClick} role="dialog" aria-modal aria-label="Admin Panel">
      <div className="admin-panel">

        {/* ── Header ── */}
        <div className="admin-panel-header">
          <div className="admin-panel-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h2 className="admin-panel-title">Admin Panel</h2>
          <button type="button" className="admin-close-btn" onClick={onClose} aria-label="Close admin panel">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Navigation Tabs ── */}
        <div className="admin-panel-tabs-container">
          <div className="admin-panel-tabs">
            <button
              type="button"
              className={`admin-panel-tab ${activeTab === 'invites' ? 'active' : ''}`}
              onClick={() => setActiveTab('invites')}
            >
              Invites
              {stats.pending > 0 && (
                <span className="admin-tab-badge">{stats.pending}</span>
              )}
            </button>
            <button
              type="button"
              className={`admin-panel-tab ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Users
              {profiles.length > 0 && (
                <span className="admin-tab-badge admin-tab-badge--neutral">{profiles.length}</span>
              )}
            </button>
          </div>
        </div>

        {error && <div className="auth-error admin-error">{error}</div>}

        {activeTab === 'invites' ? (
          <>
            {/* ── Invite Stat Cards ── */}
            <div className="admin-stat-bar">
              <div className="admin-stat-card">
                <span className="admin-stat-value">{stats.total}</span>
                <span className="admin-stat-label">Total</span>
              </div>
              <div className="admin-stat-card admin-stat-card--pending">
                <span className="admin-stat-dot admin-stat-dot--pending" aria-hidden />
                <span className="admin-stat-value">{stats.pending}</span>
                <span className="admin-stat-label">Pending</span>
              </div>
              <div className="admin-stat-card admin-stat-card--accepted">
                <span className="admin-stat-dot admin-stat-dot--accepted" aria-hidden />
                <span className="admin-stat-value">{stats.accepted}</span>
                <span className="admin-stat-label">Accepted</span>
              </div>
              <div className="admin-stat-card admin-stat-card--expired">
                <span className="admin-stat-value">{stats.expired}</span>
                <span className="admin-stat-label">Expired</span>
              </div>
            </div>

            {/* ── Scrollable content ── */}
            <div className="admin-table-section">

              {/* ── Generate Form ── */}
              <div className="admin-generate-section">
                <h3 className="admin-section-title">Generate Invite Link</h3>
                <form className="admin-generate-form" onSubmit={handleGenerate}>
                  <div className="field admin-field">
                    <label htmlFor="inviteNote">Label <span className="admin-field-optional">(optional)</span></label>
                    <input
                      id="inviteNote"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. For John"
                      maxLength={60}
                    />
                  </div>

                  <div className="admin-chips-row">
                    <div className="admin-chip-group">
                      <span className="admin-chip-label">Expires</span>
                      {(['24h', '7d', '30d', 'never'] as ExpiryPreset[]).map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`admin-chip ${expiry === p ? 'admin-chip--active' : ''}`}
                          onClick={() => setExpiry(p)}
                        >
                          {EXPIRY_LABELS[p]}
                        </button>
                      ))}
                    </div>

                    <div className="admin-chip-group">
                      <span className="admin-chip-label">Max uses</span>
                      {[1, 3, 5, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`admin-chip ${maxUses === n ? 'admin-chip--active' : ''}`}
                          onClick={() => setMaxUses(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary admin-generate-btn"
                    disabled={generating}
                  >
                    {generating ? (
                      <>
                        <span className="admin-btn-spinner" aria-hidden />
                        Generating
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                        Generate Invite Link
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* ── Divider ── */}
              <div className="admin-divider" />

              {/* ── Invite List ── */}
              <div>
                <h3 className="admin-section-title">
                  All Invites
                  {!loading && invites.length > 0 && (
                    <span className="admin-section-count">{invites.length}</span>
                  )}
                </h3>
                {loading ? (
                  <div className="admin-loading"><div className="spinner" /></div>
                ) : invites.length === 0 ? (
                  <div className="admin-empty">
                    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    No invites yet
                  </div>
                ) : (
                  <>
                    {/* Mobile cards */}
                    <div className="invite-cards">
                      {invites.map((invite, idx) => {
                        const status = inviteStatus(invite)
                        return (
                          <div
                            key={invite.id}
                            className={`invite-card invite-card--${status}`}
                            style={{ animationDelay: `${idx * 40}ms` }}
                          >
                            <div className="invite-card-top">
                              <div className="invite-card-meta">
                                <span className="invite-card-label">
                                  {invite.note ?? <span className="invite-no-note">No label</span>}
                                </span>
                                <span className={`invite-badge invite-badge--${status}`}>
                                  {status.charAt(0).toUpperCase() + status.slice(1)}
                                </span>
                              </div>
                              <div className="invite-card-details">
                                <span className="invite-card-detail-item">
                                  <span className="invite-card-detail-label">Uses</span>
                                  {invite.uses} / {invite.max_uses}
                                </span>
                                <span className="invite-card-detail-sep" aria-hidden>·</span>
                                <span className="invite-card-detail-item">
                                  <span className="invite-card-detail-label">Expires</span>
                                  {formatExpiry(invite.expires_at)}
                                </span>
                              </div>
                            </div>
                            <div className="invite-card-actions">
                              <button
                                type="button"
                                className={`btn invite-copy-btn ${copied === invite.id ? 'invite-copy-btn--copied' : ''}`}
                                onClick={() => void handleCopy(invite)}
                                disabled={status === 'revoked'}
                              >
                                {copied === invite.id ? (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M20 6 9 17l-5-5" />
                                    </svg>
                                    Copied!
                                  </>
                                ) : (
                                  <>
                                    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="9" y="9" width="13" height="13" rx="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    Copy Invite Link
                                  </>
                                )}
                              </button>
                              {status !== 'revoked' && status !== 'expired' && (
                                <button
                                  type="button"
                                  className="btn invite-action-btn invite-action-btn--revoke invite-card-revoke"
                                  onClick={() => void handleRevoke(invite)}
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop table */}
                    <div className="admin-table-wrap invite-table-desktop">
                      <table className="invite-table">
                        <thead>
                          <tr>
                            <th>Label</th>
                            <th>Code</th>
                            <th>Status</th>
                            <th>Uses</th>
                            <th>Expires</th>
                            <th>Created</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invites.map((invite, idx) => {
                            const status = inviteStatus(invite)
                            return (
                              <tr key={invite.id} className={`invite-row invite-row--${status}`} style={{ animationDelay: `${idx * 30}ms` }}>
                                <td className="invite-td-note">{invite.note ?? <span className="invite-no-note">—</span>}</td>
                                <td className="invite-td-code">
                                  <code className="invite-code-chip">{invite.code.slice(0, 8)}…</code>
                                </td>
                                <td>
                                  <span className={`invite-badge invite-badge--${status}`}>
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                  </span>
                                </td>
                                <td className="invite-td-uses">
                                  {invite.uses} / {invite.max_uses}
                                </td>
                                <td className="invite-td-expiry">{formatExpiry(invite.expires_at)}</td>
                                <td className="invite-td-date">
                                  {new Date(invite.created_at).toLocaleDateString(undefined, {
                                    month: 'short', day: 'numeric',
                                  })}
                                </td>
                                <td className="invite-td-actions">
                                  <button
                                    type="button"
                                    className={`btn invite-action-btn ${copied === invite.id ? 'invite-action-btn--copied' : ''}`}
                                    onClick={() => void handleCopy(invite)}
                                    title="Copy invite link"
                                    disabled={status === 'revoked'}
                                  >
                                    {copied === invite.id ? (
                                      <>
                                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M20 6 9 17l-5-5" />
                                        </svg>
                                        Copied
                                      </>
                                    ) : (
                                      <>
                                        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="9" y="9" width="13" height="13" rx="2" />
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                        Copy Link
                                      </>
                                    )}
                                  </button>
                                  {status !== 'revoked' && status !== 'expired' && (
                                    <button
                                      type="button"
                                      className="btn invite-action-btn invite-action-btn--revoke"
                                      onClick={() => void handleRevoke(invite)}
                                      title="Revoke invite"
                                    >
                                      Revoke
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ── Users Stat Card ── */}
            <div className="admin-stat-bar admin-stat-bar--single">
              <div className="admin-stat-card">
                <span className="admin-stat-value">{profiles.length}</span>
                <span className="admin-stat-label">Total Members</span>
              </div>
            </div>

            {/* ── Users List ── */}
            <div className="admin-table-section">
              <h3 className="admin-section-title">
                Registered Members
                {!loadingProfiles && profiles.length > 0 && (
                  <span className="admin-section-count">{profiles.length}</span>
                )}
              </h3>
              {loadingProfiles ? (
                <div className="admin-loading"><div className="spinner" /></div>
              ) : profiles.length === 0 ? (
                <div className="admin-empty">
                  <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  No users yet
                </div>
              ) : (
                <>
                  {/* Mobile cards */}
                  <div className="invite-cards">
                    {profiles.map((profile, idx) => (
                      <div key={profile.id} className="invite-card admin-user-card" style={{ animationDelay: `${idx * 40}ms` }}>
                        <div className="admin-user-avatar">
                          {(profile.display_name ?? 'A')[0].toUpperCase()}
                        </div>
                        <div className="admin-user-info">
                          <span className="admin-user-name">{profile.display_name ?? 'Athlete'}</span>
                          <span className="admin-user-meta">
                            Joined {new Date(profile.created_at).toLocaleDateString(undefined, {
                              month: 'short', day: 'numeric', year: 'numeric'
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop table */}
                  <div className="admin-table-wrap invite-table-desktop">
                    <table className="invite-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>User ID</th>
                          <th>Joined</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map((profile, idx) => (
                          <tr key={profile.id} className="invite-row" style={{ animationDelay: `${idx * 30}ms` }}>
                            <td>
                              <div className="admin-user-cell">
                                <div className="admin-user-avatar admin-user-avatar--sm">
                                  {(profile.display_name ?? 'A')[0].toUpperCase()}
                                </div>
                                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                                  {profile.display_name ?? 'Athlete'}
                                </span>
                              </div>
                            </td>
                            <td>
                              <code className="invite-code-chip">{profile.id.slice(0, 12)}…</code>
                            </td>
                            <td className="invite-td-date">
                              {new Date(profile.created_at).toLocaleDateString(undefined, {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
