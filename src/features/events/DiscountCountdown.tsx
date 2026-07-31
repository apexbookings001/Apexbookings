import { useEffect, useState } from 'react'

const remaining = (endsAt: string, now: number) => Math.max(0, Date.parse(endsAt) - now)
const label = (ms: number) => {
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`
}

/** A shared one-second clock keeps package cards in sync without per-card intervals. */
let listeners = new Set<() => void>()
let timer: number | undefined
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (!timer) timer = window.setInterval(() => listeners.forEach(fn => fn()), 1000)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && timer) { window.clearInterval(timer); timer = undefined }
  }
}

export function DiscountCountdown({ endsAt, className = '' }: { endsAt: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let unsubscribe: () => void = () => {}
    unsubscribe = subscribe(() => {
      const next = Date.now()
      setNow(next)
      if (remaining(endsAt, next) === 0) unsubscribe()
    })
    return unsubscribe
  }, [endsAt])
  const ms = remaining(endsAt, now)
  if (!ms) return null
  return <span className={`inline-block min-w-[11rem] tabular-nums ${className}`}>Offer ends in {label(ms)}</span>
}
