// Registers (or re-registers) the Google Health webhook subscriber for `exercise`.
//
//   npm run health:webhook              # create or update
//   npm run health:webhook -- --list    # show what is registered
//   npm run health:webhook -- --delete  # remove it
//
// Deploy health-webhook FIRST: Google verifies the endpoint during registration by
// POSTing to it twice — once with the Authorization secret (expects 2xx) and once
// without (expects 401/403). A subscriber cannot be created against a dead URL.
//
// Auth: needs an access token with the cloud-platform scope and health.subscribers.*
// on the project. The easiest source is your own gcloud login:
//
//   gcloud auth login
//   gcloud config set project <project-id>
//   gcloud auth print-access-token
//
// Pass it as GOOGLE_ACCESS_TOKEN, or let this script shell out to gcloud for you.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SUBSCRIBER_ID = 'grind-exercise'
const API = 'https://health.googleapis.com/v4'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.trim().replace(/^['"]|['"]$/g, '')]),
)

const projectNumber = env.GOOGLE_PROJECT_NUMBER
const supabaseUrl = env.VITE_SUPABASE_URL
const secret = env.HEALTH_WEBHOOK_SECRET

if (!projectNumber) {
  console.error(
    'GOOGLE_PROJECT_NUMBER is empty in .env.local.\n' +
      'Find it in Google Cloud Console → the project picker, or: gcloud projects describe <id> --format="value(projectNumber)"',
  )
  process.exit(1)
}
if (!supabaseUrl || !secret) {
  console.error('VITE_SUPABASE_URL and HEALTH_WEBHOOK_SECRET must be set in .env.local')
  process.exit(1)
}

function accessToken() {
  if (env.GOOGLE_ACCESS_TOKEN) return env.GOOGLE_ACCESS_TOKEN
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim()
  } catch {
    console.error(
      'Could not get an access token.\n' +
        'Either run `gcloud auth login` (and make sure gcloud is on your PATH),\n' +
        'or set GOOGLE_ACCESS_TOKEN in the environment.',
    )
    process.exit(1)
  }
}

const token = accessToken()
const endpointUri = `${supabaseUrl}/functions/v1/health-webhook`
const base = `${API}/projects/${projectNumber}/subscribers`

async function call(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text.slice(0, 500) }
  }
  return { ok: res.ok, status: res.status, body }
}

const mode = process.argv.includes('--delete') ? 'delete' : process.argv.includes('--list') ? 'list' : 'create'

if (mode === 'list') {
  const { status, body } = await call(base)
  console.log(status, JSON.stringify(body, null, 2))
  process.exit(status === 200 ? 0 : 1)
}

if (mode === 'delete') {
  const { status, body } = await call(`${base}/${SUBSCRIBER_ID}`, { method: 'DELETE' })
  console.log(status, JSON.stringify(body, null, 2))
  process.exit(status < 300 ? 0 : 1)
}

console.log(`Registering ${endpointUri} for the "exercise" data type…`)
console.log('(Google will call that URL twice now to verify it — it must already be deployed.)')

const payload = {
  endpointUri,
  subscriberConfigs: [{ dataTypes: ['exercise'], subscriptionCreatePolicy: 'AUTOMATIC' }],
  // Sent verbatim as the Authorization header on every notification
  endpointAuthorization: { secret: `Bearer ${secret}` },
}

let result = await call(`${base}?subscriberId=${SUBSCRIBER_ID}`, {
  method: 'POST',
  body: JSON.stringify(payload),
})

// Already registered: update it in place instead of failing
if (!result.ok && result.status === 409) {
  console.log('Subscriber exists — updating it instead.')
  result = await call(`${base}/${SUBSCRIBER_ID}?updateMask=endpointUri,subscriberConfigs,endpointAuthorization`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

console.log(result.status, JSON.stringify(result.body, null, 2))

if (!result.ok) {
  if (result.status === 400 && JSON.stringify(result.body).includes('FAILED_PRECONDITION')) {
    console.error(
      '\nVerification failed. Check that health-webhook is deployed and that the secret in\n' +
        'Supabase matches .env.local — run `npm run health:secrets` then `npm run health:deploy`.',
    )
  }
  if (result.status === 403) {
    console.error('\nThe token lacks health.subscribers.create on this project, or the project number is wrong.')
  }
  process.exit(1)
}

console.log('\nRegistered. Finish a workout and the notification should follow once Fitbit syncs.')
