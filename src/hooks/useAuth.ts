import { useCallback, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_DISTANCE_UNIT,
  DEFAULT_WEEK_START,
  DEFAULT_WEIGHT_UNIT,
  type DistanceUnit,
  type WeekStart,
  type WeightUnit,
} from '../lib/units'
import type { Profile } from '../types/database'

const DEFAULT_WEEKLY_GOAL = 4
const DEFAULT_DAILY_STEP_GOAL = 10000

/** Added by later migrations; dropped from an update when the column is missing. */
const OPTIONAL_PROFILE_COLUMNS = ['daily_step_goal', 'distance_unit', 'weight_unit', 'week_start'] as const

/** Which migration adds each optional column, so the UI can say what to run. */
const COLUMN_MIGRATION: Record<string, string> = {
  daily_step_goal: '015_daily_step_goal.sql',
  distance_unit: '016_preferences.sql',
  weight_unit: '016_preferences.sql',
  week_start: '016_preferences.sql',
}

/**
 * TEMPORARY dev-only login bypass. In `npm run dev`, if both vars are set in .env.local,
 * sign in automatically instead of showing the login screen. Never active in production builds.
 */
// Read the vars only behind the DEV ternary so production builds strip them
// (Vite also loads .env.local for `npm run build` — the password must never be inlined).
const DEV_EMAIL = import.meta.env.DEV ? import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL : undefined
const DEV_PASSWORD = import.meta.env.DEV ? import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD : undefined
const DEV_AUTO_LOGIN = Boolean(DEV_EMAIL && DEV_PASSWORD)
/** Set on explicit sign-out so the bypass doesn't immediately sign back in (per tab). */
const DEV_SKIP_KEY = 'grind_dev_skip_auto_login'

function devAutoLoginSkipped(): boolean {
  try {
    return sessionStorage.getItem(DEV_SKIP_KEY) === '1'
  } catch {
    return false
  }
}

/** Shared across StrictMode double-mounts so we only sign in once. */
let devAutoLoginPromise: Promise<string | null> | null = null

function devAutoLogin(): Promise<string | null> {
  devAutoLoginPromise ??= supabase.auth
    .signInWithPassword({ email: DEV_EMAIL!, password: DEV_PASSWORD! })
    .then(({ error }) => (error ? `Dev auto-login failed: ${error.message}` : null))
  return devAutoLoginPromise
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  const loadProfile = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let mounted = true
    // Keep the boot screen up while a dev auto-login is in flight (no login-screen flash)
    let autoLoginPending = DEV_AUTO_LOGIN && !devAutoLoginSkipped()

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      if (!data.session && autoLoginPending) {
        const err = await devAutoLogin()
        autoLoginPending = false
        if (!mounted) return
        if (err) {
          setAuthError(err)
          setLoading(false)
        }
        return // success is handled by onAuthStateChange
      }
      autoLoginPending = false
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        void loadProfile(data.session.user.id)
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next && autoLoginPending) return
      setSession(next)
      setUser(next?.user ?? null)
      if (next?.user) {
        void loadProfile(next.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(error.message)
      throw error
    }
  }, [])

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName?: string,
      inviteCode?: string,
    ): Promise<{ needsEmailConfirmation: boolean; email: string }> => {
      setAuthError(null)

      // Validate + atomically redeem the invite code before creating the account
      if (inviteCode) {
        const { error: rpcError } = await supabase.rpc('redeem_invite', { p_code: inviteCode })
        if (rpcError) {
          const msg = rpcError.message || 'Invalid invite code'
          setAuthError(msg)
          throw new Error(msg)
        }
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName || email.split('@')[0] },
        },
      })
      if (error) {
        setAuthError(error.message)
        throw error
      }

      const alreadyRegistered = data.user?.identities && data.user.identities.length === 0
      const needsEmailConfirmation = !data.session || Boolean(alreadyRegistered)

      return { needsEmailConfirmation, email }
    },
    [],
  )

  const resendConfirmation = useCallback(async (email: string) => {
    setAuthError(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })
    if (error) {
      setAuthError(error.message)
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    if (DEV_AUTO_LOGIN) {
      try {
        sessionStorage.setItem(DEV_SKIP_KEY, '1')
      } catch {
        /* ignore */
      }
    }
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const updateProfile = useCallback(
    async (patch: {
      display_name?: string
      weekly_goal?: number
      daily_step_goal?: number
      distance_unit?: DistanceUnit
      weight_unit?: WeightUnit
      week_start?: WeekStart
    }) => {
      if (!user) throw new Error('Not signed in')

      // Columns from newer migrations are dropped and retried, so the app keeps
      // working on a database where 015 / 016 have not been applied yet.
      let body: Record<string, unknown> = { ...patch }
      let { data, error } = await supabase
        .from('profiles')
        .update(body)
        .eq('id', user.id)
        .select()
        .single()

      while (error) {
        const missing = OPTIONAL_PROFILE_COLUMNS.find(
          (col) => col in body && new RegExp(col, 'i').test(error!.message),
        )
        if (!missing) break
        delete body[missing]
        if (Object.keys(body).length === 0) {
          throw new Error(`Run migration ${COLUMN_MIGRATION[missing] ?? ''} in Supabase to save this`.trim())
        }
        const retry = await supabase
          .from('profiles')
          .update(body)
          .eq('id', user.id)
          .select()
          .single()
        data = retry.data
        error = retry.error
      }

      if (error) throw error
      setProfile(data as Profile)
      return data as Profile
    },
    [user],
  )

  const displayName =
    profile?.display_name ||
    user?.user_metadata?.display_name ||
    user?.email?.split('@')[0] ||
    'Athlete'

  const weeklyGoal = profile?.weekly_goal ?? DEFAULT_WEEKLY_GOAL
  const dailyStepGoal = profile?.daily_step_goal ?? DEFAULT_DAILY_STEP_GOAL
  const distanceUnit: DistanceUnit = profile?.distance_unit ?? DEFAULT_DISTANCE_UNIT
  const weightUnit: WeightUnit = profile?.weight_unit ?? DEFAULT_WEIGHT_UNIT
  const weekStart: WeekStart = profile?.week_start ?? DEFAULT_WEEK_START
  const isAdmin = user?.email === 'rkharmthant@gmail.com'

  return {
    session,
    user,
    profile,
    displayName,
    weeklyGoal,
    dailyStepGoal,
    distanceUnit,
    weightUnit,
    weekStart,
    isAdmin,
    loading,
    authError,
    setAuthError,
    signIn,
    signUp,
    resendConfirmation,
    signOut,
    updateProfile,
  }
}
