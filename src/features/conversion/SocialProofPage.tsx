import { useEffect, useRef, useState } from 'react'
import { mediaLibraryStore } from '../media/mediaLibraryStore'
import { socialProofStore, type SocialProofItem, type SocialProofSettings } from './socialProofStore'

const inputClass = 'mt-1.5 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400'

export function SocialProofPage({ show }: { show: (message: string) => void }) {
  const [settings, setSettings] = useState<SocialProofSettings>(socialProofStore.settings)
  const [items, setItems] = useState<SocialProofItem[]>(socialProofStore.list)
  const [selected, setSelected] = useState<SocialProofItem | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const itemInput = useRef<HTMLInputElement>(null)
  const defaultsInput = useRef<HTMLInputElement>(null)

  useEffect(() => socialProofStore.subscribe(() => { setSettings(socialProofStore.settings()); setItems(socialProofStore.list()) }), [])
  const update = <K extends keyof SocialProofSettings>(key: K, value: SocialProofSettings[K]) => setSettings(current => ({ ...current, [key]: value }))
  const saveDefaults = () => { socialProofStore.updateSettings(settings); show('Social-proof defaults saved') }
  const upload = async (file: File | undefined, target: 'defaults' | 'item') => {
    if (!file) return
    setUploading(true); setUploadError(null)
    try {
      const asset = await mediaLibraryStore.upload(file, 'Artist Photos')
      if (target === 'defaults') setSettings(current => ({ ...current, customerImage: asset.url }))
      else setSelected(current => current ? { ...current, avatar: asset.url } : current)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Image upload failed')
    } finally { setUploading(false) }
  }

  return <div className="space-y-6 text-white">
    <div><p className="font-mono text-xs uppercase tracking-widest text-emerald-400">Conversion management</p><h1 className="mt-1 font-serif text-2xl font-bold">Social Proof Settings</h1><p className="mt-1 text-sm text-zinc-500">Configure organization defaults. Individual events may override these values in Event Studio.</p></div>
    <section className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-serif text-lg font-bold">Default popup</h2><p className="text-xs text-zinc-500">Applied to every published event without an override.</p></div><button type="button" role="switch" aria-checked={settings.enabled} onClick={() => update('enabled', !settings.enabled)} className={`h-7 w-12 overflow-hidden rounded-full p-1 ${settings.enabled ? 'bg-emerald-400' : 'bg-zinc-700'}`}><span className={`block h-5 w-5 rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-5' : 'translate-x-0'}`}/></button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">Default customer name<input className={inputClass} value={settings.defaultCustomerName} onChange={event => update('defaultCustomerName', event.target.value)}/></label>
        <label className="text-xs text-zinc-400">Package name<input className={inputClass} value={settings.packageName} onChange={event => update('packageName', event.target.value)}/></label>
        <label className="text-xs text-zinc-400">City<input className={inputClass} value={settings.city} onChange={event => update('city', event.target.value)}/></label>
        <label className="text-xs text-zinc-400">State / region<input className={inputClass} value={settings.state} onChange={event => update('state', event.target.value)}/></label>
        <label className="sm:col-span-2 text-xs text-zinc-400">Popup message<input className={inputClass} value={settings.message} onChange={event => update('message', event.target.value)}/></label>
        <label className="text-xs text-zinc-400">Display duration (seconds)<input type="number" min="2" max="30" className={inputClass} value={settings.duration} onChange={event => update('duration', Number(event.target.value))}/></label>
        <label className="text-xs text-zinc-400">Delay between popups (seconds)<input type="number" min="2" max="120" className={inputClass} value={settings.delay} onChange={event => update('delay', Number(event.target.value))}/></label>
        <label className="text-xs text-zinc-400">Animation<select className={inputClass} value={settings.animation} onChange={event => update('animation', event.target.value as SocialProofSettings['animation'])}>{['fade','slide-up','slide-left','scale','fade-slide'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-xs text-zinc-400">Screen position<select className={inputClass} value={settings.position} onChange={event => update('position', event.target.value as SocialProofSettings['position'])}>{['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right'].map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="sm:col-span-2"><div className="text-xs text-zinc-400">Customer image</div><div className="mt-2 flex flex-wrap items-center gap-3">{settings.customerImage ? <img src={settings.customerImage} alt="Default customer" className="h-16 w-16 rounded-2xl object-cover"/> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/5 text-[10px] text-zinc-500">No image</div>}<input ref={defaultsInput} hidden type="file" accept="image/*" onChange={event => void upload(event.target.files?.[0], 'defaults')}/><button onClick={() => defaultsInput.current?.click()} className="rounded-xl bg-white/5 px-3 py-2 text-xs">Replace Image</button><button onClick={() => update('customerImage', undefined)} className="text-xs text-red-300">Remove Image</button></div></div>
        <div className="sm:col-span-2"><div className="text-xs text-zinc-400">Page targeting</div><div className="mt-2 flex flex-wrap gap-2">{['event','checkout','payment','ticket'].map(page => <label key={page} className="rounded-lg bg-white/5 px-3 py-2 text-xs capitalize"><input className="mr-2" type="checkbox" checked={settings.pageTargeting.includes(page)} onChange={event => update('pageTargeting', event.target.checked ? [...settings.pageTargeting, page] : settings.pageTargeting.filter(item => item !== page))}/>{page}</label>)}</div></div>
        <label className="flex items-center justify-between rounded-xl bg-white/[.03] p-3 text-sm">Visible on mobile<input type="checkbox" checked={settings.mobileVisible} onChange={event => update('mobileVisible', event.target.checked)}/></label>
        <label className="flex items-center justify-between rounded-xl bg-white/[.03] p-3 text-sm">Visible on desktop<input type="checkbox" checked={settings.desktopVisible} onChange={event => update('desktopVisible', event.target.checked)}/></label>
      </div>{uploading && <p className="mt-3 text-xs text-emerald-300">Uploading image…</p>}{uploadError && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-xs text-red-300">{uploadError}</p>}<button onClick={saveDefaults} className="mt-5 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950">Save Social Proof Defaults</button>
    </section>

    <section className="rounded-2xl border border-white/10"><div className="flex items-center justify-between p-4"><h2 className="font-serif text-lg font-bold">Customer notices</h2><button onClick={() => { const item = socialProofStore.create(); socialProofStore.save(item); setSelected(item) }} className="rounded-xl bg-white/5 px-3 py-2 text-xs text-emerald-300">Create notification</button></div>{items.map(item => <button key={item.id} onClick={() => setSelected(item)} className="flex w-full items-center gap-3 border-t border-white/10 p-4 text-left"><div>{item.avatar ? <img src={item.avatar} alt="" className="h-10 w-10 rounded-full object-cover"/> : <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-400/10 text-xs text-emerald-300">{item.name.slice(0,2).toUpperCase()}</span>}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{item.name}</div><div className="truncate text-xs text-zinc-500">{item.city}, {item.state} · {item.ticketPackage}</div></div><span className="text-xs text-zinc-500">Edit</span></button>)}</section>

    {selected && <div className="fixed inset-0 z-[500] grid place-items-center overflow-y-auto bg-black/75 p-4"><section className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111113] p-6"><div className="flex items-start justify-between"><h2 className="font-serif text-xl font-bold">Edit customer notice</h2><button onClick={() => setSelected(null)}>×</button></div><div className="mt-5 flex items-center gap-3">{selected.avatar ? <img src={selected.avatar} alt={selected.name} className="h-20 w-20 rounded-2xl object-cover"/> : <div className="grid h-20 w-20 place-items-center rounded-2xl bg-white/5 text-xs text-zinc-500">No image</div>}<input ref={itemInput} hidden type="file" accept="image/*" onChange={event => void upload(event.target.files?.[0], 'item')}/><div className="space-y-2"><button onClick={() => itemInput.current?.click()} className="block rounded-lg bg-white/5 px-3 py-2 text-xs">Replace Image</button><button onClick={() => setSelected(current => current ? { ...current, avatar: undefined } : current)} className="block text-xs text-red-300">Remove Image</button></div></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Customer name<input className={inputClass} value={selected.name} onChange={event => setSelected({ ...selected, name: event.target.value })}/></label><label className="text-xs text-zinc-400">Package<input className={inputClass} value={selected.ticketPackage} onChange={event => setSelected({ ...selected, ticketPackage: event.target.value })}/></label><label className="text-xs text-zinc-400">City<input className={inputClass} value={selected.city} onChange={event => setSelected({ ...selected, city: event.target.value })}/></label><label className="text-xs text-zinc-400">State<input className={inputClass} value={selected.state} onChange={event => setSelected({ ...selected, state: event.target.value })}/></label><label className="sm:col-span-2 text-xs text-zinc-400">Message<input className={inputClass} value={selected.message} onChange={event => setSelected({ ...selected, message: event.target.value })}/></label></div><div className="mt-6 flex justify-between gap-2"><button onClick={() => { socialProofStore.remove(selected.id); setSelected(null); show('Notification deleted') }} className="rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300">Delete</button><button onClick={() => { socialProofStore.save(selected); setSelected(null); show('Notification saved') }} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950">Save notification</button></div></section></div>}
  </div>
}
