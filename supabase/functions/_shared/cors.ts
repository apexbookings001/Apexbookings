const productionOrigin = Deno.env.get('APP_ORIGIN') ?? 'https://apexbookings.netlify.app'

const allowedOrigins = new Set(
  [productionOrigin, ...(Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',')]
    .map(origin => origin.trim())
    .filter(Boolean),
)

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin')
  const allowedOrigin = origin && allowedOrigins.has(origin) ? origin : productionOrigin
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function corsJson(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
}

export function corsPreflight(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && !allowedOrigins.has(origin)) return new Response(null, { status: 403, headers: corsHeaders(request) })
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}
