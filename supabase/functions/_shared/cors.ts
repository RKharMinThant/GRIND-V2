// CORS for browser calls from the app. Allowed origins come from the ALLOWED_ORIGINS secret,
// e.g. "https://grind-v2-tau.vercel.app,http://localhost:5173".

/** Origin of a configured entry; tolerates spaces, trailing slashes and a pasted path. */
function toOrigin(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

export function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(toOrigin)
    .filter((o): o is string => o !== null)
}

export function isAllowedOrigin(origin: string | null | undefined): origin is string {
  const candidate = origin ? toOrigin(origin) : null
  return Boolean(candidate && allowedOrigins().includes(candidate))
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  return {
    ...(isAllowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders(req) }) : null
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}
