import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo): void { console.error('Apex Bookings application error', error, info) }
  render(): ReactNode { if (this.state.error) return <main className="min-h-screen bg-[#09090B] text-zinc-100 grid place-items-center p-6"><section className="max-w-md rounded-3xl border border-red-500/30 bg-[#111113] p-7"><h1 className="font-serif text-2xl font-bold">We could not open this workspace</h1><p className="mt-3 text-sm text-zinc-400">{this.state.error.message}</p><button onClick={() => window.location.assign('/admin/login')} className="mt-6 rounded-xl bg-[#00FF88] px-5 py-3 text-sm font-bold text-[#09090B]">Return to admin access</button></section></main>; return this.props.children }
}