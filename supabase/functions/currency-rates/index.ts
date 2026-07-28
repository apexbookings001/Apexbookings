import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const supported = ['USD', 'CAD', 'GBP', 'EUR', 'BRL', 'MXN', 'AUD', 'COP']

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500)
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: existing } = await admin.from('currency_rates').select('quote_currency,rate,fetched_at').eq('base_currency', 'USD').in('quote_currency', supported)
  const fresh = existing?.length === supported.length && existing.every(rate => Date.now() - new Date(rate.fetched_at).getTime() < 6 * 60 * 60 * 1000)
  if (fresh) return json({ rates: Object.fromEntries(existing.map(rate => [rate.quote_currency, Number(rate.rate)])) })
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD', { signal: AbortSignal.timeout(8000) })
    if (!response.ok) throw new Error('Rate provider request failed')
    const payload = await response.json() as { rates?: Record<string, number> }
    if (!payload.rates) throw new Error('Rate provider response was invalid')
    const fetchedAt = new Date().toISOString()
    const rows = supported.map(currency => ({ base_currency: 'USD', quote_currency: currency, rate: payload.rates?.[currency] ?? 1, provider: 'open.er-api.com', fetched_at: fetchedAt }))
    const { error } = await admin.from('currency_rates').upsert(rows, { onConflict: 'base_currency,quote_currency' })
    if (error) throw error
    return json({ rates: Object.fromEntries(rows.map(rate => [rate.quote_currency, rate.rate])) })
  } catch {
    if (existing?.length) return json({ rates: Object.fromEntries(existing.map(rate => [rate.quote_currency, Number(rate.rate)])), stale: true })
    return json({ error: 'Currency rates are temporarily unavailable' }, 503)
  }
})
