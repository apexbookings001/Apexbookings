import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import movieTicketLogo from '../../../icons/movie-ticket.gif'
import { createPortal } from 'react-dom'
import { supportStore, type AttachmentMeta, type ConversationDraft, type MessageType, type ReplyRef, type SupportConversation, type SupportMessage } from './supportStore'
import { useTheme } from '../../theme'
import { useAuth } from '../auth/AuthContext'
import { emailService } from '../email/emailService'
import { useSocialProofOverlay } from '../conversion/SocialProofOverlayContext'
import { useBookingRecoveryState } from '../recovery/BookingSessionRecoveryProvider'
import { useLocale } from '../../i18n/LocaleContext'
import { useDocumentScrollLock } from '../../hooks/useDocumentScrollLock'

// ─── Brand palettes ───────────────────────────────────────────────────────────
// Dark mode: emerald  |  Light mode: blue
const E = {
  primary: '#00D66B',
  hover: '#00C462',
  darkEm: '#009C4D',
  highlight: '#39F28F',
  border: 'rgba(0,214,107,0.22)',
  glow8: 'rgba(0,214,107,0.08)',
  glow15: 'rgba(0,214,107,0.15)',
  glow25: 'rgba(0,214,107,0.25)',
  gradient: 'linear-gradient(135deg,#00D66B,#00C462)',
  dark: '#09090B',
}

const B = {
  primary: '#2563EB',
  hover: '#1D4ED8',
  border: 'rgba(37,99,235,0.2)',
  glow8: 'rgba(37,99,235,0.08)',
  glow15: 'rgba(37,99,235,0.12)',
  glow25: 'rgba(37,99,235,0.22)',
  gradient: 'linear-gradient(135deg,#2563EB,#1D4ED8)',
  dark: '#FFFFFF',
}

// ─── Demo data for preview mode ───────────────────────────────────────────────
const DEMO_MESSAGES: SupportMessage[] = [
  { id: 'd1', type: 'text', body: 'Hi! How can we help with your booking today? 👋', from: 'admin', createdAt: new Date(Date.now() - 18 * 60000).toISOString(), status: 'read' },
  { id: 'd2', type: 'text', body: "Hi, I'd like to know if VIP tickets are still available.", from: 'customer', createdAt: new Date(Date.now() - 17 * 60000).toISOString(), status: 'read' },
  { id: 'd3', type: 'text', body: 'Yes! VIP tickets are currently available. Would you like assistance selecting your seat?', from: 'admin', createdAt: new Date(Date.now() - 16 * 60000).toISOString(), status: 'read' },
  { id: 'd4', type: 'image', body: 'Venue map', from: 'admin', createdAt: new Date(Date.now() - 15 * 60000).toISOString(), status: 'read', attachment: { name: 'venue-map.jpg', size: 245000, mimeType: 'image/jpeg', url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80', width: 600, height: 400 } },
  { id: 'd5', type: 'text', body: 'Can I upload my Apple Gift Card after purchasing?', from: 'customer', createdAt: new Date(Date.now() - 12 * 60000).toISOString(), status: 'read', replyTo: { messageId: 'd3', body: 'Yes! VIP tickets are currently available. Would you like assistance selecting your seat?', from: 'admin', type: 'text' } },
  { id: 'd6', type: 'text', body: "Absolutely. During checkout you'll be able to upload one or more payment proof images for verification. 📎", from: 'admin', createdAt: new Date(Date.now() - 10 * 60000).toISOString(), status: 'read' },
  { id: 'd7', type: 'document', body: 'Booking Terms & Conditions', from: 'admin', createdAt: new Date(Date.now() - 8 * 60000).toISOString(), status: 'read', attachment: { name: 'ApexBookings-Terms.pdf', size: 512000, mimeType: 'application/pdf', url: '#' } },
  { id: 'd8', type: 'voice', body: 'Voice note', from: 'customer', createdAt: new Date(Date.now() - 5 * 60000).toISOString(), status: 'delivered', attachment: { name: 'voice-note.webm', size: 38000, mimeType: 'audio/webm', url: '', duration: 7 } },
  { id: 'd9', type: 'text', body: 'Perfect, thanks so much! 🙏', from: 'customer', createdAt: new Date(Date.now() - 2 * 60000).toISOString(), status: 'delivered' },
]

const DEMO_CONVERSATION: SupportConversation = {
  id: 'preview',
  eventId: 'preview',
  customer: 'Event Guest',
  email: 'guest@demo.com',
  avatarColor: E.primary,
  status: 'open',
  unread: 0,
  notes: '',
  messages: DEMO_MESSAGES,
  updatedAt: new Date().toISOString(),
  createdAt: new Date(Date.now() - 20 * 60000).toISOString(),
  lastActivity: new Date().toISOString(),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function extIcon(mime: string) {
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('word') || mime.includes('doc')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊'
  if (mime.includes('zip') || mime.includes('rar')) return '🗜️'
  if (mime.includes('audio')) return '🎵'
  return '📎'
}

function fmtDateSep(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

// COMMON_EMOJIS for picker
const EMOJIS = ['😀', '😂', '🥰', '😍', '🤩', '😎', '🥳', '🤔', '😅', '😭', '❤️', '🔥', '✅', '🎉', '👍', '👋', '🙏', '💪', '⭐', '🎟️', '🎵', '📎', '🔗', '💬', '✨', '🚀', '💡', '📱', '💳', '🎫']

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      style={{ width: size, height: size, background: color ?? E.primary, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: size * 0.35, color: E.dark, flexShrink: 0, boxShadow: `0 0 0 2px ${E.border}` }}
    >
      {initials}
    </div>
  )
}

function TypingIndicator({ isDark = true }: { isDark?: boolean }) {
  const C = isDark ? E : B
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 16px', background: isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF', borderRadius: '18px 18px 18px 4px', width: 60, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0'}` }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: C.primary, animation: `typing-bounce 1.4s ${i * 0.18}s ease-in-out infinite` }} />
      ))}
    </div>
  )
}

