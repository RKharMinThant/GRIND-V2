/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DEV_AUTO_LOGIN_EMAIL?: string
  readonly VITE_DEV_AUTO_LOGIN_PASSWORD?: string
  /** 'google' = real Google Health data via Edge Functions; anything else = demo data */
  readonly VITE_HEALTH_PROVIDER?: string
  /** Web Push application server key. Public by design; unset hides the notifications UI. */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

declare const __APP_VERSION__: string

interface ImportMeta {
  readonly env: ImportMetaEnv
}
