import { useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { ticketStore, type TicketRecord } from '../features/bookings/ticketStore'
import { downloadTicketPng } from '../features/tickets/ticketDownloadService'
import { createTicketViewModel } from '../features/tickets/ticketViewModel'
import { ThemeCtx, DARK } from '../theme'
import movieTicketLogo from '../../icons/movie-ticket.gif'
import verifiedIcon from '../../icons/verified.png'
import { useLocale } from '../i18n/LocaleContext'

export function TicketVerificationPage() {
  const { t: translate, formatDate, locale } = useLocale()
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<TicketRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPreparingTicket, setIsPreparingTicket] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Use the standard dark theme for a premium look
  const t = DARK

  useEffect(() => {
    let active = true
    if (!ticketId) {
      setLoading(false)
      return
    }
    void ticketStore.findRemote(ticketId)
      .then(found => { if (active) setTicket(found) })
      .catch(() => { if (active) setTicket(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [ticketId])

  useEffect(() => {
    document.body.style.background = t.bg
    document.body.style.color = t.text
    return () => {
      document.body.style.background = ''
      document.body.style.color = ''
    }
  }, [t])

  const ticketView = ticket ? createTicketViewModel(ticket, {}, {
    locale: locale.bcp47,
    verificationUrl: `${window.location.origin}/ticket/${encodeURIComponent(ticket.qrToken ?? ticket.id)}`,
  }) : null

  const downloadTicket = async () => {
    if (!ticketView || isPreparingTicket) return
    setIsPreparingTicket(true)
    setDownloadError(null)
    try {
      await downloadTicketPng(ticketView)
    } catch (error) {
      console.error('[ticket-download] Unable to prepare ticket', error)
      setDownloadError('Unable to prepare your ticket. Please try again.')
    } finally {
      setIsPreparingTicket(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: t.bg }}>
        <div className="flex flex-col items-center gap-4">
          <svg className="animate-spin w-8 h-8" style={{ color: t.accent }} viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <div className="text-sm font-mono tracking-widest uppercase" style={{ color: t.textSub }}>{translate('ticket.verifying')}</div>
        </div>
      </div>
    )
  }

  // --- Invalid Ticket Screen ---
  if (!ticket || ticket.status !== 'approved') {
    return (
      <div className="min-h-[100dvh] flex flex-col" style={{ background: t.bg }}>
        <div className="p-5 flex items-center justify-center shrink-0 border-b" style={{ borderColor: t.border }}>
          <div className="flex items-center gap-2">
            <img src={movieTicketLogo} alt="Apex" className="w-8 h-8 rounded-lg object-contain" />
            <span className="font-serif font-bold text-lg" style={{ color: t.text }}>Apex Bookings</span>
          </div>
        </div>
        
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md text-center">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl" 
                 style={{ background: 'rgba(239, 68, 68, 0.15)', border: '2px solid #EF4444' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" className="w-10 h-10">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </div>
            
            <h1 className="text-3xl font-serif font-bold mb-3" style={{ color: t.text }}>{translate('ticket.invalid')}</h1>
            
            <p className="text-base mb-8 px-4" style={{ color: t.textSub }}>
              {translate('ticket.invalidDescription')}
            </p>
            
            <div className="p-5 rounded-2xl mb-8" style={{ background: t.card, border: `1px solid ${t.border}` }}>
              <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: t.textMuted }}>{translate('ticket.scannedData')}</div>
              <div className="font-mono text-sm break-all" style={{ color: '#EF4444' }}>{ticketId || translate('ticket.unknown')}</div>
            </div>
            
            <button 
              onClick={() => navigate('/')} 
              className="px-8 py-3.5 rounded-2xl font-bold transition-all text-sm w-full"
              style={{ background: t.inputBg, border: `1px solid ${t.border}`, color: t.text }}
            >
              {translate('ticket.returnHome')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Valid Ticket Screen ---
  return (
    <ThemeCtx.Provider value={{ t, toggle: () => {} }}>
      <div className="min-h-[100dvh] flex flex-col" style={{ background: t.bg }}>
        {/* Header */}
        <div className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 border-b relative z-10" style={{ borderColor: t.border, background: 'rgba(9, 9, 11, 0.8)', backdropFilter: 'blur(20px)' }}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-9 h-9 rounded-xl p-0.5 shadow-[0_8px_24px_rgba(0,0,0,0.28)]" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))', border: '1px solid rgba(255,255,255,0.14)' }}>
              <img src={movieTicketLogo} alt="Apex" className="w-full h-full rounded-[10px] object-contain" />
            </div>
            <span className="font-serif font-bold text-lg tracking-wide" style={{ color: t.text }}>{translate('ticket.verification')}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid rgba(0, 255, 136, 0.3)' }}>
            <div className="w-2 h-2 rounded-full bg-[#00FF88] animate-pulse" />
            <span className="text-xs font-bold tracking-wide" style={{ color: '#00FF88' }}>{translate('ticket.secureScan')}</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto px-4 py-8 sm:py-12">
          <div className="max-w-xl mx-auto space-y-6">
            
            {/* Status Hero */}
            <div className="text-center mb-8 relative">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(0,255,136,0.15) 0%, transparent 70%)', filter: 'blur(10px)' }} />
              <img 
                src={verifiedIcon} 
                alt="Verified" 
                className="w-28 h-28 mx-auto object-contain relative z-10 drop-shadow-[0_0_15px_rgba(0,255,136,0.4)]"
                style={{ animation: 'bounce-subtle 3s infinite ease-in-out' }}
              />
              <h1 className="text-3xl font-serif font-bold mt-4 mb-1 relative z-10" style={{ color: t.text }}>{translate('ticket.verifiedAttendee')}</h1>
              <p className="text-sm font-mono tracking-widest uppercase relative z-10" style={{ color: '#00FF88' }}>{translate('ticket.officialRecord')}</p>
            </div>

            {/* Ticket Card */}
            <div className="rounded-3xl overflow-hidden relative shadow-[0_20px_50px_rgba(0,0,0,0.5)]" 
                 style={{ background: t.card, border: `1px solid ${ticket.packageAccent}40` }}>
              
              {/* Event Banner */}
              <div className="h-40 relative">
              <img src={ticketView?.eventImage} alt={ticketView?.eventTitle} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111113] to-transparent opacity-90" />
              <div className="absolute bottom-4 left-5 right-5">
                  <div className="text-[10px] font-mono uppercase tracking-widest mb-1" style={{ color: ticket.packageAccent }}>{translate('ticket.presents', { host: ticketView?.eventHost || ticket.eventHost || ticket.eventName })}</div>
                  <div className="font-serif text-2xl font-bold leading-tight break-words" style={{ color: '#FFFFFF' }}>{ticketView?.eventTitle}</div>
                </div>
              </div>

              <div className="p-5 sm:p-6 space-y-6">
                <img src="/apex-email-ticket-logo.png" alt="Apex Bookings" className="h-12 w-auto rounded-lg bg-black object-cover object-center" />
                
                {/* Customer */}
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: t.textMuted }}>{translate('ticket.admitOne')}</div>
                  <div className="text-xl font-bold break-words" style={{ color: t.text }}>{ticketView?.customerName}</div>
                </div>

                <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${t.border}, transparent)` }} />

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                  <div>
                    <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">{translate('ticket.eventDate')}</div>
                    <div className="text-sm font-semibold text-white break-words">{ticketView?.eventDate}</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">{translate('ticket.time')}</div>
                    <div className="text-sm font-semibold text-white break-words">{ticketView?.eventTime}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">{translate('ticket.venue')}</div>
                    <div className="text-sm font-semibold text-white break-words">{ticketView?.venue}</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">{translate('ticket.package')}</div>
                    <div className="text-sm font-bold break-words" style={{ color: ticket.packageAccent }}>{ticketView?.packageName}</div>
                  </div>
                  <div>
                    <div className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-1">{translate('ticket.seat')}</div>
                    <div className="text-sm font-bold text-white break-words">{ticketView?.seatLabel}</div>
                  </div>
                </div>

                <div className="h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${t.border}, transparent)` }} />

                {/* Meta */}
                <div className="bg-black/30 rounded-2xl p-4 border" style={{ borderColor: t.border }}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-zinc-400">{translate('ticket.bookingRef')}</span>
                    <span className="text-xs font-mono font-bold text-zinc-200">{ticket.bookingReference}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-zinc-400">{translate('ticket.number')}</span>
                    <span className="text-xs font-mono font-bold text-zinc-200">{ticket.ticketNumber}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-400">{translate('ticket.approved')}</span>
                    <span className="text-xs font-mono text-zinc-400">
                      {ticket.approvedAt ? formatDate(ticket.approvedAt, { dateStyle: 'medium', timeStyle: 'short' }) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-center">
              <button onClick={() => void downloadTicket()} disabled={isPreparingTicket} className="w-full rounded-2xl px-5 py-3 text-sm font-bold disabled:cursor-wait disabled:opacity-60" style={{ background: '#00FF88', color: '#09090B' }}>
                {isPreparingTicket ? 'Preparing ticket…' : translate('ticket.download')}
              </button>
              {downloadError && <p role="alert" className="text-sm text-red-300">{downloadError}</p>}
            </div>
            
            <div className="text-center text-xs pb-10" style={{ color: t.textMuted }}>
              {translate('ticket.scannedAt', { time: formatDate(new Date(), { dateStyle: 'medium', timeStyle: 'short' }) })}
            </div>
            
          </div>
        </div>
      </div>
    </ThemeCtx.Provider>
  )
}
