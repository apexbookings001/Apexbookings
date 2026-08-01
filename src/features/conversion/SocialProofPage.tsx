import { useEffect, useState } from 'react'
import { socialProofStore } from './socialProofStore'
import { SOCIAL_PROOF_DEFAULTS } from './socialProofConfig'

/** The public rotation is intentionally not a tuning panel. */
export function SocialProofPage({ show }: { show: (message: string) => void }) {
  const [enabled, setEnabled] = useState(() => socialProofStore.settings().enabled)

  useEffect(() => socialProofStore.subscribe(() => setEnabled(socialProofStore.settings().enabled)), [])

  const toggle = () => {
    const nextEnabled = !enabled
    setEnabled(nextEnabled)
    socialProofStore.updateSettings({ enabled: nextEnabled })
    show(nextEnabled ? 'Social Proof enabled' : 'Social Proof disabled')
  }

  return (
    <div className="max-w-2xl space-y-6 text-white">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Conversion management</p>
        <h1 className="mt-1 font-serif text-2xl font-bold">Social Proof</h1>
        <p className="mt-1 text-sm text-zinc-500">Show truthful booking activity and approved promotional notices on published event pages.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg font-bold">Social Proof</h2>
            <p className="mt-1 text-xs text-zinc-500">Use the standard display and rotation behaviour across every event.</p>
          </div>
          <button type="button" role="switch" aria-checked={enabled} onClick={toggle} className={`h-8 w-14 rounded-full p-1 transition-colors ${enabled ? 'bg-emerald-400' : 'bg-zinc-700'}`}>
            <span className={`block h-6 w-6 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
        <p className="mt-5 rounded-xl border border-white/10 bg-black/15 p-3 text-xs leading-5 text-zinc-400">
          One card rotates at a time after a short delay, remains readable for {SOCIAL_PROOF_DEFAULTS.displayDurationMs / 1_000} seconds, and pauses while a visitor has public chat open. Verified bookings and approved promotions are production data; sample records are isolated to clearly labelled preview environments.
        </p>
      </section>
    </div>
  )
}
