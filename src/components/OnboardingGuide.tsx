import { useEffect, useState } from 'react'

const adminGuide: Record<string, string[]> = {
  dashboard: ['Review only values sourced from booking, payment, and support records.', 'Open country and activity cards for supporting details.', 'Use the sidebar to take operational action.'],
  bookings: ['Search by customer, booking reference, or event.', 'Open a booking before changing any payment-related status.', 'Use the customer history to validate manual decisions.'],
  events: ['Create a draft from the template.', 'Edit the booking page, then publish only after checking preview.', 'Duplicate an event when a new show should retain the same structure.'],
  payments: ['Review a proof against the booking reference and amount.', 'Enter a decline reason before rejecting.', 'Send bank details only after entering real account information.'],
  settings: ['Save branding, payments, and media before publishing.', 'Turn social-proof popups on or off in Social Proof settings.', 'Configure delivery credentials outside the browser for customer email.'],
}

export function AdminOnboardingFooter({ page }: { page: string }) {
  const [open, setOpen] = useState(() => localStorage.getItem('apex.admin-onboarding') === 'open')
  useEffect(() => localStorage.setItem('apex.admin-onboarding', open ? 'open' : 'closed'), [open])
  const steps = adminGuide[page] ?? ['Use the page controls to review live records.', 'Open the Documentation page for complete step-by-step instructions.', 'Use the sidebar to move to the next workflow.']
  return <footer className="mt-8 border-t border-white/10 pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-white">Need a guided walkthrough?</p><p className="mt-1 text-xs text-zinc-500">Turn on onboarding for page-specific instructions.</p></div><button type="button" role="switch" aria-checked={open} onClick={() => setOpen(current => !current)} className={`relative h-8 w-14 overflow-hidden rounded-full transition-colors ${open ? 'bg-emerald-400' : 'bg-zinc-700'}`}><span className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${open ? 'translate-x-6' : 'translate-x-0'}`}/></button></div>{open && <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] p-4"><p className="text-xs font-mono uppercase tracking-widest text-emerald-300">Onboarding guide</p><ol className="mt-3 space-y-2 text-sm text-zinc-200">{steps.map((step, index) => <li key={step} className="flex gap-2"><span className="text-emerald-300">{index + 1}.</span>{step}</li>)}</ol></div>}</footer>
}

export function PublicOnboardingGuide({ context = 'booking page' }: { context?: string }) {
  const [open, setOpen] = useState(false)
  return <div className="fixed bottom-4 left-4 z-[125] max-w-[min(22rem,calc(100vw-2rem))]"><button type="button" onClick={() => setOpen(current => !current)} className="rounded-xl border border-white/20 bg-zinc-950/90 px-3 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur">{open ? 'Close guide' : 'How this page works'}</button>{open && <div className="mt-2 rounded-2xl border border-white/15 bg-zinc-950/95 p-4 text-sm text-zinc-200 shadow-2xl backdrop-blur"><p className="font-semibold text-white">{context} guide</p><ol className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-300"><li>1. Review the event, packages, and seat availability.</li><li>2. Select a package and continue through secure checkout.</li><li>3. Choose a configured payment method and submit proof when required.</li><li>4. Use the support button to open chat; an email is required to preserve the conversation.</li></ol></div>}</div>
}
