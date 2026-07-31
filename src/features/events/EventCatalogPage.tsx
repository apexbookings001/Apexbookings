import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { createBookingPageData, masterBookingTemplateStore } from './bookingTemplate'
import {
  adminEventStore,
  createEventPublication,
  duplicateManagedEvent,
  type EventLocaleSettings,
  type ManagedEvent,
} from './adminEventStore'
import { localeService } from '../../i18n/localeService'
import { useAdminRecoveryState, useAdminSessionRecovery } from '../recovery/AdminSessionRecoveryProvider'

type SetupForm = { name: string; date: string; time: string; venue: string; countryCode: string; currencyCode: string; languageCode: string }
const inputClass = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400'
const emptyForm = (): SetupForm => ({ name: '', date: '', time: '19:00', venue: '', countryCode: 'US', currencyCode: 'USD', languageCode: 'en-US' })
const isSetupForm = (value: unknown): value is SetupForm => Boolean(value && typeof value === 'object' && typeof (value as SetupForm).name === 'string' && typeof (value as SetupForm).countryCode === 'string')

function formFromEvent(event?: ManagedEvent | null): SetupForm {
  const locale = localeService.get(event?.locale?.countryCode)
  const parsed = event?.date ? new Date(event.date) : null
  return {
    name: event ? `${event.title} Copy` : '',
    date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : '',
    time: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toTimeString().slice(0, 5) : '19:00',
    venue: event?.venue ?? '',
    countryCode: event?.locale?.countryCode ?? locale.code,
    currencyCode: event?.locale?.currencyCode ?? locale.currency,
    languageCode: event?.locale?.languageCode ?? locale.bcp47,
  }
}

function publicPath(event: ManagedEvent) { return `/events/${event.publication?.slug}` }

