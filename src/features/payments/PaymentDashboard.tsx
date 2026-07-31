import { useEffect, useMemo, useState } from 'react'
import type { PaymentStatus } from '../../types/domain'
import { bankTransferStore, type BankTransferRequest, type BankTransferStatus } from './bankTransferStore'
import { paymentReviewStore, type PaymentReviewRecord } from './paymentReviewStore'
import { emailService } from '../email/emailService'
import { useAdminRecoveryState } from '../recovery/AdminSessionRecoveryProvider'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { softDeleteAdminRecord } from '../admin/adminDeletionService'

const methodName: Record<PaymentReviewRecord['method'], string> = { apple_gift_card: 'Apple Gift Card', paypal: 'PayPal', cryptocurrency: 'Cryptocurrency', cash_app: 'Cash App', bank_transfer: 'Bank Transfer' }
const bankStatusLabel: Record<BankTransferStatus, string> = {
  waiting_for_bank_details: 'Waiting for Bank Details',
  bank_details_ready: 'Bank Details Ready',
  transfer_window_active: 'Transfer Window Active',
  payment_proof_submitted: 'Payment Submitted',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
}
const statusTone = (status: BankTransferStatus) => status === 'approved' ? 'bg-emerald-400/15 text-emerald-300' : status === 'declined' || status === 'expired' || status === 'cancelled' ? 'bg-red-400/15 text-red-300' : status === 'bank_details_ready' || status === 'transfer_window_active' ? 'bg-sky-400/15 text-sky-300' : 'bg-amber-400/15 text-amber-200'

function ProductionBankTransferRequests({ show }: { show: (message: string) => void }) {
  const { role } = useAuth()
  const [records, setRecords] = useState<BankTransferRequest[]>(() => bankTransferStore.list())
  const [selected, setSelected] = useState<BankTransferRequest | null>(null)
  const [details, setDetails] = useState({ bankName: '', accountHolder: '', accountNumber: '', routingNumber: '' })
  useEffect(() => bankTransferStore.subscribe(() => setRecords(bankTransferStore.list())), [])
  const open = (record: BankTransferRequest) => { setSelected(record); setDetails({ bankName: record.details?.bankName ?? '', accountHolder: record.details?.accountHolder ?? '', accountNumber: record.details?.accountNumber ?? '', routingNumber: record.details?.routingNumber ?? '' }) }
  const prepare = () => {
    if (!selected || !details.bankName || !details.accountHolder || !details.accountNumber) return show('Enter bank name, account holder, and account number')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const updated = bankTransferStore.markReady(selected.id, { ...details, referenceNumber: selected.id, expiresAt })
    if (!updated) return
    emailService.dispatch({ kind: 'bank_details_ready', to: selected.customerEmail, subject: 'Your Apex bank transfer details are ready', data: { Bank: details.bankName, Account: details.accountNumber, Reference: selected.id, Expires: new Date(expiresAt).toLocaleString() }, deepLink: window.location.origin + '/events/' + selected.eventId })
    setSelected(null)
    show('Bank details sent and 30-minute transfer window started')
  }
  const cancel = (record: BankTransferRequest) => { bankTransferStore.update(record.id, { status: 'cancelled' }); show('Bank transfer request cancelled') }
  const remove = async (record: BankTransferRequest) => {
    if ((role !== 'owner' && role !== 'admin') || !window.confirm(`Delete bank-transfer request ${record.id}?\n\nThe linked booking and customer remain intact.`)) return
    try { await softDeleteAdminRecord('bank_transfer', record.id); await bankTransferStore.hydrate(); show('Bank transfer request deleted.') }
    catch (error) { show(error instanceof Error ? error.message : 'The request could not be deleted.') }
  }
  return <div className="space-y-5">
    <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[.04] p-4 text-sm text-zinc-400">Prepare account details for each request. The customer receives the unique reference and a 30-minute expiry notice immediately.</div>
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[920px] text-left text-xs"><thead className="bg-white/[.03] text-zinc-500"><tr><th className="p-4">Customer</th><th className="p-4">Event</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Requested</th><th className="p-4"></th></tr></thead><tbody>{records.map(record => <tr key={record.id} className="border-t border-white/10 text-zinc-200"><td className="p-4"><div>{record.customerName}</div><div className="mt-1 text-zinc-500">{record.customerEmail}</div></td><td className="p-4">{record.eventName}<div className="mt-1 text-zinc-500">{record.packageName} · {record.seatLabel}</div></td><td className="p-4">{new Intl.NumberFormat(undefined, { style: 'currency', currency: record.currency }).format(record.totalAmount)}</td><td className="p-4"><span className={'inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ' + statusTone(record.status)}>{bankStatusLabel[record.status]}</span></td><td className="p-4 text-zinc-400">{new Date(record.createdAt).toLocaleString()}</td><td className="p-4"><div className="flex gap-2"><button onClick={() => open(record)} className="rounded-lg border border-sky-400/25 px-2 py-1.5 text-[10px] text-sky-200">{record.details ? 'Update details' : 'Prepare details'}</button><button onClick={() => cancel(record)} className="rounded-lg border border-red-400/20 px-2 py-1.5 text-[10px] text-red-200">Cancel</button></div></td></tr>)}</tbody></table></div>
    {(role === 'owner' || role === 'admin') && records.length > 0 && <div className="rounded-2xl border border-red-400/15 bg-red-400/[.03] p-4"><div className="mb-3 text-[10px] font-mono uppercase tracking-widest text-red-300">Delete requests</div><div className="flex flex-wrap gap-2">{records.map(record => <button key={record.id} onClick={() => void remove(record)} className="rounded-lg border border-red-400/20 px-3 py-2 text-[10px] text-red-200">Delete {record.customerName} · {record.id.slice(0, 8)}</button>)}</div></div>}
    {!records.length && <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">No bank transfer requests yet.</div>}
    {selected && <div className="fixed inset-0 z-[120] grid place-items-center bg-zinc-950/80 p-4"><div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111113] p-6 text-white"><div className="flex justify-between"><div><p className="text-[10px] font-mono uppercase tracking-widest text-sky-300">Bank details</p><h2 className="font-serif text-xl font-bold">{selected.customerName}</h2></div><button onClick={() => setSelected(null)} className="text-zinc-400">×</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{([['Bank name', 'bankName'], ['Account holder', 'accountHolder'], ['Account number', 'accountNumber'], ['Routing number', 'routingNumber']] as const).map(([label, key]) => <label key={key} className="text-xs text-zinc-400">{label}<input value={details[key]} onChange={event => setDetails(current => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"/></label>)}</div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setSelected(null)} className="rounded-xl bg-white/5 px-4 py-2 text-xs">Cancel</button><button onClick={prepare} className="rounded-xl bg-sky-400 px-4 py-2 text-xs font-bold text-zinc-950">Send bank details</button></div></div></div>}
  </div>
}

