// Dev-only design preview: every screen with demo data, no login and no network.
//   /preview?screen=home|history|progress|calendar|body|settings|auth
//           |sheet-log|sheet-lift|sheet-lift-edit|sheet-lift-progress|sheet-detail
//           |sheet-grindage|sheet-rest|sheet-calendar
//   &theme=light|dark   (default dark)
// Mounted only when import.meta.env.DEV (see main.tsx), so production builds drop it.

import { useEffect, useMemo, useState } from 'react'
import { AnimatedPage } from '../components/AnimatedPage'
import { AuthScreen } from '../components/AuthScreen'
import { BodyView } from '../components/BodyView'
import { CalendarSheet } from '../components/CalendarSheet'
import { CalendarView } from '../components/CalendarView'
import { Dashboard } from '../components/Dashboard'
import { GrindAgeSheet } from '../components/GrindAgeSheet'
import { LiftEditorSheet } from '../components/LiftEditorSheet'
import { LiftProgressSheet } from '../components/LiftProgressSheet'
import { LogDetail } from '../components/LogDetail'
import { LogFormSheet } from '../components/LogFormSheet'
import { LogsList } from '../components/LogsList'
import { ProgressView } from '../components/ProgressView'
import { RestDaySheet } from '../components/RestDaySheet'
import { SettingsView } from '../components/SettingsView'
import { Shell, type Tab } from '../components/Shell'
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
  'sheet-grindage',
  'sheet-rest',
  'sheet-calendar',
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
  'sheet-grindage': 'home',
  'sheet-rest': 'home',
  'sheet-calendar': 'history',
  'sheet-detail': 'history',
  'sheet-lift': 'progress',
  'sheet-lift-edit': 'progress',
  'sheet-lift-progress': 'progress',
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

const tabIndex = (tab: Tab) => (tab === 'home' ? 0 : tab === 'history' ? 1 : tab === 'progress' ? 2 : 3)

export default function DesignPreview() {
  const initial = useMemo(readParams, [])
  const { screen } = initial
  const [theme, setTheme] = useState<'light' | 'dark'>(initial.theme)
  const [tab, setTab] = useState<Tab>(TAB_FOR_SCREEN[screen] ?? 'home')
  const [settingsFrom, setSettingsFrom] = useState<Tab>('home')

  // Sheet state seeded from the screen
  const [logOpen, setLogOpen] = useState(screen === 'sheet-log')
  const [liftSheet, setLiftSheet] = useState<'add' | 'edit' | null>(
    screen === 'sheet-lift' ? 'add' : screen === 'sheet-lift-edit' ? 'edit' : null,
  )
  const [progressLift, setProgressLift] = useState<TrackedLift | null>(
    screen === 'sheet-lift-progress' ? fx.lifts[0] : null,
  )
  const [detail, setDetail] = useState<Log | null>(screen === 'sheet-detail' ? fx.sampleLog : null)
  const [grindAgeOpen, setGrindAgeOpen] = useState(screen === 'sheet-grindage')
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
    () => ({ data: fx.grindAgeData, loading: false, error: null, refresh: async () => true }),
    [],
  )

  const themePreference: ThemePreference = theme
  const cycleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  const openSettings = (from: Tab) => {
    setSettingsFrom(from)
    setTab('settings')
  }

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
              onOpenGrindAge={() => setGrindAgeOpen(true)}
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

      <GrindAgeSheet
        open={grindAgeOpen}
        data={fx.grindAgeData}
        onRefresh={async () => true}
        onClose={() => setGrindAgeOpen(false)}
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
