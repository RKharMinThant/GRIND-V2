// Uploads the Edge Function secrets from .env.local to Supabase.
// Only the keys listed below are sent — nothing else in the file, and no value is printed.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const KEYS = [
  // Google Health (Fitbit)
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ALLOWED_ORIGINS',
  // Web Push notifications
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
  'PUSH_CRON_SECRET',
]
const PLACEHOLDERS = ['your-client-id.apps.googleusercontent.com', 'your-client-secret']

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.trim().replace(/^['"]|['"]$/g, '')]),
)

const missing = KEYS.filter((k) => !env[k] || PLACEHOLDERS.includes(env[k]))
if (missing.length) {
  console.error(`Fill these in .env.local first: ${missing.join(', ')}`)
  process.exit(1)
}

const dir = mkdtempSync(join(tmpdir(), 'grind-secrets-'))
const file = join(dir, 'health.env')
try {
  writeFileSync(file, KEYS.map((k) => `${k}=${env[k]}`).join('\n') + '\n', { mode: 0o600 })
  const res = spawnSync('npx', ['supabase', 'secrets', 'set', '--env-file', file], { stdio: 'inherit' })
  process.exitCode = res.status ?? 1
} finally {
  rmSync(dir, { recursive: true, force: true })
}
if (process.exitCode === 0) console.log(`Set ${KEYS.join(', ')} (values not printed).`)