function BankTransferRequests({ show = message => window.alert(message) }: { show?: (message: string) => void }) {
  return <ProductionBankTransferRequests show={show} />
  const [records] = useState<BankTransferRequest[]>(() => bankTransferStore.list())
  return <div className="space-y-5">
    <div className="rounded-2xl border border-sky-400/15 bg-sky-400/[.035] p-4 text-sm text-zinc-400">Requests are stored per booking and event. Preparing bank details, notifications, live updates, and expiry handling are intentionally reserved for the next integration phase.</div>
    <div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="bg-white/[.03] text-zinc-500"><tr><th className="p-4">Request ID</th><th className="p-4">Customer</th><th className="p-4">Event</th><th className="p-4">Country</th><th className="p-4">Currency</th><th className="p-4">Package / seat</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Created</th><th className="p-4">Actions</th></tr></thead><tbody>{records.map(record => <tr key={record.id} className="border-t border-white/10 text-zinc-200"><td className="p-4 font-mono text-[11px] text-sky-300">{record.id}</td><td className="p-4"><div>{record.customerName}</div><div className="mt-1 text-zinc-500">{record.customerEmail}</div></td><td className="p-4">{record.eventName}</td><td className="p-4">{record.country}</td><td className="p-4">{record.currency}</td><td className="p-4">{record.packageName}<div className="mt-1 text-zinc-500">{record.seatLabel}</div></td><td className="p-4">{new Intl.NumberFormat(undefined, { style: 'currency', currency: record.currency }).format(record.totalAmount)}</td><td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone(record.status)}`}>{bankStatusLabel[record.status]}</span></td><td className="p-4 text-zinc-400">{new Date(record.createdAt).toLocaleString()}</td><td className="p-4"><div className="flex gap-1.5"><button disabled className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-zinc-500 disabled:cursor-not-allowed">View</button><button disabled className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-zinc-500 disabled:cursor-not-allowed">Prepare Details</button><button disabled className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px] text-zinc-500 disabled:cursor-not-allowed">Mark Ready</button><button disabled className="rounded-lg border border-red-400/20 px-2 py-1.5 text-[10px] text-red-300/50 disabled:cursor-not-allowed">Cancel</button></div></td></tr>)}</tbody></table></div>
    {!records.length && <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">No Bank Transfer requests yet.</div>}
  </div>
}

export function PaymentDashboard({ show }: { show: (message: string) => void }) {
  const { role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [tab, setTab] = useAdminRecoveryState<'reviews' | 'transfers'>('payments.tab', 'reviews', value => value === 'reviews' || value === 'transfers')
  const [records, setRecords] = useState(() => paymentReviewStore.list())
  const [filter, setFilter] = useAdminRecoveryState<PaymentStatus | 'all'>('payments.filter', 'all', (value): value is PaymentStatus | 'all' => typeof value === 'string' && ['all','pending','approved','rejected','needs_more_information'].includes(value))
  const [selectedId, setSelectedId] = useAdminRecoveryState<string | null>('payments.selectedId', null, value => value === null || typeof value === 'string')
  const [selectedNotes, setSelectedNotes] = useAdminRecoveryState('payments.selectedNotes', '', value => typeof value === 'string')
  const selectedRecord = records.find(record => record.id === selectedId) ?? null
  const selected = selectedRecord ? { ...selectedRecord, notes: selectedNotes || selectedRecord.notes } : null
  const [updating, setUpdating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const refresh = () => setRecords(paymentReviewStore.list())
  useEffect(() => {
    const routeId = location.pathname.startsWith('/admin/payments/') ? decodeURIComponent(location.pathname.slice('/admin/payments/'.length)) : null
    if (routeId && routeId !== selectedId) setSelectedId(routeId)
  }, [location.pathname, selectedId, setSelectedId])
  const update = async (status: PaymentStatus) => {
    if (!selected || updating) return
    if (status === 'rejected' && !selected.notes.trim()) return show('Enter a decline reason in internal notes before rejecting payment')
    setUpdating(true)
    const next = { ...selected, status }
    try {
      const result = await paymentReviewStore.updateAsync(next)
      if (status === 'approved') {
        if (!result.qrToken || !result.ticketNumber) throw new Error('The approved ticket QR token could not be generated.')
        emailService.dispatch({
          kind: 'ticket_ready',
          to: selected.email,
          subject: 'Your approved Apex ticket is ready',
          data: { 'Full Name': selected.customer, Event: selected.eventName, Package: selected.packageName, Seat: selected.seatLabel, 'Original ticket price': String(selected.pricing?.originalUnitPrice ?? selected.amount), Discount: `${selected.pricing?.discountPercentage ?? 0}%`, 'Amount saved': String(selected.pricing?.discountAmount ?? 0), 'Final amount paid': selected.amount.toLocaleString(), Currency: String(selected.pricing?.currency ?? ''), 'Booking Reference': selected.reference, 'Ticket Number': result.ticketNumber },
          deepLink: `${window.location.origin}/ticket/${result.qrToken}`,
          actionLabel: 'View Verified Ticket',
        })
      }
      if (status === 'rejected') emailService.dispatch({ kind: 'payment_declined', to: selected.email, subject: 'Your Apex payment needs attention', data: { Reason: selected.notes.trim(), Reference: selected.reference }, deepLink: window.location.origin + '/events/' + selected.eventId })
      setSelectedId(null)
      setSelectedNotes('')
      navigate('/admin/payments')
      refresh()
      show(status === 'approved' ? 'Payment approved and verified ticket email queued' : 'Payment marked ' + status.replace(/_/g, ' '))
    } catch (error) {
      show(error instanceof Error ? error.message : 'The payment could not be updated')
    } finally {
      setUpdating(false)
    }
  }
  const deletePayment = async () => {
    if (!selected || updating || (role !== 'owner' && role !== 'admin')) return
    setUpdating(true)
    try {
      const strongConfirmation = selected.status === 'approved'
      await softDeleteAdminRecord('payment', selected.id, strongConfirmation)
      await paymentReviewStore.hydrate()
      refresh()
      setSelectedId(null); setSelectedNotes(''); setConfirmDelete(false); navigate('/admin/payments')
      show('Payment removed from the dashboard and linked records reconciled.')
    } catch (error) {
      show(error instanceof Error ? error.message : 'The payment could not be deleted.')
    } finally { setUpdating(false) }
  }
  const visible = useMemo(() => records.filter(record => filter === 'all' || record.status === filter), [records, filter])
  return <div className="space-y-5"><div><p className="text-xs font-mono uppercase tracking-widest text-emerald-400">Manual verification</p><h1 className="font-serif text-2xl font-bold text-white">Payments</h1><p className="mt-1 text-sm text-zinc-500">Review submitted payment proofs and Bank Transfer request states.</p></div><div className="flex gap-2 border-b border-white/10"><button onClick={() => setTab('reviews')} className={`border-b-2 px-3 py-2 text-sm ${tab === 'reviews' ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-zinc-500'}`}>Payment Reviews</button><button onClick={() => setTab('transfers')} className={`border-b-2 px-3 py-2 text-sm ${tab === 'transfers' ? 'border-sky-400 text-sky-300' : 'border-transparent text-zinc-500'}`}>Bank Transfer Requests</button></div>{tab === 'transfers' ? <BankTransferRequests /> : <><div className="flex flex-wrap gap-2">{(['all','pending','approved','rejected','needs_more_information'] as const).map(status => <button key={status} onClick={() => setFilter(status)} className={`rounded-xl px-3 py-2 text-xs ${filter === status ? 'bg-emerald-400 text-zinc-950' : 'bg-white/5 text-zinc-300'}`}>{status.replaceAll('_', ' ')}</button>)}</div><div className="overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-white/[.03] text-zinc-500"><tr><th className="p-4">Method</th><th className="p-4">Customer</th><th className="p-4">Event / seat</th><th className="p-4">Package</th><th className="p-4">Amount</th><th className="p-4">Status</th><th className="p-4">Date</th></tr></thead><tbody>{visible.map(record => <tr key={record.id} onClick={() => { setSelectedId(record.id); setSelectedNotes(record.notes); navigate(`/admin/payments/${record.id}`) }} className="cursor-pointer border-t border-white/10 text-zinc-200"><td className="p-4">{methodName[record.method]}</td><td className="p-4"><div>{record.customer}</div><div className="mt-1 text-zinc-500">{record.email}</div></td><td className="p-4">{record.eventName} · {record.seatLabel}</td><td className="p-4">{record.packageName}</td><td className="p-4">${record.amount.toLocaleString()}</td><td className="p-4 capitalize">{record.status.replaceAll('_', ' ')}</td><td className="p-4">{new Date(record.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>{!visible.length && <div className="rounded-2xl border border-white/10 p-12 text-center text-sm text-zinc-500">No payment records match this filter.</div>}{selected && <div className="fixed inset-0 z-[110] grid place-items-center bg-zinc-950/80 p-4 backdrop-blur"><div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111113] p-6 text-white"><div className="flex justify-between"><div><p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">Payment review</p><h2 className="font-serif text-xl font-bold">{selected.customer}</h2></div><button onClick={() => { setSelectedId(null); setSelectedNotes(''); navigate('/admin/payments') }} className="text-zinc-400">×</button></div><div className="mt-4 grid grid-cols-2 gap-3 text-xs text-zinc-400"><p>Reference: <span className="text-zinc-100">{selected.reference}</span></p><p>Method: <span className="text-zinc-100">{methodName[selected.method]}</span></p><p>Amount: <span className="text-zinc-100">${selected.amount.toLocaleString()}</span></p><p>Seat: <span className="text-zinc-100">{selected.seatLabel}</span></p><p>Package: <span className="text-zinc-100">{selected.packageName}</span></p><p>Status: <span className="text-zinc-100 capitalize">{selected.status.replaceAll('_', ' ')}</span></p></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{selected.proofUrls.map((proof, index) => <a key={proof} href={proof} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10"><img src={proof} alt={`Payment proof ${index + 1}`} className="aspect-square w-full object-cover"/></a>)}</div><textarea value={selected.notes} onChange={event => setSelectedNotes(event.target.value)} placeholder="Internal notes" className="mt-5 h-24 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white outline-none"/><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><button onClick={() => update('approved')} className="rounded-xl bg-emerald-400 px-3 py-2.5 text-xs font-bold text-zinc-950">Approve</button><button onClick={() => update('rejected')} className="rounded-xl bg-red-500/15 px-3 py-2.5 text-xs text-red-200">Reject</button><button onClick={() => update('needs_more_information')} className="rounded-xl bg-white/5 px-3 py-2.5 text-xs text-zinc-200">Request upload</button>{(role === 'owner' || role === 'admin') && <button onClick={() => setConfirmDelete(true)} className="rounded-xl border border-red-400/25 px-3 py-2.5 text-xs text-red-200">Delete</button>}</div></div></div>}{confirmDelete && selected && <div className="fixed inset-0 z-[140] grid place-items-center bg-zinc-950/90 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-3xl border border-red-400/20 bg-[#111113] p-6 text-white"><p className="font-mono text-[10px] uppercase tracking-widest text-red-300">Delete payment</p><h2 className="mt-2 font-serif text-xl font-bold">{selected.reference}</h2><div className="mt-4 space-y-1 text-sm text-zinc-400"><p>Customer: {selected.customer}</p><p>Amount: ${selected.amount.toLocaleString()}</p><p>Status: {selected.status.replaceAll('_', ' ')}</p></div><p className="mt-4 text-sm text-red-200">This removes the payment and proof records from normal dashboards and reconciles its bank-transfer, booking, and ticket state. Approved payments require owner confirmation.</p><div className="mt-6 flex justify-end gap-2"><button disabled={updating} onClick={() => setConfirmDelete(false)} className="rounded-xl bg-white/5 px-4 py-2 text-xs">Cancel</button><button disabled={updating || (selected.status === 'approved' && role !== 'owner')} onClick={deletePayment} className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold disabled:opacity-40">{updating ? 'Deleting…' : 'Confirm deletion'}</button></div></div></div>}</>}</div>
}
