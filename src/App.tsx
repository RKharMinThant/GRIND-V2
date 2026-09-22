import { useCallback, useEffect, useState } from 'react'
import { AdminPanel } from './components/AdminPanel'
import { AnimatedPage } from './components/AnimatedPage'
import { AuthScreen } from './components/AuthScreen'
import { CalendarView } from './components/CalendarView'
import { BodyView } from './components/BodyView'
import { CalendarSheet } from './components/CalendarSheet'
import { Dashboard } from './components/Dashboard'
import { LiftEditorSheet } from './components/LiftEditorSheet'
import { LiftProgressSheet } from './components/LiftProgressSheet'
import { LogDetail } from './components/LogDetail'
import { LogFormSheet } from './components/LogFormSheet'
import { LogsList } from './components/LogsList'
import { ProgressView } from './components/ProgressView'
import { SettingsView } from './components/SettingsView'
import { Shell, type Tab } from './components/Shell'
import { Toast } from './components/Toast'
import type { HealthWorkout } from './health/types'
import { useHealth } from './health/useHealth'
import { usePush } from './hooks/usePush'
import { useAuth } from './hooks/useAuth'
import { useLogs } from './hooks/useLogs'
import { useTheme } from './hooks/useTheme'
import { useTrackedLifts } from './hooks/useTrackedLifts'
import { toLocalDateString } from './lib/dates'
import { isRestLog, REST_WORKOUT, type Log, type LogInsert, type TrackedLift } from './types/database'

type LiftSheetState =
  | { mode: 'add'; group?: string }
  | { mode: 'edit'; lift: TrackedLift }
  | null

