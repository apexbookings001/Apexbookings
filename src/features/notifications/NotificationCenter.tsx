import { useEffect, useState } from 'react'
import { notificationStore } from './notificationStore'
import { useAuth } from '../auth/AuthContext'

export function NotificationCenter() {
  const { role } = useAuth()
  const [notifications, setNotifications] = useState(() => notificationStore.list())
  const [selected, setSelected] = useState<string[]>([])
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => notificationStore.subscribe(() => setNotifications(notificationStore.list())), [])
  const canDelete = role === 'owner' || role === 'admin'
  const remove = async () => {
    if (!confirmIds?.length || busy) return
    setBusy(true); setMessage('')
    try { await notificationStore.deleteMany(confirmIds); setSelected([]); setConfirmIds(null); setMessage('Notification deleted successfully.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The notification could not be deleted.') }
    finally { setBusy(false) }
  }
  const clearRead = async () => {
    setBusy(true); setMessage('')
    try { await notificationStore.clearRead(); setSelected([]); setMessage('Read notifications cleared.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Read notifications could not be cleared.') }
    finally { setBusy(false) }
  }
  return <div className="mx-auto max-w-4xl space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-mono uppercase tracking-widest text-emerald-400">Activity feed</p><h1 className="font-serif text-2xl font-bold text-white">Notifications</h1></div><div className="flex flex-wrap gap-2"><button onClick={() => notificationStore.markAllRead()} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200">Mark all read</button>{canDelete && <><button disabled={busy || !notifications.some(item => item.readAt)} onClick={clearRead} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200 disabled:opacity-40">Clear read</button><button disabled={!selected.length} onClick={() => setConfirmIds(selected)} className="rounded-xl border border-red-400/25 px-3 py-2 text-xs text-red-200 disabled:opacity-40">Delete selected</button></>}</div></div>
    {message && <div role="status" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-zinc-300">{message}</div>}
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">{notifications.map(notification => <div key={notification.id} className={`flex items-start gap-3 border-b border-white/10 p-4 last:border-0 ${notification.readAt ? 'opacity-60' : ''}`}>{canDelete && <input aria-label={`Select ${notification.title}`} type="checkbox" checked={selected.includes(notification.id)} onChange={event => setSelected(current => event.target.checked ? [...current, notification.id] : current.filter(id => id !== notification.id))} className="mt-1 accent-emerald-400"/>}<button onClick={() => notificationStore.markRead(notification.id)} className="flex min-w-0 flex-1 gap-3 text-left"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? 'bg-zinc-600' : 'bg-emerald-400'}`} /><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="text-sm text-white">{notification.title}</strong><small className="shrink-0 text-[10px] text-zinc-500">{new Date(notification.createdAt).toLocaleString()}</small></span><span className="mt-1 block text-xs text-zinc-400">{notification.type.replace(/_/g, ' ')}{notification.detail ? ` · ${notification.detail}` : ''}</span></span></button>{canDelete && <button onClick={() => setConfirmIds([notification.id])} className="rounded-lg border border-red-400/20 px-2 py-1 text-[10px] text-red-200">Delete</button>}</div>)}{!notifications.length && <div className="p-12 text-center text-sm text-zinc-500">New bookings, payments, messages, and published events will appear here.</div>}</div>
    {confirmIds && <div className="fixed inset-0 z-[150] grid place-items-center bg-black/75 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111113] p-6 text-white"><p className="text-[10px] font-mono uppercase tracking-widest text-red-300">Delete notification</p><h2 className="mt-2 font-serif text-xl font-bold">Remove {confirmIds.length === 1 ? 'this notification' : `${confirmIds.length} notifications`}?</h2><p className="mt-3 text-sm text-zinc-400">This removes the notification from the normal dashboard. Its linked booking, payment, or chat record will not be deleted.</p><div className="mt-6 flex justify-end gap-2"><button disabled={busy} onClick={() => setConfirmIds(null)} className="rounded-xl bg-white/5 px-4 py-2 text-xs">Cancel</button><button disabled={busy} onClick={remove} className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold">{busy ? 'Deleting…' : 'Delete'}</button></div></div></div>}
  </div>
}
