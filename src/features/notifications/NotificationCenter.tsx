import { useMemo, useState } from 'react'
import { adminEventStore } from '../events/adminEventStore'
import { paymentReviewStore } from '../payments/paymentReviewStore'
import { supportStore } from '../support/supportStore'

type Notification = { id: string; type: string; title: string; detail: string; createdAt: string }
export function NotificationCenter() {
  const [read, setRead] = useState<string[]>([])
  const notifications = useMemo<Notification[]>(() => [
    ...adminEventStore.list().filter(event => event.status === 'published').map(event => ({ id: `event-${event.id}`, type: 'Event published', title: `${event.title} is live`, detail: `Public link: /events/${event.publication?.slug}`, createdAt: event.publication?.publishedAt ?? new Date().toISOString() })),
    ...paymentReviewStore.list().map(payment => ({ id: `payment-${payment.id}`, type: 'Payment', title: `${payment.customer} payment ${payment.status.replace(/_/g, ' ')}`, detail: `${payment.eventName} · $${payment.amount.toLocaleString()}`, createdAt: payment.createdAt })),
    ...supportStore.list().flatMap(conversation => conversation.messages.filter(message => message.from === 'customer').map(message => ({ id: `chat-${message.id}`, type: 'New message', title: conversation.customer, detail: message.body, createdAt: message.createdAt }))),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [])
  return <div className="mx-auto max-w-4xl space-y-5"><div className="flex items-end justify-between"><div><p className="text-xs font-mono uppercase tracking-widest text-emerald-400">Activity feed</p><h1 className="font-serif text-2xl font-bold text-white">Notifications</h1></div><button onClick={() => setRead(notifications.map(notification => notification.id))} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-zinc-200">Mark all read</button></div><div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">{notifications.map(notification => <button key={notification.id} onClick={() => setRead(current => [...current, notification.id])} className={`flex w-full gap-3 border-b border-white/10 p-4 text-left last:border-0 ${read.includes(notification.id) ? 'opacity-60' : ''}`}><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" /><span className="min-w-0 flex-1"><span className="flex justify-between gap-3"><strong className="text-sm text-white">{notification.title}</strong><small className="shrink-0 text-[10px] text-zinc-500">{new Date(notification.createdAt).toLocaleString()}</small></span><span className="mt-1 block text-xs text-zinc-400">{notification.type} · {notification.detail}</span></span></button>)}{!notifications.length && <div className="p-12 text-center text-sm text-zinc-500">New bookings, payments, messages, and published events will appear here.</div>}</div></div>
}
