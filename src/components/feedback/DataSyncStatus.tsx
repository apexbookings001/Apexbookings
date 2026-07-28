import { useEffect, useState } from 'react'

export function DataSyncStatus({ onRetry }: { onRetry: () => void }) {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const handleError = (event: Event) => setMessage((event as CustomEvent<string>).detail || 'Dashboard data could not be synchronized.')
    window.addEventListener('apex:data-sync-error', handleError)
    return () => window.removeEventListener('apex:data-sync-error', handleError)
  }, [])

  if (!message) return null
  return (
    <div className="fixed inset-x-4 top-4 z-[300] mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-red-400/30 bg-red-950/95 p-3 text-xs text-red-100 shadow-2xl">
      <span className="min-w-0 flex-1">{message}</span>
      <button className="rounded-lg bg-white/10 px-3 py-1.5 font-semibold" onClick={() => { setMessage(null); onRetry() }}>Retry</button>
      <button aria-label="Dismiss" className="px-1 text-base" onClick={() => setMessage(null)}>×</button>
    </div>
  )
}
