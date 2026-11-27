// add_log_photo: upload-only photo access for agents. There is deliberately no tool that reads,
// lists, replaces or deletes photos (migration 023 only allows an agent INSERT).
// SECURITY: the URL path fetches from the internet on an agent's say-so, so it is SSRF-guarded:
// https only, no credentials, port 443, literal and DNS-resolved IPs checked, manual redirects
// re-checked, a 15 s overall timeout and a 5 MB cap. No auth headers are ever sent, and response
// bodies and headers never reach tool output. DNS rebinding is NOT fully prevented: fetch resolves
// the host again after our check. https-only, port 443 and certificate validation are the
// mitigation (a rebinding attacker can't present a valid certificate for an internal service).
import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { bad, defineTool, ok, take, ToolError, Uuid, must, type Ctx } from '../common.ts'
import { decodeBase64Image, isBlockedHost, MAX_PHOTO_BYTES, sniffImage } from '../domain.ts'

const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 15_000
const UPSTREAM = (m: string) => new ToolError('upstream_error', m)
const BLOCKED_MSG = "That image URL can't be used. Give a public https link to the image."

/** Throws unless `url` is a public https URL on port 443 with no credentials. Resolves DNS and checks every address. */
async function checkUrl(url: URL, signal: AbortSignal): Promise<void> {
  if (url.protocol !== 'https:') throw bad('The image URL must start with https://.')
  if (url.username || url.password) throw bad("The image URL can't contain a username or password.")
  if (url.port && url.port !== '443') throw bad('The image URL must use the default https port.')
  const host = url.hostname
  if (isBlockedHost(host)) throw bad(BLOCKED_MSG)

  const literal = host.startsWith('[') || /^[0-9.]+$/.test(host)
  if (literal) return // a clean public IP literal already passed isBlockedHost; nothing to resolve
  const ips: string[] = []
  let resolved = false
  for (const type of ['A', 'AAAA'] as const) {
    try {
      ips.push(...(await Deno.resolveDns(host, type, { signal })))
      resolved = true
    } catch {
      // a missing record type is normal; only both failing is an error
    }
  }
  if (!resolved || ips.length === 0) throw bad("Couldn't look up that image URL's host.")
  if (ips.some((ip) => isBlockedHost(ip))) throw bad(BLOCKED_MSG)
}

/** Fetches an image over https with SSRF protection and a hard size cap. Throws ToolError. */
async function safeFetchImage(rawUrl: string): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw bad("That isn't a valid image URL.")
  }
  try {
    for (let hops = 0; ; hops++) {
      await checkUrl(url, signal)
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal,
        headers: { Accept: 'image/jpeg,image/png,image/webp,*/*;q=0.1', 'User-Agent': 'GRIND-MCP/1.0' },
      })
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel()
        const loc = res.headers.get('location')
        if (!loc) throw UPSTREAM("The image URL redirected without saying where.")
        if (hops >= MAX_REDIRECTS) throw UPSTREAM('The image URL redirected too many times.')
        try {
          url = new URL(loc, url)
        } catch {
          throw UPSTREAM('The image URL redirected to an invalid address.')
        }
        continue
      }
      if (!res.ok) {
        await res.body?.cancel()
        throw UPSTREAM(`The image URL returned an error (HTTP ${res.status}).`)
      }
      const declared = Number(res.headers.get('content-length'))
      if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES) {
        await res.body?.cancel()
        throw bad('The image is larger than 5 MB.')
      }
      if (!res.body) throw UPSTREAM('The image URL returned no data.')
      const chunks: Uint8Array[] = []
      let total = 0
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > MAX_PHOTO_BYTES) {
          await reader.cancel()
          throw bad('The image is larger than 5 MB.')
        }
        chunks.push(value)
      }
      const out = new Uint8Array(total)
      let off = 0
      for (const ch of chunks) {
        out.set(ch, off)
        off += ch.byteLength
      }
      return out
    }
  } catch (e) {
    if (e instanceof ToolError) throw e
    if (signal.aborted) throw UPSTREAM('Fetching the image timed out.')
    throw UPSTREAM("Couldn't fetch the image from that URL.")
  }
}

