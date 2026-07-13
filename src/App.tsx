import { useCallback, useState } from 'react'
import { AnimatedPage } from './components/AnimatedPage'
import { AuthScreen } from './components/AuthScreen'
import { CalendarView } from './components/CalendarView'
import { Dashboard } from './components/Dashboard'
import { LiftEditorSheet } from './components/LiftEditorSheet'
import { LiftProgressSheet } from './components/LiftProgressSheet'
import { LogDetail } from './components/LogDetail'
import { LogFormSheet } from './components/LogFormSheet'
import { LogsList } from './components/LogsList'
import { ProgressView } from './components/ProgressView'
import { Shell, type Tab } from './components/Shell'
import { Toast } from './components/Toast'
import { useAuth } from './hooks/useAuth'
import { useLogs } from './hooks/useLogs'
import { useTheme } from './hooks/useTheme'
import { useTrackedLifts } from './hooks/useTrackedLifts'
import type { Log, LogInsert, TrackedLift } from './types/database'

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
    byMuscle,
    loading: liftsLoading,
    addLift,
    updateLift,
    removeLift,
    fetchHistory,
  } = useTrackedLifts(user?.id)

  const [tab, setTab] = useState<Tab>('home')
  const [formOpen, setFormOpen] = useState(false)
  const [formDate, setFormDate] = useState<string | undefined>()
  const [editing, setEditing] = useState<Log | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [liftSheet, setLiftSheet] = useState<LiftSheetState>(null)
  const [progressLift, setProgressLift] = useState<TrackedLift | null>(null)
  const [toast, setToast] = useState<{ msg: string; variant: 'ok' | 'error' } | null>(null)

  const showToast = useCallback((msg: string, variant: 'ok' | 'error' = 'ok') => {
    setToast({ msg, variant })
  }, [])

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
    setFormDate(date)
    setFormOpen(true)
  }

  function openEdit(log: Log) {
    setDetailId(null)
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
        weeklyGoal={weeklyGoal}
        themePreference={preference}
        resolvedTheme={resolved}
        onThemeChange={setPreference}
        onThemeCycle={toggleLightDark}
        onTab={setTab}
        onSignOut={() => void signOut()}
        onNewLog={() => openNew()}
        onUpdateProfile={async (patch) => {
          await updateProfile(patch)
          showToast('Profile saved')
        }}
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
              />
            )}
            {tab === 'history' && (
              <LogsList logs={logs} photoUrls={photoUrls} onOpenLog={openDetail} />
            )}
            {tab === 'progress' && (
              <ProgressView
                logs={logs}
                weeklyGoal={weeklyGoal}
                byMuscle={byMuscle}
                liftsLoading={liftsLoading}
                onOpenAdd={(group) => setLiftSheet({ mode: 'add', group })}
                onOpenLift={(lift) => setProgressLift(lift)}
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
        }}
        onSave={handleSave}
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
    </>
  )
}