export function EventCatalogPage({ show, createSignal = 0 }: { show: (message: string) => void; createSignal?: number }) {
  const { role } = useAuth()
  const { clearUiState } = useAdminSessionRecovery()
  const navigate = useNavigate()
  const canManage = role === 'owner' || role === 'admin'
  const [events, setEvents] = useState<ManagedEvent[]>(adminEventStore.list)
  const [setupMode, setSetupMode] = useAdminRecoveryState<'create' | 'duplicate' | null>('events.setupMode', null, value => value === null || value === 'create' || value === 'duplicate')
  const [duplicateSourceId, setDuplicateSourceId] = useAdminRecoveryState<string | null>('events.duplicateSourceId', null, value => value === null || typeof value === 'string')
  const [form, setForm] = useAdminRecoveryState<SetupForm>('events.setupForm', emptyForm(), isSetupForm)
  const [deleteTargetId, setDeleteTargetId] = useAdminRecoveryState<string | null>('events.deleteTargetId', null, value => value === null || typeof value === 'string')
  const [busy, setBusy] = useState(false)
  const [readyName, setReadyName] = useState<string | null>(null)
  const duplicateSource = events.find(event => event.id === duplicateSourceId) ?? null
  const deleteTarget = events.find(event => event.id === deleteTargetId) ?? null

  useEffect(() => {
    if (!setupMode && !deleteTarget && !readyName) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [deleteTarget, readyName, setupMode])

  useEffect(() => adminEventStore.subscribe(() => setEvents(adminEventStore.list())), [])
  useEffect(() => { void adminEventStore.hydrate().catch(error => show(error instanceof Error ? error.message : 'Events could not be loaded')) }, [show])
  useEffect(() => { if (createSignal) { setForm(emptyForm()); setSetupMode('create') } }, [createSignal])

  const grouped = useMemo(() => ({
    drafts: events.filter(event => event.status === 'draft'),
    published: events.filter(event => event.status === 'published'),
    archived: events.filter(event => event.status === 'archived'),
    other: events.filter(event => !['draft', 'published', 'archived'].includes(event.status)),
  }), [events])

  const updateCountry = (countryCode: string) => {
    const locale = localeService.get(countryCode)
    setForm(current => ({ ...current, countryCode: locale.code, currencyCode: locale.currency, languageCode: locale.bcp47 }))
  }

  const openDuplicate = (event: ManagedEvent | null) => {
    setDuplicateSourceId(event?.id ?? null)
    if (event) setForm(formFromEvent(event))
    else {
      const template = masterBookingTemplateStore.load()
      setForm({ ...emptyForm(), name: 'Booking Template Copy', venue: template.venue.name })
    }
    setSetupMode('duplicate')
  }

  const submitSetup = async () => {
    if (!canManage) return show('Only owners and admins can manage event pages')
    if (!form.name.trim() || !form.date || !form.time || !form.venue.trim()) return show('Complete the event name, date, time, and venue')
    setBusy(true)
    try {
      const locale: EventLocaleSettings = { countryCode: form.countryCode, currencyCode: form.currencyCode, languageCode: form.languageCode }
      const startsAt = new Date(`${form.date}T${form.time}:00`).toISOString()
      let event: ManagedEvent
      if (setupMode === 'duplicate' && duplicateSource) {
        event = duplicateManagedEvent(duplicateSource, { title: form.name.trim(), date: startsAt, venue: form.venue.trim(), locale })
      } else {
        const page = createBookingPageData({ name: form.name.trim(), venue: form.venue.trim(), date: form.date, start: form.time }, masterBookingTemplateStore.load())
        event = {
          id: crypto.randomUUID(), title: form.name.trim(), venue: form.venue.trim(), date: startsAt,
          banner: page.hero.images[0], sold: 0, capacity: page.packages.reduce((sum, item) => sum + item.seats, 0), revenue: 0,
          status: 'draft', schedule: [], bookingPage: page, locale, publication: createEventPublication(form.name),
        }
      }
      const saved = await adminEventStore.saveAsync(event)
      setSetupMode(null)
      setDuplicateSourceId(null)
      setReadyName(saved.title)
      window.setTimeout(() => navigate(`/admin/events/${saved.id}/edit`), 850)
    } catch (error) {
      show(error instanceof Error ? error.message : 'The event page could not be created')
    } finally {
      setBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget || !canManage) return
    setBusy(true)
    try {
      await adminEventStore.removeAsync(deleteTarget.id)
      clearUiState(`eventStudio:${deleteTarget.id}`)
      setDeleteTargetId(null)
      show(`“${deleteTarget.title}” was deleted successfully`)
    } catch (error) {
      show(error instanceof Error ? error.message : 'The event page could not be deleted')
    } finally {
      setBusy(false)
    }
  }

  const EventCards = ({ title, list }: { title: string; list: ManagedEvent[] }) => (
    <section>
      <h2 className="mb-3 font-mono text-xs uppercase tracking-widest text-zinc-500">{title} · {list.length}</h2>
      {list.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map(event => {
        const link = `${window.location.origin}${publicPath(event)}`
        const previewHref = event.status === 'published' ? publicPath(event) : `/admin/events/${event.id}/preview`
        return <article key={event.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111113]">
          {(event.bookingPage?.hero.images[0] || event.banner) && <img src={event.bookingPage?.hero.images[0] ?? event.banner} alt="" className="aspect-[16/7] w-full object-cover" />}
          <div className="p-4">
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-emerald-300">{event.status}</span>
            <h3 className="mt-3 font-serif text-lg font-bold text-white">{event.title}</h3>
            <p className="mt-1 text-xs text-zinc-500">{event.venue} · {new Date(event.date).toLocaleString()}</p>
            <p className="mt-3 truncate rounded-lg bg-black/25 px-2.5 py-2 font-mono text-[10px] text-cyan-300">{publicPath(event)}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <button onClick={() => void navigator.clipboard.writeText(link).then(() => show('Public link copied'))} className="rounded-lg bg-white/5 px-2.5 py-2 text-cyan-300">Copy Link</button>
              <button type="button" onClick={() => navigate(previewHref)} className="rounded-lg bg-white/5 px-2.5 py-2 text-zinc-200">Preview</button>
              <button type="button" onClick={() => navigate(`/admin/events/${event.id}/edit`)} className="rounded-lg bg-emerald-400 px-2.5 py-2 font-semibold text-zinc-950">Edit</button>
              {canManage && <button onClick={() => openDuplicate(event)} className="rounded-lg bg-white/5 px-2.5 py-2 text-zinc-200">Duplicate</button>}
              {canManage && <button onClick={() => setDeleteTargetId(event.id)} className="rounded-lg bg-red-500/10 px-2.5 py-2 text-red-300">Delete</button>}
            </div>
          </div>
        </article>
      })}</div> : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">No {title.toLowerCase()} yet.</div>}
    </section>
  )

  return <div className="space-y-8">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Event pages</p><h1 className="mt-1 font-serif text-2xl font-bold text-white">Events</h1></div>{canManage && <button onClick={() => { setForm(emptyForm()); setSetupMode('create') }} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">Create Event</button>}</div>
    <section className="rounded-2xl border border-emerald-400/30 bg-[#111113] p-5"><p className="font-mono text-xs uppercase text-emerald-400">Default template</p><h2 className="mt-2 font-serif text-xl font-bold text-white">Booking Template</h2><p className="mt-2 text-sm text-zinc-400">New pages start with the complete template and receive an independent permanent link.</p><div className="mt-4 flex gap-2"><a href="/demo" className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200">Preview</a><a href="/admin/events/template/edit" className="rounded-xl bg-white/5 px-3 py-2 text-xs text-emerald-300">Edit Template</a>{canManage && <button onClick={() => openDuplicate(null)} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200">Duplicate</button>}</div></section>
    <EventCards title="Draft Events" list={grouped.drafts}/><EventCards title="Published Events" list={grouped.published}/><EventCards title="Scheduled and Completed Events" list={grouped.other}/><EventCards title="Archived Events" list={grouped.archived}/>

    {setupMode && <div className="fixed inset-0 z-[500] grid place-items-center overflow-y-auto bg-black/75 p-4"><section className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111113] p-6 text-white"><h2 className="font-serif text-2xl font-bold">{setupMode === 'duplicate' ? 'Duplicate event page' : 'Create event page'}</h2><p className="mt-1 text-sm text-zinc-500">Confirm the new page details before creating its independent draft.</p><div className="mt-6 grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2 text-xs text-zinc-400">Page / event name<input className={inputClass} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))}/></label>
      <label className="text-xs text-zinc-400">Event date<input type="date" className={inputClass} value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))}/></label>
      <label className="text-xs text-zinc-400">Event time<input type="time" className={inputClass} value={form.time} onChange={event => setForm(current => ({ ...current, time: event.target.value }))}/></label>
      <label className="sm:col-span-2 text-xs text-zinc-400">Venue<input className={inputClass} value={form.venue} onChange={event => setForm(current => ({ ...current, venue: event.target.value }))}/></label>
      <label className="text-xs text-zinc-400">Country<select className={inputClass} value={form.countryCode} onChange={event => updateCountry(event.target.value)}>{localeService.supported.map(item => <option key={item.code} value={item.code}>{item.country}</option>)}</select></label>
      <label className="text-xs text-zinc-400">Default currency<select className={inputClass} value={form.currencyCode} onChange={event => setForm(current => ({ ...current, currencyCode: event.target.value }))}>{[...new Set(localeService.supported.map(item => item.currency))].map(currency => <option key={currency}>{currency}</option>)}</select></label>
      <label className="sm:col-span-2 text-xs text-zinc-400">Default language<select className={inputClass} value={form.languageCode} onChange={event => setForm(current => ({ ...current, languageCode: event.target.value }))}>{localeService.supported.map(item => <option key={item.bcp47} value={item.bcp47}>{item.languageName} ({item.bcp47})</option>)}</select></label>
    </div><div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={() => setSetupMode(null)} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Cancel</button><button disabled={busy} onClick={() => void submitSetup()} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950 disabled:opacity-50">{busy ? 'Creating page…' : 'Create independent draft'}</button></div></section></div>}

    {deleteTarget && <div className="fixed inset-0 z-[500] grid place-items-center bg-black/75 p-4"><section className="w-full max-w-md rounded-3xl border border-red-400/25 bg-[#111113] p-6 text-white"><p className="font-mono text-xs uppercase tracking-widest text-red-300">Delete event page</p><h2 className="mt-2 font-serif text-2xl font-bold">Delete “{deleteTarget.title}”?</h2><p className="mt-3 text-sm leading-relaxed text-zinc-400">This removes the page from Events and immediately disables its public link. Related records remain safely soft-deleted.</p><div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={() => setDeleteTargetId(null)} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm">Cancel</button><button disabled={busy} onClick={() => void confirmDelete()} className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Deleting…' : 'Delete event page'}</button></div></section></div>}
    {readyName && <div className="fixed inset-0 z-[600] grid place-items-center bg-black/75 p-4"><div className="rounded-3xl border border-emerald-400/30 bg-[#111113] p-8 text-center text-white"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-400 text-xl text-zinc-950">✓</div><h2 className="mt-4 font-serif text-2xl font-bold">Your page is ready.</h2><p className="mt-2 text-sm text-zinc-400">You can now start editing “{readyName}”.</p></div></div>}
  </div>
}
