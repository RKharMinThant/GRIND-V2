// Dev-only design preview: every screen with demo data, no login and no network.
//   /preview?screen=home|history|progress|calendar|body|settings|auth
//           |sheet-log|sheet-lift|sheet-lift-edit|sheet-lift-progress|sheet-detail
//           |grindage|grindage-new|sheet-rest|sheet-calendar   (sheet-grindage = grindage)
//           |instrument   (hero primitives: ArcGauge, Ring glow, CountUp)
//   &theme=light|dark   (default dark)
// Mounted only when import.meta.env.DEV (see main.tsx), so production builds drop it.

import { useEffect, useMemo, useState } from 'react'
import { AnimatedPage } from '../components/AnimatedPage'
import { AuthScreen } from '../components/AuthScreen'
import { BodyView } from '../components/BodyView'
import { CalendarSheet } from '../components/CalendarSheet'
import { CalendarView } from '../components/CalendarView'
import { Dashboard } from '../components/Dashboard'
import { GrindAgePage } from '../components/GrindAgePage'
import { LiftEditorSheet } from '../components/LiftEditorSheet'
import { LiftProgressSheet } from '../components/LiftProgressSheet'
import { LogDetail } from '../components/LogDetail'
import { LogFormSheet } from '../components/LogFormSheet'
import { LogsList } from '../components/LogsList'
import { ProgressView } from '../components/ProgressView'
import { RestDaySheet } from '../components/RestDaySheet'
import { SettingsView } from '../components/SettingsView'
import { Shell, type Tab } from '../components/Shell'
import { ArcGauge } from '../components/charts/ArcGauge'
import { Ring } from '../components/charts/Ring'
import { CountUp } from '../components/CountUp'
import { createMockProvider } from '../health/mockProvider'
import { useHealth } from '../health/useHealth'
import type { GrindAgeState } from '../hooks/useGrindAge'
import { toLocalDateString } from '../lib/dates'
import type { ThemePreference } from '../lib/theme'
import type { Log, TrackedLift } from '../types/database'
import * as fx from './fixtures'

const SCREENS = [
  'home',
  'history',
  'progress',
  'calendar',
  'body',
  'settings',
  'auth',
  'sheet-log',
  'sheet-lift',
  'sheet-lift-edit',
  'sheet-lift-progress',
  'sheet-detail',
  'grindage',
  'grindage-new',
  'sheet-grindage',
  'sheet-rest',
  'sheet-calendar',
  'instrument',
] as const
type Screen = (typeof SCREENS)[number]

const TAB_FOR_SCREEN: Partial<Record<Screen, Tab>> = {
  home: 'home',
  history: 'history',
  progress: 'progress',
  calendar: 'calendar',
  body: 'body',
  settings: 'settings',
  'sheet-log': 'home',
  grindage: 'grind-age',
  'grindage-new': 'grind-age',
  'sheet-grindage': 'grind-age',
  'sheet-rest': 'home',
  'sheet-calendar': 'history',
  'sheet-detail': 'history',
  'sheet-lift': 'progress',
  'sheet-lift-edit': 'progress',
  'sheet-lift-progress': 'progress',
  instrument: 'home',
}

const noop = () => {}
const asyncNoop = async () => {}

function readParams(): { screen: Screen; theme: 'light' | 'dark' } {
  const q = new URLSearchParams(window.location.search)
  const s = q.get('screen') as Screen | null
  return {
    screen: s && (SCREENS as readonly string[]).includes(s) ? s : 'home',
    theme: q.get('theme') === 'light' ? 'light' : 'dark',
  }
}

// Hero primitives on .instrument cards, for eyeballing in both themes
function InstrumentPreview() {
  return (
    <div style={{ display: 'grid', gap: 16, padding: 16, maxWidth: 420, margin: '0 auto' }}>
      <section className="card instrument" data-tone="danger">
        <p className="t-eyebrow t-tone">GRIND Age</p>
        <ArcGauge
          value={31.6}
          min={24}
          max={36}
          fillFrom={30}
          marker={{ value: 30, label: 'Real age' }}
          bands={[
            { from: 24, to: 30, tone: 'accent' },
            { from: 30, to: 36, tone: 'danger' },
          ]}
          endLabels={['Younger', 'Older']}
          tone="danger"
          label="31.6"
          sublabel="1.6 yrs older"
          eyebrow="Your age"
          countUp
          decimals={1}
          ariaLabel="GRIND Age 31.6, 1.6 years older than your real age of 30"
        />
      </section>

      <section className="card instrument">
        <p className="t-eyebrow t-tone">Pace of ageing</p>
        <ArcGauge
          sweep={180}
          value={0.8}
          min={-1}
          max={3}
          marker={{ value: 1, label: 'Calendar' }}
          tone="accent"
          label="0.8x"
          sublabel="Slower than the calendar"
          ariaLabel="Ageing at 0.8 times the calendar rate"
        />
      </section>

      <section className="card instrument" data-tone="heart">
        <p className="t-eyebrow t-tone">Recovery</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 12 }}>
          <Ring progress={0.78} size={140} tone="heart" glow display label="78" sublabel="%" ariaLabel="Recovery 78 percent" />
          <Ring progress={1.2} size={100} glow display label="12,450" sublabel="steps" ariaLabel="12,450 steps" />
        </div>
      </section>

      <section className="card instrument" data-tone="sleep">
        <p className="t-eyebrow t-tone" style={{ marginBottom: 8 }}>Sleep</p>
        <CountUp className="t-display t-display--xl" value={7.6} decimals={1} />
        <div className="t-display t-display--l">
          <CountUp value={12450} />
        </div>
        <div className="t-display t-display--m">
          <CountUp value={92} />
        </div>
      </section>
    </div>
  )
}

