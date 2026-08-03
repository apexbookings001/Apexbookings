import { useEffect, useState } from 'react'
import { COUNTDOWN_PRESETS, DEFAULT_EVENT_COUNTDOWN, countdownSummary, dateAtEventTimezone, isCountdownDuration, type EventCountdownSettings } from './countdown'

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400'
const splitIso = (iso: string | null) => {
  const date = iso ? new Date(iso) : new Date(Date.now() + 86400000)
  return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(11, 16) }
}

export function TicketSalesCountdownSettings({ value, eventStartsAt, onSave, onReset, onClose }: {
  value?: EventCountdownSettings
  eventStartsAt: string
  onSave: (settings: EventCountdownSettings) => Promise<void>
  onReset: (settings: EventCountdownSettings) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState<EventCountdownSettings>(() => ({ ...DEFAULT_EVENT_COUNTDOWN, ...value }))
  const [deadline, setDeadline] = useState(() => splitIso(value?.endsAt ?? null))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setDraft({ ...DEFAULT_EVENT_COUNTDOWN, ...value }); setDeadline(splitIso(value?.endsAt ?? null)) }, [value])
  const update = (next: Partial<EventCountdownSettings>) => setDraft(current => ({ ...current, ...next }))
  const makeDeadline = () => {
    const [year, month, day] = deadline.date.split('-').map(Number)
    const [hours, minutes] = deadline.time.split(':').map(Number)
    return new Date(dateAtEventTimezone(year, month, day, hours, minutes, draft.timezone)).toISOString()
  }
  const normalized = () => {
    const next = { ...draft }
    if (next.mode === 'fixed_deadline') next.endsAt = makeDeadline()
    if (next.mode === 'rolling_window' && (!next.startedAt || !next.endsAt) && isCountdownDuration(next.durationSeconds)) {
      const start = Date.now()
      next.startedAt = new Date(start).toISOString()
      next.endsAt = new Date(Math.min(start + next.durationSeconds * 1000, Date.parse(eventStartsAt))).toISOString()
      next.lastResetAt = next.startedAt
      next.nextResetAt = new Date(start + (next.durationSeconds <= 172800 ? 86400000 : next.durationSeconds * 500)).toISOString()
    }
    return next
  }
  const validate = (next: EventCountdownSettings) => {
    try { new Intl.DateTimeFormat('en-US', { timeZone: next.timezone }) } catch { return 'Enter a valid IANA event timezone, for example Africa/Lagos.' }
    const eventStart = Date.parse(eventStartsAt)
    if (!next.enabled) return null
    if (next.mode === 'fixed_deadline') {
      const deadlineAt = Date.parse(next.endsAt ?? '')
      if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now()) return 'Choose a fixed deadline in the future.'
      if (!Number.isFinite(eventStart) || deadlineAt > eventStart) return 'The fixed deadline cannot be later than the event start.'
    } else if (!isCountdownDuration(next.durationSeconds)) return 'Choose one of the supported rolling-window presets.'
    return null
  }
  const save = async (reset = false) => {
    const next = normalized(); const problem = validate(next); setError(problem)
    if (problem) return
    if (reset && next.mode === 'fixed_deadline' && next.endsAt === value?.endsAt) { setError('Choose a new fixed deadline before resetting this timer.'); return }
    if (reset && !window.confirm('Resetting the timer will change the countdown for all visitors. Continue?')) return
    setSaving(true)
    try { if (reset) await onReset(next); else await onSave(next); onClose() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save countdown settings.') } finally { setSaving(false) }
  }
  const renewalText = draft.durationSeconds && draft.durationSeconds <= 172800
    ? `Resets daily at ${draft.renewalTime} in ${draft.timezone}.`
    : 'Starts a new full period when 50% of the current period remains.'
  return <div className="fixed inset-0 z-[10000] grid place-items-center overflow-y-auto bg-black/80 p-4"><section className="w-full max-w-xl rounded-3xl border border-white/10 bg-[#111113] p-6 text-white"><p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Event setting</p><h2 className="mt-2 font-serif text-2xl font-bold">Ticket Sales Countdown</h2><p className="mt-1 text-sm text-zinc-400">Saved settings are used by the published booking page. The timer never resets just by publishing.</p>
    <label className="mt-5 flex items-center justify-between rounded-xl bg-white/[.04] p-3 text-sm font-semibold">Enabled<input type="checkbox" checked={draft.enabled} onChange={event => update({ enabled: event.target.checked })}/></label>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Countdown mode<select className={inputClass} value={draft.mode} onChange={event => update({ mode: event.target.value as EventCountdownSettings['mode'] })}><option value="fixed_deadline">Fixed Sales Deadline</option><option value="rolling_window">Rolling Booking Window</option></select></label><label className="text-xs text-zinc-400">Event timezone<input list="countdown-timezones" className={inputClass} value={draft.timezone} onChange={event => update({ timezone: event.target.value })}/><datalist id="countdown-timezones"><option value="UTC"/><option value="Africa/Lagos"/><option value="America/New_York"/><option value="America/Los_Angeles"/><option value="Europe/London"/></datalist></label></div>
    {draft.mode === 'fixed_deadline' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Fixed deadline date<input type="date" className={inputClass} value={deadline.date} onChange={event => setDeadline(current => ({ ...current, date: event.target.value }))}/></label><label className="text-xs text-zinc-400">Fixed deadline time<input type="time" className={inputClass} value={deadline.time} onChange={event => setDeadline(current => ({ ...current, time: event.target.value }))}/></label></div> : <><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Duration preset<select className={inputClass} value={draft.durationSeconds ?? ''} onChange={event => update({ durationSeconds: Number(event.target.value) })}>{COUNTDOWN_PRESETS.map(([seconds, label]) => <option key={seconds} value={seconds}>{label}</option>)}</select></label>{draft.durationSeconds && draft.durationSeconds <= 172800 && <label className="text-xs text-zinc-400">Rolling renewal time<input type="time" className={inputClass} value={draft.renewalTime} onChange={event => update({ renewalTime: event.target.value })}/></label>}</div><p className="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs text-emerald-100">{renewalText}</p></>}
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[.025] p-3 text-sm text-zinc-300"><span className="font-semibold text-white">Before saving: </span>{countdownSummary(draft)}</div>{error && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-2"><button disabled={saving} onClick={onClose} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Cancel</button>{draft.enabled && <button disabled={saving} onClick={() => void save(true)} className="rounded-xl bg-amber-400/15 px-4 py-2.5 text-sm font-bold text-amber-200">Reset Timer</button>}<button disabled={saving} onClick={() => void save(false)} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950">{saving ? 'Saving…' : 'Save countdown settings'}</button></div>
  </section></div>
}