export default function App() {
  const { preference, resolved, setPreference, toggleLightDark } = useTheme()

  const {
    user,
    displayName,
    weeklyGoal,
    dailyStepGoal,
    distanceUnit,
    weightUnit,
    weekStart,
    notificationPrefs,
    isAdmin,
    loading: authLoading,
    authError,
    setAuthError,
    signIn,
    signUp,
    resendConfirmation,
    signOut,
    updateProfile,
  } = useAuth()

  const {
    logs,
    loading: logsLoading,
    stats,
    photoUrls,
    createLog,
    updateLog,
    removeLog,
  } = useLogs(user?.id)

  const {
    lifts,
    byMuscle,
    loading: liftsLoading,
    addLift,
    updateLift,
    removeLift,
    fetchHistory,
  } = useTrackedLifts(user?.id)

  // Fitbit (Phase 1: mock data, admin only)
  const health = useHealth(isAdmin, logs, logsLoading)

  // Web Push registration for this device (no-op until the user enables it)
  const push = usePush(Boolean(user))

  const [tab, setTab] = useState<Tab>('home')
  const [formOpen, setFormOpen] = useState(false)
  const [formDate, setFormDate] = useState<string | undefined>()
  const [editing, setEditing] = useState<Log | null>(null)
  const [attachWorkout, setAttachWorkout] = useState<HealthWorkout | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [liftSheet, setLiftSheet] = useState<LiftSheetState>(null)
  const [progressLift, setProgressLift] = useState<TrackedLift | null>(null)
  const [toast, setToast] = useState<{ msg: string; variant: 'ok' | 'error' } | null>(null)
  const [adminPanelOpen, setAdminPanelOpen] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [settingsFrom, setSettingsFrom] = useState<Tab>('home')
  /** Workout id from a notification deep link, held until health data arrives */
  const [pendingWorkoutId, setPendingWorkoutId] = useState<string | null>(null)

  const showToast = useCallback((msg: string, variant: 'ok' | 'error' = 'ok') => {
    setToast({ msg, variant })
  }, [])

  // Opened from a workout notification (/app?workout=<id>)
  useEffect(() => {
    const url = new URL(window.location.href)
    const id = url.searchParams.get('workout')
    if (!id) return
    setPendingWorkoutId(id)
    url.searchParams.delete('workout')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [])

  // Opened from a notification that wants Settings (/app?settings=1)
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('settings') !== '1') return
    setSettingsFrom('home')
    setTab('settings')
    url.searchParams.delete('settings')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [])

  // Returning from Google's consent screen (/app?health=connected|error)
  useEffect(() => {
    const url = new URL(window.location.href)
    const result = url.searchParams.get('health')
    if (result !== 'connected' && result !== 'error') return
    showToast(
      result === 'connected' ? 'Fitbit connected' : "Couldn't connect Fitbit",
      result === 'connected' ? 'ok' : 'error',
    )
    url.searchParams.delete('health')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [showToast])

  const detailLog = detailId ? logs.find((l) => l.id === detailId) ?? null : null

  async function handleSave(data: LogInsert, photoFile: File | null, removePhoto: boolean) {
    if (editing) {
      await updateLog(editing.id, data, photoFile, removePhoto)
      showToast('Session updated')
      setEditing(null)
    } else {
      await createLog(data, photoFile)
      showToast('Session logged')
    }
  }

  function openNew(date?: string) {
    setEditing(null)
    setAttachWorkout(null)
    setFormDate(date)
    setFormOpen(true)
  }

  async function logRestDay(date?: string) {
    const logDate = date || toLocalDateString()
    const existing = logs.find((l) => l.log_date === logDate && isRestLog(l.workout))
    if (existing) {
      showToast('Rest already logged for that day')
      openDetail(existing.id)
      return
    }
    try {
      await createLog({
        log_date: logDate,
        workout: REST_WORKOUT,
        workout_type: null,
        focus_areas: null,
        duration: null,
        meal: null,
        notes: null,
        protein_g: null,
        creatine_g: null,
      })
      showToast('Rest day logged')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not log rest day', 'error')
      throw e
    }
  }

  const openFromWorkout = useCallback((workout: HealthWorkout) => {
    setEditing(null)
    setFormDate(undefined)
    setAttachWorkout(workout)
    setFormOpen(true)
  }, [])

  // A workout notification arrives before the Fitbit data is loaded, so hold the id
  // from the deep link and open the log sheet once that workout actually shows up.
  useEffect(() => {
    if (!pendingWorkoutId) return
    const match = health.workouts.find((w) => w.id === pendingWorkoutId)
    if (!match) return
    setPendingWorkoutId(null)
    openFromWorkout(match)
  }, [pendingWorkoutId, health.workouts, openFromWorkout])

  function openEdit(log: Log) {
    setDetailId(null)
    setAttachWorkout(null)
    setEditing(log)
    setFormDate(undefined)
    setFormOpen(true)
  }

  function openDetail(id: string) {
    setDetailId(id)
  }

  function openDay(date: string) {
    const dayLogs = logs.filter((l) => l.log_date === date)
    if (dayLogs.length === 1) openDetail(dayLogs[0].id)
    else if (dayLogs.length > 1) {
      setTab('history')
      openDetail(dayLogs[0].id)
    }
  }

  if (authLoading) {
    return (
      <div className="boot-screen">
        <div className="logo" style={{ fontSize: '1.4rem' }}>
          GRIND<span>.</span>
        </div>
        <div className="spinner" />
      </div>
    )
  }

  if (!user) {
    return (
      <AuthScreen
        onSignIn={signIn}
        onSignUp={signUp}
        onResendConfirmation={resendConfirmation}
        authError={authError}
        clearError={() => setAuthError(null)}
        themePreference={preference}
        resolvedTheme={resolved}
        onThemeCycle={toggleLightDark}
      />
    )
  }

  return (
    <>
      <Shell
        tab={tab}
        displayName={displayName}
        themePreference={preference}
        resolvedTheme={resolved}
        onThemeCycle={toggleLightDark}
        onTab={setTab}
        onNewLog={() => openNew()}
        onOpenSettings={() => {
          setSettingsFrom(tab === 'settings' ? 'home' : tab)
          setTab('settings')
        }}
        isAdmin={isAdmin}
        onAdminPanel={() => setAdminPanelOpen(true)}
        showBody={health.enabled}
      >
        {logsLoading && logs.length === 0 ? (
          <div className="page" style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
            <div className="spinner" />
          </div>
        ) : (
          <AnimatedPage
            pageKey={tab}
            tabIndex={
              tab === 'home' ? 0 : tab === 'history' ? 1 : tab === 'progress' ? 2 : 3
            }
          >
            {tab === 'home' && (
              <Dashboard
                logs={logs}
                stats={stats}
                photoUrls={photoUrls}
                displayName={displayName}
                weeklyGoal={weeklyGoal}
                onOpenLog={openDetail}
                onLogToday={() => openNew()}
                onLogDate={(date) => openNew(date)}
                onOpenDay={openDay}
                onViewAll={() => setTab('history')}
                onRestDay={logRestDay}
                health={health}
                onLogWorkout={openFromWorkout}
                weekStart={weekStart}
                distanceUnit={distanceUnit}
                stepGoal={dailyStepGoal}
                onOpenBody={() => setTab('body')}
              />
            )}
            {tab === 'history' && (
              <LogsList
                logs={logs}
                photoUrls={photoUrls}
                onOpenLog={openDetail}
                onOpenCalendar={() => setCalendarOpen(true)}
              />
            )}
            {tab === 'progress' && (
              <ProgressView
                logs={logs}
                weeklyGoal={weeklyGoal}
                weekStart={weekStart}
                byMuscle={byMuscle}
                liftsLoading={liftsLoading}
                onOpenAdd={(group) => setLiftSheet({ mode: 'add', group })}
                onOpenLift={(lift) => setProgressLift(lift)}
              />
            )}
            {tab === 'body' && (
              <BodyView health={health} stepGoal={dailyStepGoal} distanceUnit={distanceUnit} />
            )}
            {tab === 'settings' && (
              <SettingsView
                email={user.email ?? ''}
                displayName={displayName}
                weeklyGoal={weeklyGoal}
                dailyStepGoal={dailyStepGoal}
                distanceUnit={distanceUnit}
                weightUnit={weightUnit}
                weekStart={weekStart}
                notificationPrefs={notificationPrefs}
                push={push}
                themePreference={preference}
                onThemeChange={setPreference}
                onUpdateProfile={async (patch) => {
                  await updateProfile(patch)
                }}
                health={health}
                logs={logs}
                lifts={lifts}
                isAdmin={isAdmin}
                onAdminPanel={() => setAdminPanelOpen(true)}
                onSignOut={() => void signOut()}
                onBack={() => setTab(settingsFrom)}
              />
            )}
            {tab === 'calendar' && (
              <CalendarView
                logs={logs}
                onOpenLog={openDetail}
                onCreateForDate={(date) => openNew(date)}
              />
            )}
          </AnimatedPage>
        )}
      </Shell>

      {/* Root-level sheets — same layer as Log, above dock / page transforms */}
      <CalendarSheet
        open={calendarOpen}
        logs={logs}
        onClose={() => setCalendarOpen(false)}
        onOpenLog={openDetail}
        onCreateForDate={(date) => openNew(date)}
      />

      <LogFormSheet
        open={formOpen}
        initial={editing}
        defaultDate={formDate}
        existingPhotoUrl={editing ? photoUrls[editing.id] : undefined}
        logs={logs}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
          setFormDate(undefined)
          setAttachWorkout(null)
        }}
        onSave={handleSave}
        healthWorkouts={health.isConnected ? health.workouts : undefined}
        healthSource={health.source}
        attachWorkout={attachWorkout}
      />

      <LiftProgressSheet
        lift={progressLift}
        fetchHistory={fetchHistory}
        onClose={() => setProgressLift(null)}
        onEdit={(lift) => {
          setProgressLift(null)
          setLiftSheet({ mode: 'edit', lift })
        }}
        onDelete={async (lift) => {
          await removeLift(lift.id)
          showToast('Lift removed')
          setProgressLift(null)
        }}
      />

      <LiftEditorSheet
        open={liftSheet != null}
        mode={liftSheet?.mode ?? 'add'}
        defaultUnit={weightUnit}
        initialGroup={liftSheet?.mode === 'add' ? liftSheet.group : undefined}
        lift={liftSheet?.mode === 'edit' ? liftSheet.lift : null}
        onClose={() => setLiftSheet(null)}
        onSave={async (input) => {
          if (liftSheet?.mode === 'edit') {
            const updated = await updateLift(liftSheet.lift.id, input)
            showToast('Lift updated')
            setLiftSheet(null)
            // Keep progress sheet in sync if reopened
            setProgressLift(null)
            void updated
          } else {
            await addLift(input)
            showToast('Lift added')
            setLiftSheet(null)
          }
        }}
        onDelete={
          liftSheet?.mode === 'edit'
            ? async () => {
                await removeLift(liftSheet.lift.id)
                showToast('Lift removed')
                setLiftSheet(null)
                setProgressLift(null)
              }
            : undefined
        }
      />

      <LogDetail
        log={detailLog}
        photoUrl={detailLog ? photoUrls[detailLog.id] : undefined}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDelete={async (id) => {
          try {
            await removeLog(id)
            showToast('Entry deleted')
          } catch (e) {
            showToast(e instanceof Error ? e.message : 'Delete failed', 'error')
            throw e
          }
        }}
      />

      <Toast
        message={toast?.msg ?? null}
        variant={toast?.variant}
        onDone={() => setToast(null)}
      />

      {/* Admin Panel — only for rkharmthant@gmail.com */}
      {isAdmin && adminPanelOpen && (
        <AdminPanel onClose={() => setAdminPanelOpen(false)} />
      )}
    </>
  )
}