function StatusTick({ status, isCustomer, isDark = true }: { status: SupportMessage['status']; isCustomer: boolean; isDark?: boolean }) {
  if (!isCustomer) return null
  const C = isDark ? E : B
  const color = status === 'read' ? C.primary : '#71717A'
  if (status === 'sending') return <span style={{ color: '#71717A', fontSize: 10 }}>⏳</span>
  if (status === 'failed') return <span style={{ color: '#EF4444', fontSize: 10 }}>⚠️</span>
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" style={{ display: 'inline-block', flexShrink: 0 }}>
      {status === 'sent' ? (
        <path d="M1 5l3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <path d="M1 5l3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 5l3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}

function ReplyBubble({ replyTo, onScroll }: { replyTo: ReplyRef; onScroll: (id: string) => void }) {
  return (
    <button
      onClick={() => onScroll(replyTo.messageId)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: 'rgba(0,212,106,0.08)', borderLeft: `3px solid ${E.primary}`,
        borderRadius: 8, padding: '6px 10px', marginBottom: 6, cursor: 'pointer',
        border: 'none',
      }}
    >
      <div style={{ fontSize: 11, color: E.primary, fontWeight: 700, marginBottom: 2 }}>
        {replyTo.from === 'customer' ? 'You' : 'Apex Support'}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(250,250,250,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
        {replyTo.attachmentUrl ? '📎 Attachment' : replyTo.body}
      </div>
    </button>
  )
}

function ImageMessage({ attachment, onExpand }: { attachment: AttachmentMeta; onExpand: (url: string, type: 'image' | 'video') => void }) {
  const [loaded, setLoaded] = useState(false)
  const aspect = attachment.width && attachment.height ? attachment.height / attachment.width : undefined
  return (
    <button
      onClick={() => onExpand(attachment.url, 'image')}
      style={{
        display: 'block', width: '100%', cursor: 'pointer', padding: 0, background: loaded ? 'transparent' : 'rgba(255,255,255,0.06)',
        border: 'none', borderRadius: 14, overflow: 'hidden', position: 'relative',
        maxWidth: 'min(300px, 72vw)',
        aspectRatio: aspect ? `1 / ${aspect}` : undefined,
      } as React.CSSProperties}
    >
      <img
        src={attachment.url}
        alt={attachment.name}
        onLoad={() => setLoaded(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 14 }}
        loading="lazy"
      />
      {loaded && (
        <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', borderRadius: 8, padding: '3px 8px', fontSize: 11, color: '#fff', display: 'flex', alignItems: 'center', gap: 4 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          View
        </div>
      )}
    </button>
  )
}

function VideoMessage({ attachment, onExpand }: { attachment: AttachmentMeta; onExpand: (url: string, type: 'image' | 'video') => void }) {
  return (
    <button onClick={() => onExpand(attachment.url, 'video')} style={{ position: 'relative', display: 'block', borderRadius: 12, overflow: 'hidden', background: '#000', width: 260, height: 160, border: 'none', cursor: 'pointer' }}>
      {attachment.thumbnail ? (
        <img src={attachment.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a1a1e,#0f0f12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 36 }}>🎬</span>
        </div>
      )}
      {/* Play button */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.25)' }}>
          <svg viewBox="0 0 24 24" fill="white" width="22" height="22"><path d="M5 3l14 9-14 9V3z" /></svg>
        </div>
      </div>
      {attachment.duration && (
        <div style={{ position: 'absolute', bottom: 8, right: 10, background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '2px 7px', fontSize: 11, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
          {Math.floor(attachment.duration / 60)}:{String(Math.floor(attachment.duration % 60)).padStart(2, '0')}
        </div>
      )}
    </button>
  )
}

function DocumentCard({ attachment }: { attachment: AttachmentMeta }) {
  return (
    <a
      href={attachment.url}
      download={attachment.name}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '12px 16px', textDecoration: 'none', minWidth: 230, border: '1px solid rgba(255,255,255,0.08)', transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
    >
      <div style={{ width: 40, height: 40, borderRadius: 10, background: E.glow15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 22 }}>{extIcon(attachment.mimeType)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#FAFAFA', fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</div>
        <div style={{ color: '#71717A', fontSize: 11, marginTop: 3 }}>{fmtBytes(attachment.size)}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke={E.primary} strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </a>
  )
}

function VoiceNotePlayer({ attachment }: { attachment: AttachmentMeta }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    return () => { audioRef.current?.pause() }
  }, [])

  const toggle = () => {
    if (!attachment.url) return
    if (!audioRef.current) {
      audioRef.current = new Audio(attachment.url)
      audioRef.current.ontimeupdate = () => {
        const el = audioRef.current!
        setProgress(el.duration ? el.currentTime / el.duration : 0)
      }
      audioRef.current.onended = () => { setPlaying(false); setProgress(0) }
    }
    audioRef.current.playbackRate = speed
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { void audioRef.current.play(); setPlaying(true) }
  }

  const dur = attachment.duration ?? 0
  const durStr = `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 210, padding: '2px 0' }}>
      {!open && <button
        onClick={toggle}
        style={{ width: 38, height: 38, borderRadius: '50%', background: E.gradient, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 2px 8px ${E.glow25}` }}
      >
        {playing
          ? <svg viewBox="0 0 24 24" fill={E.dark} width="13" height="13"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          : <svg viewBox="0 0 24 24" fill={E.dark} width="13" height="13"><path d="M5 3l14 9-14 9V3z" /></svg>
        }
      </button>}
      {/* Waveform */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 30, position: 'relative' }}>
        {Array.from({ length: 30 }, (_, i) => {
          const h = 6 + Math.sin(i * 0.75) * 9 + Math.cos(i * 1.3) * 4
          const filled = i / 30 <= progress
          return (
            <div
              key={i}
              style={{ width: 3, borderRadius: 2, background: filled ? E.primary : 'rgba(255,255,255,0.15)', height: Math.max(4, h), transition: 'background 0.1s' }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
        <span style={{ color: '#A1A1AA', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{durStr}</span>
        <button
          onClick={() => {
            const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1
            setSpeed(next)
            if (audioRef.current) audioRef.current.playbackRate = next
          }}
          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 5, padding: '1px 6px', fontSize: 10, color: '#A1A1AA', cursor: 'pointer', fontWeight: 600 }}
        >
          {speed}×
        </button>
      </div>
    </div>
  )
}

// ─── Fullscreen media viewer ──────────────────────────────────────────────────
function FullscreenViewer({ url, type, onClose }: { url: string; type: 'image' | 'video'; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.5, 4))
      if (e.key === '-') setScale(s => Math.max(s - 0.5, 1))
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setScale(s => Math.max(1, Math.min(4, s - e.deltaY * 0.002)))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('wheel', onWheel) }
  }, [onClose])

  const onMouseDown = (e: React.MouseEvent) => {
    if (scale === 1) return
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: drag.x, oy: drag.y }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    setDrag({ x: dragStart.current.ox + (e.clientX - dragStart.current.x), y: dragStart.current.oy + (e.clientY - dragStart.current.y) })
  }
  const onMouseUp = () => setDragging(false)

  return createPortal((
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(0,0,0,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fade-in 0.2s ease', cursor: 'zoom-out' }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 18, zIndex: 10 }}
      >✕</button>

      {/* Zoom controls */}
      <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 10 }}>
        <button onClick={e => { e.stopPropagation(); setScale(s => Math.max(1, s - 0.5)); if (scale <= 1.5) setDrag({ x: 0, y: 0 }) }}
          style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 18px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>−</button>
        <button onClick={e => { e.stopPropagation(); setScale(1); setDrag({ x: 0, y: 0 }) }}
          style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 18px', color: '#fff', fontSize: 13, cursor: 'pointer', minWidth: 50 }}>{Math.round(scale * 100)}%</button>
        <button onClick={e => { e.stopPropagation(); setScale(s => Math.min(4, s + 0.5)) }}
          style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 18px', color: '#fff', fontSize: 13, cursor: 'pointer' }}>+</button>
      </div>

      {/* Download */}
      <a
        href={url} download onClick={e => e.stopPropagation()}
        style={{ position: 'absolute', bottom: 24, right: 24, background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 16px', color: '#fff', fontSize: 12, textDecoration: 'none' }}
      >
        ↓ Download
      </a>

      <div
        onClick={e => e.stopPropagation()}
        onMouseDown={type === 'image' ? onMouseDown : undefined}
        onMouseMove={type === 'image' ? onMouseMove : undefined}
        onMouseUp={type === 'image' ? onMouseUp : undefined}
        onMouseLeave={type === 'image' ? onMouseUp : undefined}
        style={{ transform: type === 'image' ? `scale(${scale}) translate(${drag.x / scale}px, ${drag.y / scale}px)` : 'none', transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.16,1,0.3,1)', maxWidth: '90vw', maxHeight: '90vh', cursor: type === 'image' && scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
      >
        {type === 'image'
          ? <img src={url} alt="" style={{ maxWidth: '90vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 12, display: 'block' }} />
          : <video src={url} controls autoPlay playsInline preload="metadata" style={{ display: 'block', width: 'min(90vw, 960px)', maxHeight: '88vh', borderRadius: 12, background: '#000' }} />
        }
      </div>
    </div>
  ), document.body)
}

// ─── Voice recorder ───────────────────────────────────────────────────────────
type RecordingState = 'idle' | 'recording' | 'paused' | 'preview'

function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const [levels, setLevels] = useState<number[]>(Array(20).fill(0))

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      source.connect(analyser)
      analyserRef.current = analyser
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setState('preview')
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRef.current = mr
      setDuration(0)
      setState('recording')

      const updateLevels = () => {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const chunk = Math.floor(data.length / 20)
        setLevels(Array.from({ length: 20 }, (_, i) => {
          const slice = data.slice(i * chunk, (i + 1) * chunk)
          return slice.reduce((a, b) => a + b, 0) / slice.length / 255
        }))
        if (state === 'recording') requestAnimationFrame(updateLevels)
      }
      requestAnimationFrame(updateLevels)

      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    } catch {
      // Permission denied
    }
  }, [state])

  const pause = useCallback(() => {
    mediaRef.current?.pause()
    setState('paused')
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const resume = useCallback(() => {
    mediaRef.current?.resume()
    setState('recording')
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }, [])

  const stop = useCallback(() => {
    mediaRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const cancel = useCallback(() => {
    mediaRef.current?.stop()
    if (timerRef.current) clearInterval(timerRef.current)
    setAudioUrl(null)
    setAudioBlob(null)
    setDuration(0)
    setState('idle')
  }, [])

  const reset = useCallback(() => {
    setAudioUrl(null)
    setAudioBlob(null)
    setDuration(0)
    setState('idle')
  }, [])

  const durStr = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`

  return { state, duration, durStr, audioUrl, audioBlob, levels, start, pause, resume, stop, cancel, reset }
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div
      style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 14, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, zIndex: 10, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', animation: 'slide-up 0.15s ease', backdropFilter: 'blur(20px)' }}
    >
      {EMOJIS.map(em => (
        <button key={em} onClick={() => onSelect(em)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', borderRadius: 10, padding: '5px', transition: 'background 0.1s', lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >{em}</button>
      ))}
      <button onClick={onClose} style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '5px 8px', color: '#52525B', fontSize: 11, cursor: 'pointer', marginTop: 4 }}>Close</button>
    </div>
  )
}

// ─── Date separator ───────────────────────────────────────────────────────────
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="chat-date-sep">
      <span style={{ fontSize: 11, color: '#52525B', fontWeight: 600, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  message,
  isFirst,
  isLast,
  onReply,
  onScrollTo,
  onExpand,
  isDark = true,
}: {
  message: SupportMessage
  isFirst: boolean
  isLast: boolean
  onReply: (msg: SupportMessage) => void
  onScrollTo: (id: string) => void
  onExpand: (url: string, type: 'image' | 'video') => void
  isDark?: boolean
}) {
  const C = isDark ? E : B
  if (message.from === 'system') {
    return (
      <div id={`msg-${message.id}`} data-message-id={message.id} role="status" style={{ alignSelf: 'center', maxWidth: 'min(100%, 34rem)', margin: '10px 0 14px', borderRadius: 14, border: `1px solid ${isDark ? 'rgba(0,214,107,0.24)' : 'rgba(37,99,235,0.22)'}`, background: isDark ? 'rgba(0,214,107,0.08)' : 'rgba(37,99,235,0.06)', padding: '10px 13px', color: isDark ? '#D1FAE5' : '#1E3A8A', fontSize: 13, lineHeight: 1.5, textAlign: 'center', overflowWrap: 'anywhere' }}>
        <strong style={{ display: 'block', marginBottom: 3, fontSize: 11, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Automatic support notice</strong>
        {message.body}
      </div>
    )
  }
  const isCustomer = message.from === 'customer'
  const [hovered, setHovered] = useState(false)
  // Swipe to reply (mobile)
  const touchStartX = useRef(0)
  const [swipeX, setSwipeX] = useState(0)
  const [swiping, setSwiping] = useState(false)

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    setSwiping(true)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current
    if (!isCustomer && dx > 0 && dx < 80) setSwipeX(dx)    // admin msg: swipe right
    if (isCustomer && dx < 0 && dx > -80) setSwipeX(dx)     // customer msg: swipe left
  }
  const onTouchEnd = () => {
    if (Math.abs(swipeX) > 40) onReply(message)
    setSwipeX(0)
    setSwiping(false)
  }

  // Corner radii based on grouping position
  const customerRadius = isFirst && isLast ? '18px 18px 4px 18px'
    : isFirst ? '18px 18px 6px 18px'
      : isLast ? '18px 18px 4px 18px'
        : '18px 18px 6px 18px'

  const adminRadius = isFirst && isLast ? '18px 18px 18px 4px'
    : isFirst ? '4px 18px 18px 4px'
      : isLast ? '4px 18px 18px 4px'
        : '4px 18px 18px 4px'

  const isMedia = message.type === 'image' || message.type === 'video'

  return (
    <div
      id={`msg-${message.id}`}
      data-message-id={message.id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        display: 'flex',
        flexDirection: isCustomer ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 6,
        marginBottom: isLast ? 6 : 2,
        transform: `translateX(${swipeX}px)`,
        transition: swiping ? 'none' : 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
        position: 'relative',
        paddingLeft: isCustomer ? 0 : 8,
        paddingRight: isCustomer ? 8 : 0,
      }}
    >
      {/* Reply icon (desktop hover) */}
      {hovered && (
        <button
          onClick={() => onReply(message)}
          title="Reply"
          style={{
            position: 'absolute',
            [isCustomer ? 'left' : 'right']: -30,
            bottom: 8,
            background: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            width: 24,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#A1A1AA',
            fontSize: 13,
            animation: 'fade-in 0.15s ease',
          }}
        >
          ↩
        </button>
      )}

      {/* Bubble */}
      <div
        className="support-chat-overlay"
        style={{
          maxWidth: 'min(78%, 340px)',
          borderRadius: isCustomer ? customerRadius : adminRadius,
          padding: isMedia ? '4px' : '11px 15px',
          background: isCustomer
            ? (isDark
              ? 'linear-gradient(135deg, rgba(10,42,28,0.96) 0%, rgba(6,74,43,0.95) 50%, rgba(12,98,56,0.94) 100%)'
              : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)')
            : (isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF'),
          color: isCustomer ? '#F8FAFC' : (isDark ? '#FAFAFA' : '#0F172A'),
          fontSize: 14,
          lineHeight: 1.55,
          border: isCustomer ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0'}`,
          boxShadow: isCustomer ? '0 4px 16px rgba(0,0,0,0.24)' : (isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 12px rgba(15,23,42,0.06)'),
          textShadow: isCustomer ? '0 1px 2px rgba(0,0,0,0.22)' : 'none',
        }}
      >
        {/* Reply preview */}
        {message.replyTo && (
          <div style={{ marginBottom: 6, padding: isMedia ? '4px 4px 0' : undefined }}>
            <ReplyBubble replyTo={message.replyTo} onScroll={onScrollTo} />
          </div>
        )}

        {/* Content */}
        {message.type === 'text' && (
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.body}</span>
        )}
        {message.type === 'image' && message.attachment && (
          <ImageMessage attachment={message.attachment} onExpand={onExpand} />
        )}
        {message.type === 'video' && message.attachment && (
          <VideoMessage attachment={message.attachment} onExpand={onExpand} />
        )}
        {message.type === 'voice' && message.attachment && (
          <VoiceNotePlayer attachment={message.attachment} />
        )}
        {message.type === 'document' && message.attachment && (
          <DocumentCard attachment={message.attachment} />
        )}

        {/* Timestamp + status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: isMedia ? 2 : 4, opacity: 0.84 }}>
          <span style={{ fontSize: 10, color: isCustomer ? 'rgba(248,250,252,0.9)' : (isDark ? '#71717A' : '#94A3B8'), fontVariantNumeric: 'tabular-nums' }}>{fmtTime(message.createdAt)}</span>
          <StatusTick status={message.status} isCustomer={isCustomer} isDark={isDark} />
        </div>
      </div>
    </div>
  )
}

// ─── Reply strip (above composer) ─────────────────────────────────────────────
function ReplyStrip({ replyTo, onCancel, isDark = true }: { replyTo: ReplyRef; onCancel: () => void; isDark?: boolean }) {
  const C = isDark ? E : B
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: `1px solid ${C.border}`, background: C.glow8, backdropFilter: 'blur(8px)' }}>
      <div style={{ flex: 1, borderLeft: `3px solid ${C.primary}`, paddingLeft: 10 }}>
        <div style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>Replying to {replyTo.from === 'customer' ? 'yourself' : 'Apex Support'}</div>
        <div style={{ fontSize: 12, color: isDark ? '#A1A1AA' : '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
          {replyTo.body.slice(0, 80)}
        </div>
      </div>
      <button onClick={onCancel} style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0'}`, borderRadius: '50%', width: 24, height: 24, color: isDark ? '#71717A' : '#94A3B8', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
    </div>
  )
}

// ─── Composer ─────────────────────────────────────────────────────────────────
function Composer({
  conversationId,
  replyTo,
  onSend,
  onClearReply,
  isPreview,
  isDark = true,
}: {
  conversationId: string
  replyTo: ReplyRef | undefined
  onSend: (payload: { type: MessageType; body: string; attachment?: AttachmentMeta; replyTo?: ReplyRef }) => void
  onClearReply: () => void
  isPreview: boolean
  isDark?: boolean
}) {
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<AttachmentMeta[]>([])
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const voice = useVoiceRecorder()

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  // Load draft
  useEffect(() => {
    if (isPreview) return
    const draft = supportStore.getDraft(conversationId)
    setText(draft.text)
    setPendingFiles(draft.attachments)
  }, [conversationId, isPreview])

  // Save draft on change
  useEffect(() => {
    if (isPreview) return
    supportStore.saveDraft(conversationId, { text, replyTo, attachments: pendingFiles })
  }, [text, replyTo, pendingFiles, conversationId, isPreview])

  const send = useCallback(() => {
    const body = text.trim()
    if (!body && pendingFiles.length === 0) return

    if (pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        const type: MessageType = file.mimeType.startsWith('image/') ? 'image'
          : file.mimeType.startsWith('video/') ? 'video'
            : file.mimeType.startsWith('audio/') ? 'audio'
              : 'document'
        onSend({ type, body: file.name, attachment: file, replyTo })
      }
      setPendingFiles([])
    }

    if (body) {
      onSend({ type: 'text', body, replyTo })
    }
    setText('')
    onClearReply()
    if (!isPreview) supportStore.clearDraft(conversationId)
  }, [text, pendingFiles, replyTo, onSend, onClearReply, conversationId, isPreview])

  const sendVoice = useCallback(() => {
    if (!voice.audioBlob) return
    const url = voice.audioUrl ?? ''
    const attachment: AttachmentMeta = {
      name: `voice-note-${Date.now()}.webm`,
      size: voice.audioBlob.size,
      mimeType: 'audio/webm',
      url,
      duration: voice.duration,
      file: voice.audioBlob,
    }
    onSend({ type: 'voice', body: 'Voice note', attachment, replyTo })
    voice.reset()
    onClearReply()
  }, [voice, onSend, replyTo, onClearReply])

  const handleFile = async (files: FileList | File[] | null) => {
    if (!files) return
    const arr = Array.from(files)
    for (const file of arr) {
      const url = URL.createObjectURL(file)
      const meta: AttachmentMeta = { name: file.name, size: file.size, mimeType: file.type, url, file }
      if (file.type.startsWith('image/')) {
        await new Promise<void>(resolve => {
          const img = new Image()
          img.onload = () => {
            meta.width = img.naturalWidth
            meta.height = img.naturalHeight
            resolve()
          }
          img.src = url
        })
      }
      setPendingFiles(prev => [...prev, meta])
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    void handleFile(e.dataTransfer.files)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      send()
    }
    // Plain Enter = new line (default textarea behaviour)
  }

  // Voice recording UI
  if (voice.state !== 'idle') {
    const C = isDark ? E : B
    return (
      <div style={{ padding: '12px 14px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0'}`, display: 'flex', flexDirection: 'column', gap: 10, background: isDark ? 'rgba(0,212,106,0.03)' : 'rgba(37,99,235,0.03)' }}>
        {/* Waveform */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 36 }}>
          {voice.levels.map((lv, i) => (
            <div key={i} style={{ flex: 1, borderRadius: 2, background: C.primary, height: `${Math.max(10, lv * 100)}%`, transition: 'height 0.06s', opacity: voice.state === 'paused' ? 0.4 : 1 }} />
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#EF4444', fontVariantNumeric: 'tabular-nums', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', display: 'inline-block', animation: 'pulse-glow 1s ease infinite' }} />
            {voice.durStr}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={voice.cancel} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '6px 14px', color: '#EF4444', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            {voice.state === 'recording'
              ? <button onClick={voice.pause} style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'}`, borderRadius: 20, padding: '6px 14px', color: isDark ? '#FAFAFA' : '#475569', fontSize: 12, cursor: 'pointer' }}>Pause</button>
              : <button onClick={voice.resume} style={{ background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'}`, borderRadius: 20, padding: '6px 14px', color: isDark ? '#FAFAFA' : '#475569', fontSize: 12, cursor: 'pointer' }}>Resume</button>
            }
            <button onClick={voice.stop} style={{ background: C.gradient, border: 'none', borderRadius: 20, padding: '6px 16px', color: C.dark, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
        {voice.state === 'preview' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderRadius: 14, border: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0'}` }}>
            <VoiceNotePlayer attachment={{ name: 'preview', size: 0, mimeType: 'audio/webm', url: voice.audioUrl!, duration: voice.duration }} />
            <button onClick={sendVoice} style={{ background: C.gradient, border: 'none', borderRadius: '50%', width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: `0 2px 8px ${C.glow25}` }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={C.dark} strokeWidth="2.5" width="16" height="16"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        )}
      </div>
    )
  }

  const C = isDark ? E : B
  return (
    <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} style={{ borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0'}`, background: isDark ? 'transparent' : '#FFFFFF' }}>
      {/* Pending files */}
      {pendingFiles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#E2E8F0'}` }}>
          {pendingFiles.map((f, i) => (
            <div key={i} style={{ position: 'relative', background: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9', borderRadius: 12, overflow: 'hidden', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0'}` }}>
              {f.mimeType.startsWith('image/') ? (
                <img src={f.url} alt={f.name} style={{ width: 68, height: 68, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: 68, height: 68, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <span style={{ fontSize: 24 }}>{extIcon(f.mimeType)}</span>
                  <span style={{ fontSize: 9, color: isDark ? '#A1A1AA' : '#94A3B8', textAlign: 'center', padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 64 }}>{f.name}</span>
                </div>
              )}
              <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                style={{ position: 'absolute', top: 3, right: 3, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', border: 'none', borderRadius: '50%', width: 18, height: 18, fontSize: 9, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Reply strip */}
      {replyTo && <ReplyStrip replyTo={replyTo} onCancel={onClearReply} isDark={isDark} />}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '12px max(14px, env(safe-area-inset-right, 0px)) 12px max(14px, env(safe-area-inset-left, 0px))', position: 'relative' }}>
        {/* Emoji */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {showEmoji && <EmojiPicker onSelect={e => { setText(t => t + e); setShowEmoji(false) }} onClose={() => setShowEmoji(false)} />}
          <button
            onClick={() => setShowEmoji(v => !v)}
            style={{ width: 40, height: 40, background: showEmoji ? C.glow8 : (isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC'), border: `1px solid ${showEmoji ? C.border : (isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0')}`, borderRadius: 12, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', boxShadow: isDark ? 'none' : '0 2px 5px rgba(15,23,42,0.04)' }}
          >😊</button>
        </div>

        {/* File attach */}
        <label style={{ width: 40, height: 40, background: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0'}`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s', boxShadow: isDark ? 'none' : '0 2px 5px rgba(15,23,42,0.04)' }}
          onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.09)' : '#F1F5F9')}
          onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC')}
          title="Attach file">
          <svg viewBox="0 0 24 24" fill="none" stroke={isDark ? '#A1A1AA' : '#94A3B8'} strokeWidth="2" width="18" height="18"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip"
            onChange={e => void handleFile(e.target.files)}
          />
        </label>

        {/* Textarea */}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={isPreview ? 'Preview mode — messages are not sent' : 'Type your message…'}
            rows={1}
            style={{
              width: '100%',
              background: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
              border: `1px solid ${focused ? C.border : (isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1')}`,
              borderRadius: 14,
              padding: '10px 14px',
              color: isDark ? '#FAFAFA' : '#0F172A',
              fontSize: 16,
              outline: 'none',
              resize: 'none',
              lineHeight: 1.5,
              overflow: 'auto',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s, height 0.1s ease, box-shadow 0.2s ease',
              boxShadow: isDark
                ? (focused ? `0 0 0 3px ${C.glow8}` : 'none')
                : (focused ? `0 4px 14px rgba(37,99,235,0.1), 0 0 0 3px ${C.glow8}` : 'inset 0 2px 4px rgba(15,23,42,0.04), 0 2px 6px rgba(15,23,42,0.04)'),
            }}
          />
          {text.length > 500 && (
            <span style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 10, color: text.length > 800 ? '#EF4444' : '#52525B', fontVariantNumeric: 'tabular-nums' }}>{text.length}</span>
          )}
        </div>

        {/* Voice / Send */}
        {!text.trim() && pendingFiles.length === 0 ? (
          <button
            onClick={() => void voice.start()}
            title="Record voice note"
            style={{ width: 40, height: 40, background: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0'}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s', boxShadow: isDark ? 'none' : '0 2px 5px rgba(15,23,42,0.04)' }}
            onMouseEnter={e => { e.currentTarget.style.background = C.glow8; e.currentTarget.style.borderColor = C.border }}
            onMouseLeave={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC'; e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke={isDark ? '#A1A1AA' : '#94A3B8'} strokeWidth="2" width="18" height="18"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ) : (
          <button
            onClick={send}
            style={{ width: 42, height: 42, background: C.gradient, border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: `0 4px 14px ${C.glow25}`, flexShrink: 0, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 6px 20px ${C.glow25}`; e.currentTarget.style.transform = 'scale(1.08)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 4px 14px ${C.glow25}`; e.currentTarget.style.transform = 'scale(1)' }}
            title="Send (Ctrl+Enter)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke={isDark ? C.dark : '#FFFFFF'} strokeWidth="2.5" width="18" height="18"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main chat window ─────────────────────────────────────────────────────────
function ChatWindow({
  conversation,
  onClose,
  isPreview,
  onSend,
  isDark,
}: {
  conversation: SupportConversation
  onClose: () => void
  isPreview: boolean
  onSend: (payload: { type: MessageType; body: string; attachment?: AttachmentMeta; replyTo?: ReplyRef }) => void
  isDark: boolean
}) {
  const { t: translate } = useLocale()
  const [replyTo, setReplyTo] = useState<ReplyRef | undefined>()
  const [showTyping, setShowTyping] = useState(false)
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: 'image' | 'video' } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 640px)').matches)
  const [visualViewport, setVisualViewport] = useState(() => ({ height: Math.round(window.visualViewport?.height ?? window.innerHeight), offsetTop: Math.round(window.visualViewport?.offsetTop ?? 0) }))
  const isNearBottomRef = useRef(true)
  const previousConversationRef = useRef<string | null>(null)
  const previousMessageCountRef = useRef(0)
  const [newMessageCount, setNewMessageCount] = useState(0)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  // iOS keeps the layout viewport behind the software keyboard. This observes
  // only viewport resize/offset changes and avoids page-scroll state updates.
  useEffect(() => {
    if (isDesktop) return
    const viewport = window.visualViewport
    let frame = 0
    const update = () => {
      frame = 0
      const next = { height: Math.round(viewport?.height ?? window.innerHeight), offsetTop: Math.round(viewport?.offsetTop ?? 0) }
      setVisualViewport(previous => previous.height === next.height && previous.offsetTop === next.offsetTop ? previous : next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    return () => {
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [isDesktop])

  const isNearBottom = () => {
    const container = containerRef.current
    return !container || container.scrollHeight - container.scrollTop - container.clientHeight < 72
  }
  const scrollToBottom = (behavior: ScrollBehavior) => {
    const container = containerRef.current
    if (container) container.scrollTo({ top: container.scrollHeight, behavior })
  }

  useEffect(() => {
    const initialConversation = previousConversationRef.current !== conversation.id
    const countChanged = previousMessageCountRef.current !== conversation.messages.length
    if (initialConversation || countChanged) {
      const shouldFollow = initialConversation || isNearBottomRef.current || isNearBottom()
      if (shouldFollow) {
        requestAnimationFrame(() => scrollToBottom(initialConversation ? 'auto' : 'smooth'))
        isNearBottomRef.current = true
        setNewMessageCount(0)
      } else if (countChanged) {
        setNewMessageCount(count => count + 1)
      }
    }
    previousConversationRef.current = conversation.id
    previousMessageCountRef.current = conversation.messages.length
  }, [conversation.id, conversation.messages.length])

  // Simulate typing indicator after customer sends
  const lastMsg = conversation.messages[conversation.messages.length - 1]
  useEffect(() => {
    if (lastMsg?.from === 'customer' && !isPreview) {
      setShowTyping(true)
      const t = setTimeout(() => setShowTyping(false), 3000)
      return () => clearTimeout(t)
    }
  }, [lastMsg?.id, lastMsg?.from, isPreview])

  const scrollToMessage = (id: string) => {
    const container = containerRef.current
    const target = container?.querySelector<HTMLElement>(`[data-message-id="${id}"]`)
    if (container && target) container.scrollTo({ top: Math.max(0, target.offsetTop - 72), behavior: 'smooth' })
  }

  const handleReply = (msg: SupportMessage) => {
    if (msg.from === 'system') return
    const ref: ReplyRef = {
      messageId: msg.id,
      body: msg.body,
      from: msg.from,
      type: msg.type,
      attachmentUrl: msg.attachment?.url,
    }
    setReplyTo(ref)
  }

  const handleSend = (payload: Parameters<typeof onSend>[0]) => {
    onSend(payload)
    setReplyTo(undefined)
    // Simulate agent response in preview/demo
    if (isPreview) {
      setShowTyping(true)
      setTimeout(() => setShowTyping(false), 2500)
    }
  }

  const visibleMessages = conversation.messages.filter(m => !m.internal)

  // Build render items with date separators and grouping
  type RenderItem =
    | { kind: 'sep'; label: string; key: string }
    | { kind: 'msg'; message: SupportMessage; isFirst: boolean; isLast: boolean }

  const renderItems: RenderItem[] = []
  for (let i = 0; i < visibleMessages.length; i++) {
    const msg = visibleMessages[i]
    const prev = visibleMessages[i - 1]
    const next = visibleMessages[i + 1]

    // Date separator
    if (!prev || !isSameDay(prev.createdAt, msg.createdAt)) {
      renderItems.push({ kind: 'sep', label: fmtDateSep(msg.createdAt), key: `sep-${msg.id}` })
    }

    // Grouping: same sender, same day, within 5 minutes
    const sameGroup = (a: SupportMessage, b: SupportMessage) =>
      a.from === b.from &&
      isSameDay(a.createdAt, b.createdAt) &&
      Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) < 5 * 60000 &&
      !a.replyTo && !b.replyTo

    const isFirst = !prev || !sameGroup(prev, msg)
    const isLast = !next || !sameGroup(msg, next)

    renderItems.push({ kind: 'msg', message: msg, isFirst, isLast })
  }

  const handleMessageScroll = () => {
    isNearBottomRef.current = isNearBottom()
    if (isNearBottomRef.current) setNewMessageCount(0)
  }

  return createPortal((
    <>
      {/* Overlay */}
      <div
        className="public-chat-shell"
        style={{
          position: 'fixed', zIndex: 10020,
          background: isDesktop ? 'rgba(0,0,0,0.72)' : '#09090B',
          backdropFilter: isDesktop ? 'blur(16px)' : 'none',
          display: 'flex', alignItems: isDesktop ? 'center' : 'stretch', justifyContent: 'center',
          padding: isDesktop ? '24px' : 0,
          animation: 'fade-in 0.2s ease',
          ...(isDesktop ? { inset: 0 } : { top: `${visualViewport.offsetTop}px`, left: 0, right: 0, height: `${visualViewport.height}px`, overflow: 'hidden' }),
        }}
      >
        <div
          className="support-chat-surface public-chat-surface"
          style={{
            display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto',
            width: isDesktop ? 'min(980px, 100%)' : '100%',
            height: isDesktop ? 'min(88vh, 720px)' : '100%',
            minHeight: 0,
            background: isDark ? '#111113' : '#F8FAFC',
            borderRadius: isDesktop ? 24 : 0,
            border: isDesktop ? `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0'}` : 'none',
            overflow: 'hidden',
            boxShadow: isDesktop ? (isDark ? '0 40px 100px rgba(0,0,0,0.75)' : '0 24px 80px rgba(15,23,42,0.15)') : 'none',
            animation: isDesktop ? 'slide-in-scale 0.28s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
            paddingLeft: 'max(20px, env(safe-area-inset-left, 0px))',
            paddingRight: 'max(20px, env(safe-area-inset-right, 0px))',
            background: isDark ? '#09090B' : '#FFFFFF',
            borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E2E8F0',
            flexShrink: 0,
            boxShadow: isDark ? '0 2px 24px rgba(0,0,0,0.35)' : '0 1px 8px rgba(15,23,42,0.06)',
            paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
          }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: isDark ? 'rgba(0,0,0,0.18)' : B.gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                border: isDark ? '2px solid rgba(255,255,255,0.3)' : '2px solid rgba(37,99,235,0.25)',
                boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(37,99,235,0.2)',
                overflow: 'hidden',
              }}>
                <img src={movieTicketLogo} alt="App logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              {/* Online dot */}
              <span style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 11, height: 11, borderRadius: '50%',
                background: isDark ? '#ffffff' : '#22C55E',
                border: isDark ? `2.5px solid ${E.primary}` : '2.5px solid #FFFFFF',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.3)',
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: '-0.01em' }}>{translate('chat.title')}</div>
              <div style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.72)' : '#94A3B8', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: isDark ? '#FFFFFF' : '#22C55E', display: 'inline-block' }} />
                {translate('chat.online')}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: isDark ? 'rgba(255,255,255,0.12)' : '#F1F5F9',
                border: isDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid #E2E8F0',
                borderRadius: 12,
                padding: '8px 16px', fontWeight: 700, fontSize: 13,
                color: isDark ? '#FFFFFF' : '#475569',
                cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.2)' : '#E2E8F0')}
              onMouseLeave={e => (e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.12)' : '#F1F5F9')}
            >
              {translate('chat.close')}
            </button>
          </div>

          {/* Messages */}
          <div
            ref={containerRef}
            className={`chat-messages-scroll${isDark ? '' : ' chat-messages-scroll-light'}`}
            onScroll={handleMessageScroll}
            style={{ minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', padding: '12px max(16px, env(safe-area-inset-right, 0px)) 12px max(16px, env(safe-area-inset-left, 0px))', display: 'flex', flexDirection: 'column', gap: 0, background: isDark ? 'transparent' : '#F8FAFC' }}
          >
            {/* Welcome state */}
            {visibleMessages.length === 0 && !showTyping && (
              <div style={{
                alignSelf: 'flex-start', maxWidth: 300,
                background: isDark ? 'rgba(255,255,255,0.07)' : '#FFFFFF',
                borderRadius: '20px 20px 20px 4px',
                padding: '12px 16px', fontSize: 14,
                color: isDark ? '#A1A1AA' : '#475569',
                marginBottom: 8,
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0'}`,
                lineHeight: 1.6, boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(15,23,42,0.06)',
              }}>
                👋 Hi! How can we help with your booking today?
              </div>
            )}

            {renderItems.map(item =>
              item.kind === 'sep'
                ? <DateSeparator key={item.key} label={item.label} />
                : (
                  <MessageBubble
                    key={item.message.id}
                    message={item.message}
                    isFirst={item.isFirst}
                    isLast={item.isLast}
                    onReply={handleReply}
                    onScrollTo={scrollToMessage}
                    onExpand={(url, type) => setMediaViewer({ url, type })}
                    isDark={isDark}
                  />
                )
            )}

            {showTyping && (
              <div style={{ alignSelf: 'flex-start', marginTop: 4, marginBottom: 4 }}>
                <TypingIndicator isDark={isDark} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {newMessageCount > 0 && <button type="button" onClick={() => { scrollToBottom('smooth'); isNearBottomRef.current = true; setNewMessageCount(0) }} style={{ position: 'absolute', left: '50%', bottom: 82, transform: 'translateX(-50%)', zIndex: 1, border: `1px solid ${isDark ? 'rgba(0,214,107,0.35)' : 'rgba(37,99,235,0.28)'}`, borderRadius: 999, padding: '7px 12px', background: isDark ? '#17251E' : '#FFFFFF', color: isDark ? '#D1FAE5' : '#1D4ED8', boxShadow: '0 6px 20px rgba(0,0,0,0.18)', fontSize: 12, fontWeight: 700, touchAction: 'manipulation' }}>{newMessageCount} new message{newMessageCount === 1 ? '' : 's'}</button>}

          {/* Composer */}
          <div style={{ flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom, 0px)', background: isDark ? 'transparent' : '#FFFFFF', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0'}` }}>
          <Composer
            conversationId={conversation.id}
            replyTo={replyTo}
            onSend={handleSend}
            onClearReply={() => setReplyTo(undefined)}
            isPreview={isPreview}
            isDark={isDark}
          />
          </div>
        </div>
      </div>

      {/* Fullscreen media viewer */}
      {mediaViewer && (
        <FullscreenViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />
      )}
    </>
  ), document.body)
}

// ─── Public Support Chat (exported component) ─────────────────────────────────
export function PublicSupportChat({ eventId, isPreview = false }: { eventId: string; isPreview?: boolean }) {
  const { t } = useTheme()
  const { t: translate } = useLocale()
  const { user } = useAuth()
  const isDark = t.isDark
  const [open, setOpen] = useBookingRecoveryState(`chat:${eventId}:open`, false, value => typeof value === 'boolean')
  const [conversation, setConversation] = useState<SupportConversation | null>(null)
  const [customerEmail, setCustomerEmail] = useBookingRecoveryState(`chat:${eventId}:customerEmail`, isPreview ? user?.email ?? '' : '', value => typeof value === 'string')
  const [emailDraft, setEmailDraft] = useBookingRecoveryState(`chat:${eventId}:emailDraft`, isPreview ? user?.email ?? '' : '', value => typeof value === 'string')
  const [unreadCount, setUnreadCount] = useState(0)
  const [dockOffset, setDockOffset] = useState(0)
  const dockOffsetRef = useRef(0)
  const dockFrameRef = useRef<number | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const { setChatActive } = useSocialProofOverlay()
  useDocumentScrollLock(open)

  useEffect(() => {
    setChatActive(open)
    return () => setChatActive(false)
  }, [open, setChatActive])
  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = emailDraft.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    setCustomerEmail(email)
    void emailService.dispatchAdmin(eventId, {
      kind: 'support_contact',
      subject: 'New Support Contact',
      data: { Customer: email.split('@')[0] || 'Event guest', Email: email, Time: new Date().toLocaleString() },
      deepLink: `${window.location.origin}/admin/chat`,
      actionLabel: 'Open Support Inbox',
    }).catch(() => undefined)
  }

  useEffect(() => {
    if (!isPreview || !user?.email) return
    setCustomerEmail(user.email)
    setEmailDraft(user.email)
  }, [isPreview, user?.email])

  // Sync from store (or use demo data)
  useEffect(() => {
    if (isPreview) {
      setConversation(DEMO_CONVERSATION)
      return
    }
    if (!customerEmail) {
      setConversation(null)
      setUnreadCount(0)
      return
    }
    let active = true
    const sync = () => {
      if (!customerEmail) { setConversation(null); setUnreadCount(0); return }
      const existing = supportStore.list().find(item => item.eventId === eventId && item.email === customerEmail)
      if (!existing) return
      setConversation(existing)
      setUnreadCount(existing.messages.filter(message => message.from === 'admin' && message.status !== 'read').length)
    }
    void supportStore.getOrCreate(eventId, customerEmail, customerEmail.split('@')[0] || 'Event Guest')
      .then(() => { if (active) sync() })
      .catch(() => { if (active) setConversation(null) })
    const unsubscribe = supportStore.subscribe(sync)
    return () => { active = false; unsubscribe() }
  }, [eventId, isPreview, customerEmail])

  useEffect(() => {
    if (isPreview || !conversation?.accessToken) return
    return supportStore.startPublicRealtime(conversation)
  }, [conversation?.id, conversation?.accessToken, isPreview])

  // Listen for programmatic open events
  useEffect(() => {
    const fn = (e: Event) => {
      setOpen(true)
      const ce = e as CustomEvent<{ context?: string }>
      if (ce.detail?.context && !isPreview) {
        const ctx = ce.detail.context
        const msgText = translate('chat.helpContext', { context: ctx })
        setTimeout(() => {
          const c = conversation
          const hasMessage = c?.messages.some(m => m.body === msgText && m.from === 'admin')
          if (c && !hasMessage) supportStore.send(c.id, { body: msgText, from: 'admin' })
        }, 100)
      }
    }
    window.addEventListener('apex-open-support', fn)
    return () => window.removeEventListener('apex-open-support', fn)
  }, [conversation, isPreview])

  // Mark messages read when opened
  useEffect(() => {
    if (open && conversation && !isPreview) {
      supportStore.markRead(conversation.id)
      setUnreadCount(0)
    }
  }, [open, conversation?.id, isPreview])

  // ── Footer docking via IntersectionObserver ────────────────────────────────
  useEffect(() => {
    const footer = document.getElementById('footer')
    if (!footer) return

    const setDockOffsetIfChanged = (nextOffset: number) => {
      if (dockOffsetRef.current === nextOffset) return
      dockOffsetRef.current = nextOffset
      setDockOffset(nextOffset)
    }
    const updateDock = () => {
      const footerRect = footer.getBoundingClientRect()
      const vh = window.innerHeight
      const btnHeight = 56
      const gap = 16
      const baseBottom = 100 // matches CSS .chat-btn bottom: 100px

      if (footerRect.top < vh) {
        // Footer is visible: compute how far button needs to move up
        const visibleFooterTop = Math.max(0, footerRect.top)
        // Offset = distance from button's natural bottom to footer top
        const naturalBtnTop = vh - baseBottom - btnHeight
        const targetBtnTop = visibleFooterTop - gap - btnHeight
        const offset = Math.min(0, targetBtnTop - naturalBtnTop) // negative = up
        setDockOffsetIfChanged(offset)
      } else {
        setDockOffsetIfChanged(0)
      }
    }
    const scheduleDockUpdate = () => {
      if (dockFrameRef.current !== null) return
      dockFrameRef.current = requestAnimationFrame(() => {
        dockFrameRef.current = null
        updateDock()
      })
    }

    // Use both IntersectionObserver (trigger) + scroll (smooth tracking)
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        scheduleDockUpdate()
        window.addEventListener('scroll', scheduleDockUpdate, { passive: true })
      } else {
        setDockOffsetIfChanged(0)
        window.removeEventListener('scroll', scheduleDockUpdate)
      }
    }, { threshold: 0, rootMargin: '0px 0px -56px 0px' })

    observer.observe(footer)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', scheduleDockUpdate)
      if (dockFrameRef.current !== null) cancelAnimationFrame(dockFrameRef.current)
      dockFrameRef.current = null
    }
  }, [])

  const handleSend = useCallback((payload: { type?: MessageType; body: string; attachment?: AttachmentMeta; replyTo?: ReplyRef }) => {
    if (isPreview || !conversation) return
    supportStore.send(conversation.id, { ...payload, from: 'customer' })
  }, [conversation?.id, isPreview])

  return (
    <>
      {/* Floating button — hide it while its chat window is open. */}
      {!open && <button
        ref={btnRef}
        onClick={() => setOpen(true)}
        aria-label={translate('chat.open')}
        className={`chat-btn${isDark ? '' : ' chat-btn-light'}`}
        style={{
          transform: `translateY(${dockOffset}px)`,
        }}
      >
        {/* Subtle pulse ring — Apple style */}
        <span style={{
          position: 'absolute',
          inset: -2,
          borderRadius: '50%',
          border: `2px solid ${isDark ? E.primary : B.primary}`,
          animation: 'pulse-ring 3s ease-out infinite',
          opacity: 0.18,
          pointerEvents: 'none',
        }} />
        <svg viewBox="0 0 24 24" fill="none" stroke={isDark ? E.dark : B.primary} strokeWidth="2.2" width="24" height="24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', border: `2px solid ${isDark ? '#09090B' : '#FFFFFF'}` }}>
            {unreadCount}
          </span>
        )}
      </button>}

      {open && !isPreview && !customerEmail && createPortal(
        <div className="public-prechat-shell fixed inset-0 z-[10010] grid place-items-center bg-black/60 backdrop-blur-sm">
          <form onSubmit={submitEmail} className="support-email-card w-full max-w-sm rounded-3xl p-6 shadow-2xl" style={{ background: isDark ? '#111113' : '#FFFFFF', border: `1px solid ${isDark ? 'rgba(255,255,255,.1)' : '#E1E5EA'}`, touchAction: 'manipulation' }}>
            <div className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: isDark ? 'rgba(0,255,136,.12)' : 'rgba(21,94,239,.1)', color: isDark ? '#00FF88' : '#155EEF' }}>?</div>
            <h2 className="mt-4 font-serif text-2xl font-bold" style={{ color: isDark ? '#FAFAFA' : '#171A1F' }}>{translate('chat.welcome')}</h2>
            <p className="mt-2 text-sm" style={{ color: isDark ? '#A1A1AA' : '#5F6773' }}>{translate('chat.emailPrompt')}</p>
            <label className="mt-5 block text-xs font-mono uppercase tracking-wider" style={{ color: isDark ? '#A1A1AA' : '#87909D' }}>{translate('chat.email')}<input type="email" required value={emailDraft} onChange={event => setEmailDraft(event.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-xl px-4 py-3 text-sm outline-none" style={{ background: isDark ? 'rgba(255,255,255,.05)' : '#FAFBFC', border: `1px solid ${isDark ? 'rgba(255,255,255,.1)' : '#E1E5EA'}`, color: isDark ? '#FAFAFA' : '#171A1F', fontSize: 16, touchAction: 'manipulation' }}/></label>
            <div className="mt-5 flex gap-3"><button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: isDark ? 'rgba(255,255,255,.06)' : '#F1F3F5', color: isDark ? '#FAFAFA' : '#171A1F', touchAction: 'manipulation' }}>{translate('common.cancel')}</button><button type="submit" className="flex-1 rounded-xl px-4 py-3 text-sm font-bold" style={{ background: isDark ? '#00FF88' : '#155EEF', color: isDark ? '#09090B' : '#FFFFFF', touchAction: 'manipulation' }}>{translate('chat.continue')}</button></div>
          </form>
        </div>, document.body
      )}

      {/* Chat window */}
      {open && conversation && (
        <ChatWindow
          conversation={isPreview ? { ...DEMO_CONVERSATION } : conversation}
          onClose={() => setOpen(false)}
          isPreview={isPreview}
          onSend={handleSend}
          isDark={isDark}
        />
      )}
    </>
  )
}