export function registerPhotoTools(server: McpServer, ctx: Ctx) {
  defineTool(server, ctx, 'add_log_photo', {
    title: 'Add a photo to a log',
    description:
      "Attaches one photo to a log that has none. JPEG, PNG or WebP, up to 5 MB. Pass image_url (a public https link) when you have a link to the image, otherwise image_base64 (raw base64 or a data: URL; up to 3 MB, so use image_url for larger photos); give exactly one. This can't view, replace or remove photos. If the log already has a photo, the user changes it in the GRIND app.",
    input: {
      log_id: Uuid.describe('Log id'),
      image_url: z.url().max(2048).optional().describe('Public https URL of the image (preferred when you have a link)'),
      image_base64: z.string().max(4_300_000).optional().describe('Base64 image data (up to 3 MB decoded), raw or a data:image/...;base64, URL'),
    },
    hints: { ro: false, idempotent: false, open: true },
    run: async (a, c) => {
      if ((a.image_url === undefined) === (a.image_base64 === undefined)) {
        throw bad('Give exactly one of image_url or image_base64.')
      }
      if (!(await take(c, 'photo', 20, 3600))) {
        throw new ToolError('rate_limited', 'Photo uploads are limited to 20 per hour for agents. Try again later.')
      }

      const log = must(
        await c.db.from('logs').select('id, photo_path').eq('id', a.log_id).eq('user_id', c.userId).maybeSingle(),
      )
      if (!log) throw new ToolError('not_found', 'No log with that id.')
      if (log.photo_path) {
        throw new ToolError('conflict', 'This log already has a photo. The user can change it in the GRIND app.')
      }

      let bytes: Uint8Array
      if (a.image_base64 !== undefined) {
        try {
          bytes = decodeBase64Image(a.image_base64)
        } catch (e) {
          throw bad((e as Error).message)
        }
      } else {
        bytes = await safeFetchImage(a.image_url!)
      }

      // The claimed content-type is ignored; only the real bytes decide
      const sniffed = sniffImage(bytes)
      if (!sniffed) throw bad("That file isn't a JPEG, PNG or WebP image.")

      const path = `${c.userId}/${log.id}/agent.${sniffed.ext}`
      const up = await c.db.storage.from('log-photos').upload(path, bytes, {
        contentType: sniffed.mime,
        upsert: false,
        cacheControl: '31536000',
      })
      if (up.error) {
        const e = up.error as { statusCode?: string | number; status?: number; message?: string }
        const code = String(e.statusCode ?? e.status ?? '')
        console.error('photo upload error', code)
        // RLS denial (401/403): the log may have gained a photo meanwhile. Re-read to be sure.
        if (code === '403' || code === '401' || /row-level security|unauthorized|violates/i.test(e.message ?? '')) {
          const now = await c.db.from('logs').select('photo_path').eq('id', log.id).eq('user_id', c.userId).maybeSingle()
          if (!now.error && now.data?.photo_path) {
            throw new ToolError('conflict', 'This log already has a photo. The user can change it in the GRIND app.')
          }
          throw new ToolError('db_error', "Couldn't save the photo. Try again later.")
        }
        // The pinned filename already exists: an earlier upload to this log didn't finish linking
        if (code === '409' || /already exists|duplicate/i.test(e.message ?? '')) {
          throw new ToolError('conflict', "A photo upload for this log was already attempted. The user can add the photo in the GRIND app.")
        }
        throw new ToolError('db_error', "Couldn't save the photo. Try again.")
      }

      const upd = await c.db.from('logs').update({ photo_path: path }).eq('id', log.id).eq('user_id', c.userId)
        .is('photo_path', null).select('id')
      if (upd.error) {
        console.error('photo link error', upd.error.code ?? '')
        throw new ToolError('db_error', "Couldn't attach the photo. Try again.")
      }
      if (!upd.data || upd.data.length === 0) {
        // Another upload won the race. The file we just wrote stays as an orphan: agent tokens can't
        // delete storage objects. It's harmless: private, in the user's own folder, never referenced.
        throw new ToolError('conflict', 'This log already has a photo. The user can change it in the GRIND app.')
      }
      return ok({ added: true, log_id: log.id, size_bytes: bytes.byteLength, type: sniffed.mime })
    },
  })
}