const tabIndex = (tab: Tab) => (tab === 'home' ? 0 : tab === 'history' ? 1 : tab === 'progress' ? 2 : 3)

export default function DesignPreview() {
  const initial = useMemo(readParams, [])
  const { screen } = initial
  const [theme, setTheme] = useState<'light' | 'dark'>(initial.theme)
  const [tab, setTab] = useState<Tab>(TAB_FOR_SCREEN[screen] ?? 'home')
  const [settingsFrom, setSettingsFrom] = useState<Tab>('home')
  const [grindAgeFrom, setGrindAgeFrom] = useState<Tab>('home')

  // Sheet state seeded from the screen
  const [logOpen, setLogOpen] = useState(screen === 'sheet-log')
  const [liftSheet, setLiftSheet] = useState<'add' | 'edit' | null>(
    screen === 'sheet-lift' ? 'add' : screen === 'sheet-lift-edit' ? 'edit' : null,
  )
  const [progressLift, setProgressLift] = useState<TrackedLift | null>(
    screen === 'sheet-lift-progress' ? fx.lifts[0] : null,
  )
  const [detail, setDetail] = useState<Log | null>(screen === 'sheet-detail' ? fx.sampleLog : null)
  const [restOpen, setRestOpen] = useState(screen === 'sheet-rest')
  const [calendarOpen, setCalendarOpen] = useState(screen === 'sheet-calendar')

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = theme
    root.style.colorScheme = theme
  }, [theme])

  // Demo provider with an in-memory store, forced connected. connectDelayMs 0 makes
  // connect() write synchronously, so the first health check already sees "connected".
  const [provider] = useState(() => {
    const store = new Map<string, string>()
    const storage = {
      get length() {
        return store.size
      },
      clear: () => store.clear(),
      getItem: (k: string) => store.get(k) ?? null,
      key: (i: number) => [...store.keys()][i] ?? null,
      removeItem: (k: string) => void store.delete(k),
      setItem: (k: string, v: string) => void store.set(k, v),
    } satisfies Storage
    const p = createMockProvider({ getLogs: () => fx.logs, storage, search: '', connectDelayMs: 0 })
    void p.connect()
    return p
  })
  const health = useHealth(true, fx.logs, false, fx.PREVIEW_USER_ID, { provider })

  // Lets a screenshot script wait until demo health data has landed
  useEffect(() => {
    const root = document.documentElement
    if (health.isConnected && health.lastSyncAt > 0 && !health.loading) root.dataset.previewReady = 'true'
    return () => {
      delete root.dataset.previewReady
    }
  }, [health.isConnected, health.lastSyncAt, health.loading])

  const grindAge: GrindAgeState = useMemo(
    () => ({
      data: screen === 'grindage-new' ? fx.grindAgeNewData : fx.grindAgeData,
      loading: false,
      error: null,
      refresh: async () => true,
    }),
    [screen],
  )

  const themePreference: ThemePreference = theme
  const cycleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  const openSettings = (from: Tab) => {
    setSettingsFrom(from)
    setTab('settings')
  }

  if (screen === 'instrument') return <InstrumentPreview />

  if (screen === 'auth') {
    return (
      <AuthScreen
        onSignIn={asyncNoop}
        onSignUp={async (email) => ({ needsEmailConfirmation: false, email })}
        onResendConfirmation={asyncNoop}
        authError={null}
        clearError={noop}
        themePreference={themePreference}
        resolvedTheme={theme}
        onThemeCycle={cycleTheme}
      />
    )
  }

  return (
    <>
      <Shell
        tab={tab}
        displayName={fx.profile.displayName}
        themePreference={themePreference}
        resolvedTheme={theme}
        onThemeCycle={cycleTheme}
        onTab={setTab}
        onNewLog={() => setLogOpen(true)}
        onOpenSettings={() => openSettings(tab === 'settings' ? 'home' : tab)}
        // The Calendar tab only has a dock slot for accounts without the Body tab
        showBody={screen !== 'calendar'}
      >
        <AnimatedPage pageKey={tab} tabIndex={tabIndex(tab)}>
          {tab === 'home' && (
            <Dashboard
              logs={fx.logs}
              stats={fx.stats}
              photoUrls={fx.photoUrls}
              displayName={fx.profile.displayName}
              weeklyGoal={fx.profile.weeklyGoal}
              onOpenLog={(id) => setDetail(fx.logs.find((l) => l.id === id) ?? null)}
              onLogToday={() => setLogOpen(true)}
              onLogDate={() => setLogOpen(true)}
              onOpenDay={(date) => setDetail(fx.logs.find((l) => l.log_date === date) ?? null)}
              onViewAll={() => setTab('history')}
              onRestDay={asyncNoop}
              health={health}
              onLogWorkout={() => setLogOpen(true)}
              weekStart={fx.profile.weekStart}
              distanceUnit={fx.profile.distanceUnit}
              stepGoal={fx.profile.dailyStepGoal}
              onOpenBody={() => setTab('body')}
              grindAge={grindAge}
              onOpenGrindAge={() => {
                setGrindAgeFrom('home')
                setTab('grind-age')
              }}
              onOpenSettings={() => openSettings('home')}
            />
          )}
          {tab === 'history' && (
            <LogsList
              logs={fx.logs}
              photoUrls={fx.photoUrls}
              onOpenLog={(id) => setDetail(fx.logs.find((l) => l.id === id) ?? null)}
              onOpenCalendar={() => setCalendarOpen(true)}
            />
          )}
          {tab === 'progress' && (
            <ProgressView
              logs={fx.logs}
              weeklyGoal={fx.profile.weeklyGoal}
              weekStart={fx.profile.weekStart}
              byMuscle={fx.byMuscle}
              liftsLoading={false}
              onOpenAdd={() => setLiftSheet('add')}
              fetchAllHistory={fx.fetchAllHistory}
              onOpenLift={setProgressLift}
              health={health}
              weightUnit={fx.profile.weightUnit}
            />
          )}
          {tab === 'body' && (
            <BodyView
              health={health}
              stepGoal={fx.profile.dailyStepGoal}
              distanceUnit={fx.profile.distanceUnit}
            />
          )}
          {tab === 'settings' && (
            <SettingsView
              email={fx.profile.email}
              displayName={fx.profile.displayName}
              weeklyGoal={fx.profile.weeklyGoal}
              dailyStepGoal={fx.profile.dailyStepGoal}
              distanceUnit={fx.profile.distanceUnit}
              weightUnit={fx.profile.weightUnit}
              weekStart={fx.profile.weekStart}
              notificationPrefs={fx.profile.notificationPrefs}
              birthDate={fx.profile.birthDate}
              sex={fx.profile.sex}
              push={fx.pushState}
              themePreference={themePreference}
              onThemeChange={(pref) => {
                if (pref === 'light' || pref === 'dark') setTheme(pref)
              }}
              onUpdateProfile={asyncNoop}
              health={health}
              logs={fx.logs}
              lifts={fx.lifts}
              onSignOut={noop}
              onBack={() => setTab(settingsFrom)}
            />
          )}
          {tab === 'grind-age' && (
            <GrindAgePage
              grindAge={grindAge}
              connected
              onBack={() => setTab(grindAgeFrom)}
              onOpenSettings={() => openSettings('grind-age')}
            />
          )}
          {tab === 'calendar' && (
            <CalendarView
              logs={fx.logs}
              onOpenLog={(id) => setDetail(fx.logs.find((l) => l.id === id) ?? null)}
              onCreateForDate={() => setLogOpen(true)}
            />
          )}
        </AnimatedPage>
      </Shell>

      <RestDaySheet
        open={restOpen}
        date={toLocalDateString()}
        displayName={fx.profile.displayName}
        ready
        onConfirm={asyncNoop}
        onClose={() => setRestOpen(false)}
      />

      <CalendarSheet
        open={calendarOpen}
        logs={fx.logs}
        onClose={() => setCalendarOpen(false)}
        onOpenLog={(id) => setDetail(fx.logs.find((l) => l.id === id) ?? null)}
        onCreateForDate={() => setLogOpen(true)}
      />

      <LogFormSheet
        open={logOpen}
        initial={null}
        logs={fx.logs}
        onClose={() => setLogOpen(false)}
        onSave={asyncNoop}
        healthWorkouts={health.isConnected ? health.workouts : undefined}
        healthSource={health.source}
        attachWorkout={null}
      />

      <LiftProgressSheet
        lift={progressLift}
        fetchHistory={fx.fetchHistory}
        onClose={() => setProgressLift(null)}
        onEdit={(lift) => {
          setProgressLift(lift)
          setLiftSheet('edit')
        }}
        onDelete={asyncNoop}
      />

      <LiftEditorSheet
        open={liftSheet != null}
        mode={liftSheet ?? 'add'}
        defaultUnit={fx.profile.weightUnit}
        initialGroup={liftSheet === 'add' ? 'Chest' : undefined}
        lift={liftSheet === 'edit' ? (progressLift ?? fx.lifts[0]) : null}
        onClose={() => setLiftSheet(null)}
        onSave={async () => setLiftSheet(null)}
        onDelete={liftSheet === 'edit' ? asyncNoop : undefined}
      />

      <LogDetail
        log={detail}
        onClose={() => setDetail(null)}
        onEdit={() => {
          setDetail(null)
          setLogOpen(true)
        }}
        onDelete={asyncNoop}
      />
    </>
  )
}
