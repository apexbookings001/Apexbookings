import { useState } from 'react'
import { type BookingPackage } from './bookingTemplate'
import { createPackageFromType, PACKAGE_TYPE_LIBRARY, type PackageTypeDefinition } from './packageTypeLibrary'
import { PackageTypeLibraryPicker } from './PackageTypeLibraryPicker'
import { defaultDiscountEndsAt, packagePricing, validatePackageDiscount } from './packagePricing'

export function VisualPackageEditor({
  packages,
  onChange,
}: {
  packages: BookingPackage[]
  onChange: (packages: BookingPackage[]) => void
}) {
  const [targetIndex, setTargetIndex] = useState<number | undefined>(undefined)
  const [packageNotice, setPackageNotice] = useState<string | null>(null)

  const mutate = (change: (next: BookingPackage[]) => void) => {
    const next = structuredClone(packages)
    change(next)
    onChange(next)
  }

  const input = (label: string, value: string, set: (value: string) => void, multiline = false) => (
    <label className="block">
      <span className="text-[11px] text-zinc-400">{label}</span>
      {multiline
        ? <textarea value={value} onChange={e => set(e.target.value)} className="mt-1.5 h-24 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
        : <input value={value} onChange={e => set(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" />
      }
    </label>
  )

  const addBlankPackage = () => {
    const starter = createPackageFromType(PACKAGE_TYPE_LIBRARY[0])
    mutate(next => { next.push({ ...starter, name: 'New Package', desc: 'Describe what this package includes', badge: null, price: 0, seats: 100 }) })
    setPackageNotice('New package card added.')
  }

  const removeSelectedPackage = () => {
    if (targetIndex === undefined) return
    if (packages.length <= 1) return setPackageNotice('At least one package card is required.')
    const item = packages[targetIndex]
    if (!item || !window.confirm(`Remove only the "${item.name}" package card?`)) return
    mutate(next => { next.splice(targetIndex, 1) })
    setTargetIndex(undefined)
  }

  // ── Detail view ────────────────────────────────────────────────────────────
  if (targetIndex !== undefined) {
    const item = packages[targetIndex]
    if (!item) { setTargetIndex(undefined); return null }
    const pricing = packagePricing(item)
    const discountError = validatePackageDiscount(item)
    const localEnd = item.discountEndsAt ? new Date(item.discountEndsAt).toISOString().slice(0, 16) : ''

    const applyPackageType = (type: PackageTypeDefinition) => {
      mutate(next => {
        const currentId = next[targetIndex].id
        next[targetIndex] = { ...createPackageFromType(type), id: currentId }
      })
      setPackageNotice(`${type.name} defaults applied. Customize every field below.`)
    }

    return (
      <div className="space-y-4">
        <button type="button" onClick={() => { setTargetIndex(undefined); setPackageNotice(null) }} className="text-xs text-zinc-400 hover:text-white">
          ← Back to packages list
        </button>

        {/* Package preview card */}
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl" style={{ background: `${item.accent}18`, border: `1px solid ${item.accent}40` }}>
              {item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-serif text-lg font-bold text-white">{item.name}</div>
                {item.badge && <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${item.accent}18`, color: item.accent }}>{item.badge}</span>}
              </div>
              <div className="mt-1 text-xs text-zinc-400">{item.desc}</div>
              <div className="mt-2 text-xs font-bold" style={{ color: item.accent }}>{item.seats.toLocaleString()} available · {item.benefits.length} benefits</div>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-white/10 bg-white/[.025] p-3">
          <div className="text-xs font-bold text-white">Manage package cards</div>
          <div className="mt-1 text-[10px] text-zinc-500">Remove only {item.name}; every other package remains unchanged.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={packages.length <= 1} onClick={removeSelectedPackage}
              className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 disabled:cursor-not-allowed disabled:opacity-40">
              Remove only this package
            </button>
          </div>
        </div>

        <PackageTypeLibraryPicker currentName={item.name} action="replace" onSelect={applyPackageType} />

        {packageNotice && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200">✓ {packageNotice}</div>}

        {input('Package name', item.name, v => mutate(next => { next[targetIndex].name = v }))}
        {input('Description', item.desc, v => mutate(next => { next[targetIndex].desc = v }), true)}
        <div className="grid grid-cols-2 gap-3">
          {input('Original Price', String(item.originalPrice ?? item.price), v => mutate(next => { const price = Math.max(0, Number(v) || 0); next[targetIndex].price = price; next[targetIndex].originalPrice = price }))}
          {input('Available seats (visual)', String(item.seats), v => mutate(next => { next[targetIndex].seats = Math.max(0, Number(v) || 0) }))}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[.025] p-3 space-y-3">
          <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold text-white">Enable Discount</div><div className="text-[10px] text-zinc-500">Show an expiring package offer.</div></div><button type="button" onClick={() => mutate(next => { const current = next[targetIndex]; current.discountEnabled = !current.discountEnabled; if (!current.discountEndsAt) current.discountEndsAt = defaultDiscountEndsAt() })} className={`h-6 w-11 rounded-full p-0.5 transition ${item.discountEnabled ? 'bg-emerald-400' : 'bg-white/10'}`}><span className={`block h-5 w-5 rounded-full bg-white transition ${item.discountEnabled ? 'translate-x-5' : ''}`} /></button></div>
          {item.discountEnabled && <><div className="grid grid-cols-2 gap-3"><label className="block"><span className="text-[11px] text-zinc-400">Discounted Price</span><input type="number" min="0" step="0.01" value={item.discountedPrice ?? ''} onChange={e => mutate(next => { next[targetIndex].discountedPrice = Math.max(0, Number(e.target.value) || 0) })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label><label className="block"><span className="text-[11px] text-zinc-400">Discount End Date & Time</span><input type="datetime-local" value={localEnd} onChange={e => mutate(next => { next[targetIndex].discountEndsAt = e.target.value ? new Date(e.target.value).toISOString() : null })} className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400" /></label></div><div className="text-xs text-zinc-300">Original: {pricing.originalUnitPrice.toFixed(2)} · Customer pays: {pricing.chargedUnitPrice.toFixed(2)} · Savings: {pricing.discountAmount.toFixed(2)} ({pricing.discountPercentage}%){item.discountEndsAt ? ` · Ends: ${new Date(item.discountEndsAt).toLocaleString()}` : ''}</div>{discountError && <div className="text-xs text-red-300">{discountError}</div>}</>}
        </div>

        {/* Badge picker */}
        <div>
          <div className="mb-2 text-[11px] text-zinc-400">Quick badge</div>
          <div className="flex flex-wrap gap-1.5">
            {['Great Value', 'Popular', 'Best Seller', 'Limited', 'Recommended', 'Exclusive', 'Ultimate Access'].map(badge => (
              <button key={badge} type="button" onClick={() => mutate(next => { next[targetIndex].badge = badge })}
                className="rounded-full border px-2.5 py-1 text-[10px]"
                style={{
                  background: item.badge === badge ? `${item.accent}18` : 'rgba(255,255,255,.03)',
                  borderColor: item.badge === badge ? `${item.accent}60` : 'rgba(255,255,255,.1)',
                  color: item.badge === badge ? item.accent : '#A1A1AA',
                }}>
                {badge}
              </button>
            ))}
            <button type="button" onClick={() => mutate(next => { next[targetIndex].badge = null })}
              className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-zinc-500">
              No badge
            </button>
          </div>
        </div>
        {input('Custom badge', item.badge ?? '', v => mutate(next => { next[targetIndex].badge = v.trim() || null }))}

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          {input('Icon (emoji)', item.icon, v => mutate(next => { next[targetIndex].icon = v }))}
          <label className="block">
            <span className="text-[11px] text-zinc-400">Accent</span>
            <input type="color" value={item.accent}
              onChange={e => mutate(next => { next[targetIndex].accent = e.target.value; next[targetIndex].glow = `${e.target.value}38` })}
              className="mt-1.5 h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-white/5 p-1" />
          </label>
        </div>

        {input('Seat sections (one per line)', item.sections.join('\n'), v => mutate(next => { next[targetIndex].sections = v.split('\n').map(s => s.trim()).filter(Boolean) }), true)}
        {input('Benefits (one per line)', item.benefits.join('\n'), v => mutate(next => { next[targetIndex].benefits = v.split('\n').map(b => b.trim()).filter(Boolean) }), true)}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold text-white">Package card manager</div>
            <div className="mt-1 text-[10px] text-zinc-500">Select a card to edit it, or add new cards below.</div>
          </div>
          <button type="button" onClick={addBlankPackage} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-zinc-950">
            + Add blank package
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {packages.map((item, index) => (
            <button key={item.id} type="button"
              onClick={() => { setTargetIndex(index); setPackageNotice(null) }}
              className="w-full text-left flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.035] p-3 hover:border-emerald-400/50 hover:bg-white/5 transition-colors">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg" style={{ background: `${item.accent}18` }}>{item.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white">{item.name}</div>
                <div className="mt-0.5 text-[10px] text-zinc-500">{item.seats.toLocaleString()} seats · ${item.price.toLocaleString()}</div>
              </div>
              <div className="text-xs text-emerald-400 font-bold px-2">Edit →</div>
            </button>
          ))}
        </div>
      </div>

      <PackageTypeLibraryPicker action="add" onSelect={type => {
        mutate(next => { next.push(createPackageFromType(type)) })
        setPackageNotice(`${type.name} was added. Tap its card above to customise it.`)
      }} />

      {packageNotice && <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-xs text-emerald-200">✓ {packageNotice}</div>}

      {/* Quick show bundles */}
      <div className="border-t border-white/10 pt-4">
        <div className="text-xs font-semibold mb-1 text-emerald-400">Add quick show bundles</div>
        <div className="mb-3 text-[10px] text-zinc-500">Append a ready-made two-tier setup without removing existing cards.</div>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries({
            Concert: [
              { id: 'regular', name: 'Regular', price: 150, desc: 'Standard floor access', badge: 'Great Value', accent: '#64748B', glow: 'rgba(100,116,139,0.2)', seats: 5000, icon: '🎫', sections: ['Floor'], benefits: ['Standard entry', 'Floor access', 'Mobile ticket delivery'] },
              { id: 'vip', name: 'VIP Pit', price: 350, desc: 'Premium pit access', badge: 'Best Seller', accent: '#00D982', glow: 'rgba(0,217,130,0.24)', seats: 500, icon: '💎', sections: ['VIP Pit'], benefits: ['Early entry', 'Pit access', 'VIP bar'] },
            ],
            Comedy: [
              { id: 'ga', name: 'Standard Seating', price: 65, desc: 'Rear stalls', badge: null, accent: '#71717A', glow: 'rgba(113,113,122,0.18)', seats: 800, icon: '🪑', sections: ['Stalls'], benefits: ['Standard entry', 'Reserved seat'] },
              { id: 'front', name: 'Front Row', price: 120, desc: 'Best views', badge: null, accent: '#8B5CF6', glow: 'rgba(139,92,246,0.22)', seats: 50, icon: '🎭', sections: ['Row A'], benefits: ['Front row seat', 'Meet & greet'] },
            ],
            Sports: [
              { id: 'ga', name: 'Upper Tier', price: 90, desc: 'Upper bowl', badge: null, accent: '#71717A', glow: 'rgba(113,113,122,0.18)', seats: 15000, icon: '🎫', sections: ['Upper Bowl'], benefits: ['Standard entry'] },
              { id: 'club', name: 'Club Level', price: 280, desc: 'Premium seating', badge: 'Popular', accent: '#F59E0B', glow: 'rgba(245,158,11,0.22)', seats: 2000, icon: '🏆', sections: ['Club'], benefits: ['Club access', 'Padded seats', 'Private bar'] },
            ],
            Theatre: [
              { id: 'balcony', name: 'Balcony', price: 75, desc: 'Upper level', badge: null, accent: '#71717A', glow: 'rgba(113,113,122,0.18)', seats: 800, icon: '🎭', sections: ['Balcony'], benefits: ['Standard entry'] },
              { id: 'stalls', name: 'Premium Stalls', price: 145, desc: 'Main floor', badge: 'Best View', accent: '#22D3EE', glow: 'rgba(34,211,238,0.22)', seats: 400, icon: '✨', sections: ['Stalls'], benefits: ['Premium seat', 'Lounge access'] },
            ],
          })).map(([presetName, presetData]) => (
            <button key={presetName} type="button"
              onClick={() => {
                mutate(next => {
                  next.push(...presetData.map(item => ({ ...item, id: crypto.randomUUID(), sections: [...item.sections], benefits: [...item.benefits] })))
                })
                setPackageNotice(`${presetName} bundle added. Existing cards were preserved.`)
              }}
              className="bg-white/5 border border-white/10 rounded-xl p-2 text-xs hover:bg-white/10 transition-colors text-left">
              + {presetName}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
