import { PACKAGE_TYPE_LIBRARY, type PackageTypeDefinition } from './packageTypeLibrary'

export function PackageTypeLibraryPicker({ currentName, action, onSelect }: { currentName?: string; action: 'add' | 'replace'; onSelect: (type: PackageTypeDefinition) => void }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.025] p-3">
    <div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold text-white">Package type library</div><div className="mt-1 text-[10px] leading-relaxed text-zinc-500">{action === 'add' ? 'Select a ready-made package to add it to this page.' : 'Apply a package type, then customize every field below.'}</div></div><span className="shrink-0 rounded-full bg-emerald-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">{PACKAGE_TYPE_LIBRARY.length} types</span></div>
    <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
      {PACKAGE_TYPE_LIBRARY.map(type => {
        const selected = currentName === type.name
        return <button key={type.key} type="button" onClick={() => onSelect(type)} className="group rounded-xl border p-2.5 text-left transition-all hover:-translate-y-0.5" style={{ background: selected ? `${type.accent}16` : 'rgba(255,255,255,.035)', borderColor: selected ? `${type.accent}70` : 'rgba(255,255,255,.08)' }}>
          <div className="flex items-start gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base" style={{ background: `${type.accent}18`, border: `1px solid ${type.accent}35` }}>{type.icon}</span><div className="min-w-0"><div className="truncate text-[11px] font-bold text-white">{type.name}</div><div className="mt-0.5 text-[9px] uppercase tracking-wider" style={{ color: type.accent }}>{type.category}</div></div></div>
          <div className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{type.description}</div>
          {type.badge && <span className="mt-2 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: `${type.accent}14`, color: type.accent }}>{type.badge}</span>}
        </button>
      })}
    </div>
  </div>
}
