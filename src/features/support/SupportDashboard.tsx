import { useCallback, useEffect, useRef, useState } from 'react'
import { supportStore, type AttachmentMeta, type MessageType, type ReplyRef, type SupportConversation, type SupportMessage, type SupportStatus } from './supportStore'
import { emailService } from '../email/emailService'
import { useAdminRecoveryState } from '../recovery/AdminSessionRecoveryProvider'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { softDeleteAdminRecord } from '../admin/adminDeletionService'

// ─── Premium emerald palette ──────────────────────────────────────────────────
const EA = {
  primary:    '#00D66B',
  hover:      '#00C462',
  darkEm:     '#009C4D',
  highlight:  '#39F28F',
  glow8:      'rgba(0,214,107,0.08)',
  glow15:     'rgba(0,214,107,0.15)',
  glow25:     'rgba(0,214,107,0.25)',
  border:     'rgba(0,214,107,0.22)',
  gradient:   'linear-gradient(135deg,#00D66B,#00C462)',
  dark:       '#09090B',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMin / 60)
  const diffD = Math.floor(diffH / 24)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffH < 24) return `${diffH}h ago`
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtFull(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDateSep(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function extIcon(mime: string) {
  if (mime.includes('pdf')) return '📄'
  if (mime.includes('word') || mime.includes('doc')) return '📝'
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return '📊'
  if (mime.includes('zip') || mime.includes('rar')) return '🗜️'
  if (mime.includes('audio')) return '🎵'
  return '📎'
}

const EMOJIS = ['😀','😂','🥰','😍','🤩','😎','🥳','🤔','😅','😭','❤️','🔥','✅','🎉','👍','👋','🙏','💪','⭐','🎟️','🎵','📎','🔗','💬','✨','🚀','💡','📱','💳','🎫']

const STATUS_COLORS: Record<SupportStatus, string> = {
  open:     EA.primary,
  pending:  '#F59E0B',
  resolved: '#71717A',
  closed:   '#3F3F46',
}

const STATUS_LABELS: Record<SupportStatus, string> = {
  open:     'Open',
  pending:  'Pending',
  resolved: 'Resolved',
  closed:   'Closed',
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, color, size = 40 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color ? `linear-gradient(135deg,${color},${color}99)` : EA.gradient,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.35, color: '#09090B', flexShrink: 0,
      boxShadow: `0 0 0 2px ${EA.border}`,
    }}>
      {initials}
    </div>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: 'rgba(255,255,255,0.07)', borderRadius: '18px 18px 18px 4px', width: 58, border: '1px solid rgba(255,255,255,0.07)' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#52525B', animation: `typing-bounce 1.2s ${i * 0.2}s ease-in-out infinite` }} />
      ))}
    </div>
  )
}

// ─── Reply strip ──────────────────────────────────────────────────────────────
function ReplyStrip({ replyTo, onCancel }: { replyTo: ReplyRef; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: EA.glow8 }}>
      <div style={{ flex: 1, borderLeft: `3px solid ${EA.primary}`, paddingLeft: 10 }}>
        <div style={{ fontSize: 11, color: EA.primary, fontWeight: 700, marginBottom: 1 }}>
          Replying to {replyTo.from === 'customer' ? 'Customer' : 'yourself'}
        </div>
        <div style={{ fontSize: 12, color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {replyTo.body.slice(0, 80)}
        </div>
      </div>
      <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717A', cursor: 'pointer', fontSize: 12 }}>✕</button>
    </div>
  )
}

// ─── Status ticks ─────────────────────────────────────────────────────────────
function StatusTick({ status }: { status: SupportMessage['status'] }) {
  if (status === 'sending') return <span style={{ fontSize: 10, color: '#71717A' }}>⏳</span>
  if (status === 'failed') return <span style={{ fontSize: 10, color: '#EF4444' }}>⚠</span>
  const color = status === 'read' ? EA.primary : '#71717A'
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
      <path d="M1 5l3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {(status === 'delivered' || status === 'read') && (
        <path d="M6 5l3 3 6-7" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

// ─── Voice note player ────────────────────────────────────────────────────────
function VoiceNotePlayer({ attachment, isAdmin }: { attachment: AttachmentMeta; isAdmin: boolean }) {
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(1)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const toggle = () => {
    if (!attachment.url) return
    if (!audioRef.current) {
      audioRef.current = new Audio(attachment.url)
      audioRef.current.playbackRate = speed
      audioRef.current.ontimeupdate = () => {
        const el = audioRef.current!
        setProgress(el.duration ? el.currentTime / el.duration : 0)
      }
      audioRef.current.onended = () => { setPlaying(false); setProgress(0) }
    }
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { void audioRef.current.play(); setPlaying(true) }
  }

  const cycleSpeed = () => {
    const speeds = [1, 1.5, 2]
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length]
    setSpeed(next)
    if (audioRef.current) audioRef.current.playbackRate = next
  }

  const dur = attachment.duration ?? 0
  const durStr = `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`
  const bubbleColor = isAdmin ? EA.dark : '#FAFAFA'
  const barActive = isAdmin ? 'rgba(9,9,11,0.5)' : EA.primary
  const barInactive = isAdmin ? 'rgba(9,9,11,0.25)' : 'rgba(255,255,255,0.2)'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, padding: '2px 0' }}>
      <button onClick={toggle} style={{
        width: 38, height: 38, borderRadius: '50%',
        background: isAdmin ? 'rgba(9,9,11,0.25)' : EA.gradient,
        border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: isAdmin ? 'none' : `0 2px 8px ${EA.glow25}`,
      }}>
        {playing
          ? <svg viewBox="0 0 24 24" fill={isAdmin ? EA.dark : '#fff'} width="14" height="14"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
          : <svg viewBox="0 0 24 24" fill={isAdmin ? EA.dark : '#fff'} width="14" height="14"><path d="M5 3l14 9-14 9V3z" /></svg>
        }
      </button>

      {/* Waveform */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1.5, height: 28, cursor: 'pointer' }} onClick={toggle}>
        {Array.from({ length: 28 }, (_, i) => {
          const h = 5 + Math.sin(i * 0.85) * 8 + Math.cos(i * 1.6) * 4
          const filled = i / 28 <= progress
          return <div key={i} style={{ width: 2.5, borderRadius: 2, background: filled ? barActive : barInactive, height: Math.max(4, h), transition: 'background 0.1s' }} />
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span style={{ fontSize: 10, color: bubbleColor, opacity: 0.7, fontVariantNumeric: 'tabular-nums' }}>{durStr}</span>
        <button onClick={cycleSpeed} style={{ fontSize: 9, color: bubbleColor, opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }}>{speed}×</button>
      </div>
    </div>
  )
}

// ─── Media renderer — natural aspect ratio ────────────────────────────────────
function MediaImage({ attachment, onExpand, isAdmin }: { attachment: AttachmentMeta; onExpand: (url: string, type: 'image' | 'video') => void; isAdmin: boolean }) {
  const [loaded, setLoaded] = useState(false)
  const aspect = attachment.width && attachment.height ? attachment.height / attachment.width : undefined
  return (
    <button
      onClick={() => onExpand(attachment.url, 'image')}
      style={{
        border: 'none', padding: 0, cursor: 'pointer', display: 'block',
        width: '100%', maxWidth: 280, borderRadius: 12, overflow: 'hidden',
        aspectRatio: aspect ? `1 / ${aspect}` : undefined,
        background: loaded ? 'transparent' : 'rgba(255,255,255,0.06)',
      } as React.CSSProperties}
    >
      <img
        src={attachment.url}
        alt={attachment.name}
        onLoad={() => setLoaded(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: 12 }}
      />
    </button>
  )
}

function MediaVideo({ attachment, onExpand }: { attachment: AttachmentMeta; onExpand: (url: string, type: 'image' | 'video') => void }) {
  return (
    <button
      onClick={() => onExpand(attachment.url, 'video')}
      style={{ position: 'relative', display: 'block', width: '100%', maxWidth: 280, background: '#000', borderRadius: 12, overflow: 'hidden', border: 'none', cursor: 'pointer', aspectRatio: '16/9' }}
    >
      <video src={attachment.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.35)' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(255,255,255,0.3)' }}>
          <svg viewBox="0 0 24 24" fill="white" width="20" height="20"><path d="M5 3l14 9-14 9V3z" /></svg>
        </div>
      </div>
    </button>
  )
}

function DocCard({ attachment, isAdmin }: { attachment: AttachmentMeta; isAdmin: boolean }) {
  const textColor = isAdmin ? EA.dark : '#FAFAFA'
  const mutedColor = isAdmin ? 'rgba(9,9,11,0.55)' : '#71717A'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', minWidth: 220 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, background: isAdmin ? 'rgba(9,9,11,0.18)' : 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
      }}>
        {extIcon(attachment.mimeType)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: textColor }}>{attachment.name}</div>
        <div style={{ fontSize: 11, color: mutedColor, marginTop: 1 }}>{fmtBytes(attachment.size)}</div>
      </div>
      <a
        href={attachment.url} download={attachment.name} target="_blank" rel="noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, background: isAdmin ? 'rgba(9,9,11,0.2)' : EA.glow15, border: `1px solid ${isAdmin ? 'rgba(9,9,11,0.25)' : EA.border}`, color: isAdmin ? EA.dark : EA.primary, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
      >↓</a>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  message,
  onReply,
  onExpand,
  onDelete,
}: {
  message: SupportMessage
  onReply: (m: SupportMessage) => void
  onExpand: (url: string, type: 'image' | 'video') => void
  onDelete?: (m: SupportMessage) => void
}) {
  const isAdmin = message.from === 'admin'
  const [hovered, setHovered] = useState(false)

  const isMedia = message.type === 'image' || message.type === 'video'
  const padStyle = isMedia ? '4px' : '10px 14px'

  return (
    <div
      id={`adm-msg-${message.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', flexDirection: isAdmin ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2, position: 'relative' }}
    >
      {/* Reply button on hover */}
      {hovered && (
        <div style={{ position: 'absolute', [isAdmin ? 'left' : 'right']: -62, bottom: 8, display: 'flex', gap: 4 }}><button
          onClick={() => onReply(message)}
          title="Reply"
          style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#A1A1AA', fontSize: 13,
          }}
        >↩</button>{onDelete && <button onClick={() => onDelete(message)} title="Delete message" style={{ background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '50%', width: 26, height: 26, color: '#F87171', cursor: 'pointer' }}>×</button>}</div>
      )}

      {/* Bubble */}
      <div style={{
        maxWidth: 'min(72%, 340px)',
        borderRadius: isAdmin ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
        padding: padStyle,
        background: isAdmin ? EA.gradient : 'rgba(255,255,255,0.08)',
        color: isAdmin ? EA.dark : '#FAFAFA',
        fontSize: 13, lineHeight: 1.55,
        border: isAdmin ? 'none' : '1px solid rgba(255,255,255,0.08)',
        boxShadow: isAdmin ? `0 4px 16px ${EA.glow15}` : '0 2px 8px rgba(0,0,0,0.25)',
      }}>
        {/* Reply preview */}
        {message.replyTo && (
          <button
            onClick={() => {
              document.getElementById(`adm-msg-${message.replyTo!.messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: isAdmin ? 'rgba(9,9,11,0.15)' : EA.glow8,
              borderRadius: 10, padding: '6px 10px', marginBottom: 8, cursor: 'pointer',
              border: '0 solid', borderLeftWidth: 3, borderLeftColor: isAdmin ? 'rgba(9,9,11,0.4)' : EA.primary,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 2, opacity: 0.75 }}>
              {message.replyTo.from === 'customer' ? 'Customer' : 'You'}
            </div>
            <div style={{ fontSize: 11, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {message.replyTo.body}
            </div>
          </button>
        )}

        {/* Content */}
        {message.type === 'text' && <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.body}</span>}
        {message.type === 'image' && message.attachment && <MediaImage attachment={message.attachment} onExpand={onExpand} isAdmin={isAdmin} />}
        {message.type === 'video' && message.attachment && <MediaVideo attachment={message.attachment} onExpand={onExpand} />}
        {message.type === 'voice' && message.attachment && <VoiceNotePlayer attachment={message.attachment} isAdmin={isAdmin} />}
        {message.type === 'audio' && message.attachment && (
          <audio controls style={{ width: '100%', maxWidth: 220, height: 36 }} src={message.attachment.url} />
        )}
        {message.type === 'document' && message.attachment && <DocCard attachment={message.attachment} isAdmin={isAdmin} />}

        {/* Timestamp + tick */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: isMedia ? 4 : 5, opacity: 0.7 }}>
          <span style={{ fontSize: 10 }}>{fmtFull(message.createdAt)}</span>
          {isAdmin && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  )
}

// ─── Date separator ───────────────────────────────────────────────────────────
function DateSep({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0 8px', userSelect: 'none' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{ fontSize: 11, color: '#52525B', background: '#111113', padding: '3px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

// ─── Fullscreen media viewer ──────────────────────────────────────────────────
function FullscreenViewer({ url, type, onClose }: { url: string; type: 'image' | 'video'; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.97)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fade-in-up 0.2s ease' }}>
      <button onClick={onClose} style={{ position: 'absolute', top: 18, right: 18, background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: 18, backdropFilter: 'blur(8px)' }}>✕</button>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: '90vw', maxHeight: '90vh' }}>
        {type === 'image'
          ? <img src={url} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 16 }} />
          : <video src={url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 16 }} />}
      </div>
      <a href={url} download onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 24, right: 24, background: EA.gradient, padding: '10px 20px', borderRadius: 24, color: EA.dark, fontSize: 12, fontWeight: 700, textDecoration: 'none', boxShadow: `0 4px 16px ${EA.glow25}` }}>↓ Download</a>
    </div>
  )
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }: { onSelect: (e: string) => void; onClose: () => void }) {
  return (
    <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 10, background: '#16161A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 12, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, zIndex: 50, boxShadow: '0 16px 48px rgba(0,0,0,0.7)', animation: 'slide-up 0.15s ease', backdropFilter: 'blur(12px)' }}>
      {EMOJIS.map(em => (
        <button key={em} onClick={() => onSelect(em)} style={{ background: 'none', border: 'none', fontSize: 19, cursor: 'pointer', borderRadius: 8, padding: 4, lineHeight: 1 }}>{em}</button>
      ))}
      <button onClick={onClose} style={{ gridColumn: '1 / -1', background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, padding: '4px 6px', color: '#71717A', fontSize: 10, cursor: 'pointer' }}>Close</button>
    </div>
  )
}

// ─── Admin composer ───────────────────────────────────────────────────────────
function AdminComposer({
  conversationId,
  replyTo,
  onSend,
  onClearReply,
}: {
  conversationId: string
  replyTo: ReplyRef | undefined
  onSend: (payload: { type: MessageType; body: string; attachment?: AttachmentMeta; replyTo?: ReplyRef }) => void
  onClearReply: () => void
}) {
  const [text, setText] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<AttachmentMeta[]>([])
  const [focused, setFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Silence unused variable warning
  void conversationId

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [text])

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
    if (body) onSend({ type: 'text', body, replyTo })
    setText('')
    onClearReply()
  }, [text, pendingFiles, replyTo, onSend, onClearReply])

  const handleFile = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      const url = URL.createObjectURL(file)
      setPendingFiles(prev => [...prev, { name: file.name, size: file.size, mimeType: file.type, url }])
    }
  }

  const canSend = text.trim().length > 0 || pendingFiles.length > 0

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#0D0D0F', flexShrink: 0 }}>
      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          {pendingFiles.map((f, i) => (
            <div key={i} style={{ position: 'relative', background: 'rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              {f.mimeType.startsWith('image/')
                ? <img src={f.url} alt={f.name} style={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }} />
                : <div style={{ width: 56, height: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    <span style={{ fontSize: 20 }}>{extIcon(f.mimeType)}</span>
                    <span style={{ fontSize: 8, color: '#A1A1AA', padding: '0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 50 }}>{f.name}</span>
                  </div>}
              <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.75)', border: 'none', borderRadius: '50%', width: 16, height: 16, fontSize: 9, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {replyTo && <ReplyStrip replyTo={replyTo} onCancel={onClearReply} />}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 14px', position: 'relative' }}>
        {/* Emoji */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {showEmoji && <EmojiPicker onSelect={e => { setText(t => t + e); setShowEmoji(false) }} onClose={() => setShowEmoji(false)} />}
          <button onClick={() => setShowEmoji(v => !v)} style={{ width: 36, height: 36, background: showEmoji ? EA.glow15 : 'rgba(255,255,255,0.06)', border: `1px solid ${showEmoji ? EA.border : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>😊</button>
        </div>

        {/* Attachment */}
        <label style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" width="16" height="16"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <input type="file" hidden multiple accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={e => void handleFile(e.target.files)} />
        </label>

        {/* Textarea */}
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Reply to customer… (Ctrl+Enter to send)"
            rows={1}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)',
              border: `1px solid ${focused ? EA.border : 'rgba(255,255,255,0.09)'}`,
              borderRadius: 14, padding: '10px 14px', color: '#FAFAFA', fontSize: 13,
              outline: 'none', resize: 'none', lineHeight: 1.5, overflow: 'auto',
              boxSizing: 'border-box', fontFamily: 'inherit',
              transition: 'border-color 0.2s',
              boxShadow: focused ? `0 0 0 2px ${EA.glow15}` : 'none',
            }}
          />
        </div>

        {/* Send */}
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            width: 40, height: 40, background: canSend ? EA.gradient : 'rgba(255,255,255,0.06)',
            border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: canSend ? 'pointer' : 'default', flexShrink: 0,
            transition: 'all 0.2s', boxShadow: canSend ? `0 4px 14px ${EA.glow25}` : 'none',
            transform: canSend ? 'scale(1)' : 'scale(0.95)',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke={canSend ? EA.dark : '#52525B'} strokeWidth="2.5" width="16" height="16"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </div>
  )
}

// ─── Conversation list row ─────────────────────────────────────────────────────
function ConversationRow({ conversation, selected, onClick }: { conversation: SupportConversation; selected: boolean; onClick: () => void }) {
  const lastMsg = conversation.messages.filter(m => !m.internal).at(-1)
  const preview = lastMsg
    ? lastMsg.type === 'image' ? '📷 Photo'
      : lastMsg.type === 'video' ? '🎬 Video'
        : lastMsg.type === 'voice' ? '🎤 Voice note'
          : lastMsg.type === 'audio' ? '🎵 Audio'
            : lastMsg.type === 'document' ? `📎 ${lastMsg.attachment?.name ?? 'Document'}`
              : lastMsg.body.slice(0, 55)
    : 'No messages yet'

  const unread = conversation.unread ?? 0

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        background: selected ? EA.glow8 : 'transparent',
        borderLeft: selected ? `3px solid ${EA.primary}` : '3px solid transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Avatar with status dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar name={conversation.customer} color={conversation.avatarColor} size={46} />
        <span style={{
          position: 'absolute', bottom: 1, right: 1, width: 12, height: 12, borderRadius: '50%',
          background: STATUS_COLORS[conversation.status], border: '2px solid #0A0A0C',
        }} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: '#FAFAFA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversation.customer}
          </span>
          <span style={{ fontSize: 10, color: '#52525B', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(conversation.updatedAt)}
          </span>
        </div>
        {conversation.eventName && (
          <div style={{ fontSize: 11, color: EA.primary, opacity: 0.75, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversation.eventName}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <span style={{ fontSize: 12, color: unread > 0 ? '#D4D4D8' : '#52525B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontWeight: unread > 0 ? 600 : 400 }}>
            {preview}
          </span>
          {unread > 0 && (
            <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
              {unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ─── Customer info panel ──────────────────────────────────────────────────────
function CustomerInfoPanel({ conversation, onUpdate }: { conversation: SupportConversation; onUpdate: (c: SupportConversation) => void }) {
  return (
    <aside style={{ width: 256, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', background: '#0D0D0F', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Customer Info</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16, gap: 8 }}>
          <Avatar name={conversation.customer} color={conversation.avatarColor} size={54} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#FAFAFA' }}>{conversation.customer}</div>
            <div style={{ fontSize: 11, color: '#71717A', marginTop: 2 }}>{conversation.email}</div>
          </div>
        </div>

        {/* Status badge */}
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <span style={{ background: STATUS_COLORS[conversation.status] + '22', color: STATUS_COLORS[conversation.status], border: `1px solid ${STATUS_COLORS[conversation.status]}44`, borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700 }}>
            {STATUS_LABELS[conversation.status]}
          </span>
        </div>

        {/* Info rows */}
        {[
          { label: 'Booking Ref', value: conversation.bookingRef ?? '—' },
          { label: 'Event', value: conversation.eventName ?? '—' },
          { label: 'Package', value: conversation.packageName ?? '—' },
          { label: 'Seat', value: conversation.seatNumber ?? '—' },
          { label: 'Payment', value: conversation.paymentStatus ?? '—' },
          { label: 'Created', value: new Date(conversation.createdAt).toLocaleDateString() },
          { label: 'Last Active', value: fmtTime(conversation.lastActivity) },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 }}>
            <span style={{ fontSize: 11, color: '#52525B', flexShrink: 0 }}>{row.label}</span>
            <span style={{ fontSize: 12, color: '#A1A1AA', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
          </div>
        ))}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '12px 0' }} />

        {/* Status actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 14 }}>
          {(['open', 'pending', 'resolved', 'closed'] as SupportStatus[]).map(s => (
            <button
              key={s}
              onClick={() => onUpdate({ ...conversation, status: s })}
              style={{
                background: conversation.status === s ? STATUS_COLORS[s] + '22' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${conversation.status === s ? STATUS_COLORS[s] + '44' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 10, padding: '7px 12px',
                color: conversation.status === s ? STATUS_COLORS[s] : '#71717A',
                fontSize: 12, cursor: 'pointer', textAlign: 'left',
                fontWeight: conversation.status === s ? 700 : 400, transition: 'all 0.15s',
              }}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '12px 0' }} />

        {/* Internal notes */}
        <div style={{ fontSize: 11, color: '#52525B', marginBottom: 6, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Internal Notes</div>
        <textarea
          value={conversation.notes}
          onChange={e => onUpdate({ ...conversation, notes: e.target.value })}
          placeholder="Add private notes…"
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 10, color: '#FAFAFA', fontSize: 12, outline: 'none', resize: 'none', minHeight: 80, fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }}
        />
      </div>
    </aside>
  )
}

// ─── Conversation panel ───────────────────────────────────────────────────────
function ConversationPanel({
  conversation,
  onUpdate,
  onBack,
  isMobile,
  onDelete,
  onDeleteMessage,
}: {
  conversation: SupportConversation
  onUpdate: (c: SupportConversation) => void
  onBack?: () => void
  isMobile?: boolean
  onDelete?: () => void
  onDeleteMessage?: (message: SupportMessage) => void
}) {
  const [replyTo, setReplyTo] = useState<ReplyRef | undefined>()
  const [showTyping, setShowTyping] = useState(false)
  const [mediaViewer, setMediaViewer] = useState<{ url: string; type: 'image' | 'video' } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // silence unused warning
  void setShowTyping

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation.messages.length])

  const handleSend = useCallback((payload: { type: MessageType; body: string; attachment?: AttachmentMeta; replyTo?: ReplyRef }) => {
    supportStore.send(conversation.id, { ...payload, from: 'admin' })
    emailService.dispatch({ kind: 'support_reply', to: conversation.email, subject: 'Support replied to your message', data: { Preview: payload.body.slice(0, 140) || 'A support reply is ready.' }, deepLink: `${window.location.origin}/events/${conversation.eventId}` })
    setReplyTo(undefined)
  }, [conversation.id])

  const visibleMessages = conversation.messages.filter(m => !m.internal)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#111113', minWidth: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        background: 'rgba(17,17,19,0.92)', backdropFilter: 'blur(12px)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.04)',
      }}>
        {/* Back button (mobile only) */}
        {isMobile && onBack && (
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: EA.primary, cursor: 'pointer', padding: '4px 6px 4px 0', fontSize: 20, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
            ‹
          </button>
        )}

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar name={conversation.customer} color={conversation.avatarColor} size={40} />
          <span style={{
            position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: '50%',
            background: STATUS_COLORS[conversation.status], border: '2px solid #111113',
          }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#FAFAFA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversation.customer}
          </div>
          <div style={{ fontSize: 11, color: STATUS_COLORS[conversation.status], display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLORS[conversation.status], display: 'inline-block', animation: conversation.status === 'open' ? 'pulse-ring 2s ease-in-out infinite' : 'none' }} />
            {STATUS_LABELS[conversation.status]}
            {conversation.eventName && <span style={{ color: '#52525B' }}> · {conversation.eventName}</span>}
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {(['resolved', 'closed'] as SupportStatus[]).map(s => (
            <button
              key={s}
              onClick={() => onUpdate({ ...conversation, status: s })}
              style={{
                background: s === 'resolved' ? EA.glow8 : 'rgba(239,68,68,0.08)',
                border: `1px solid ${s === 'resolved' ? EA.border : 'rgba(239,68,68,0.2)'}`,
                borderRadius: 10, padding: isMobile ? '5px 8px' : '6px 12px',
                color: s === 'resolved' ? EA.primary : '#EF4444',
                fontSize: isMobile ? 11 : 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {s === 'resolved' ? '✓' : '✕'}{!isMobile && ` ${s === 'resolved' ? 'Resolve' : 'Close'}`}
            </button>
          ))}
          {onDelete && <button onClick={onDelete} aria-label="Delete conversation" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: isMobile ? '5px 8px' : '6px 12px', color: '#EF4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>🗑{!isMobile && ' Delete'}</button>}
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visibleMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#3F3F46', fontSize: 13, marginTop: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
            <div>No messages yet. Waiting for the customer…</div>
          </div>
        )}

        {visibleMessages.map((msg, idx) => {
          const prev = visibleMessages[idx - 1]
          const showSep = !prev || !isSameDay(prev.createdAt, msg.createdAt)
          return (
            <div key={msg.id}>
              {showSep && <DateSep label={fmtDateSep(msg.createdAt)} />}
              <MessageBubble
                message={msg}
                onReply={m => setReplyTo({ messageId: m.id, body: m.body, from: m.from, type: m.type, attachmentUrl: m.attachment?.url })}
                onExpand={(url, type) => setMediaViewer({ url, type })}
                onDelete={onDeleteMessage}
              />
            </div>
          )
        })}

        {showTyping && (
          <div style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <TypingIndicator />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <AdminComposer
        conversationId={conversation.id}
        replyTo={replyTo}
        onSend={handleSend}
        onClearReply={() => setReplyTo(undefined)}
      />

      {mediaViewer && <FullscreenViewer url={mediaViewer.url} type={mediaViewer.type} onClose={() => setMediaViewer(null)} />}
    </div>
  )
}

// ─── Main SupportDashboard ────────────────────────────────────────────────────
export function SupportDashboard() {
  const { role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState<SupportConversation[]>(() => supportStore.list())
  const [selectedId, setSelectedId] = useAdminRecoveryState<string | null>('chat.selectedConversationId', null, value => value === null || typeof value === 'string')
  const [filter, setFilter] = useAdminRecoveryState<SupportStatus | 'all'>('chat.filter', 'all', (value): value is SupportStatus | 'all' => typeof value === 'string' && ['all','open','pending','resolved','closed'].includes(value))
  const [search, setSearch] = useAdminRecoveryState('chat.search', '', value => typeof value === 'string')
  // Mobile view: 'list' | 'conversation'
  const [mobileView, setMobileView] = useAdminRecoveryState<'list' | 'conversation'>('chat.mobileView', 'list', value => value === 'list' || value === 'conversation')
  const [isMobile, setIsMobile] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check, { passive: true })
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => supportStore.subscribe(() => setConversations(supportStore.list())), [])

  useEffect(() => {
    const routeId = location.pathname.startsWith('/admin/chat/') ? decodeURIComponent(location.pathname.slice('/admin/chat/'.length)) : null
    if (routeId && routeId !== selectedId) {
      setSelectedId(routeId)
      if (window.innerWidth < 768) setMobileView('conversation')
    }
  }, [location.pathname, selectedId, setMobileView, setSelectedId])

  useEffect(() => {
    if (selectedId) supportStore.markRead(selectedId)
  }, [selectedId])

  const visible = conversations.filter(c =>
    (filter === 'all' || c.status === filter) &&
    `${c.customer} ${c.email} ${c.bookingRef ?? ''} ${c.eventName ?? ''}`.toLowerCase().includes(search.toLowerCase())
  )

  const selected = conversations.find(c => c.id === (selectedId ?? visible[0]?.id))

  const handleSelect = (id: string) => {
    setSelectedId(id)
    supportStore.markRead(id)
    if (isMobile) setMobileView('conversation')
    navigate(`/admin/chat/${encodeURIComponent(id)}`)
  }

  const handleUpdate = (next: SupportConversation) => {
    supportStore.update(next)
  }
  const deleteConversation = async () => {
    if (!selected || deleting || (role !== 'owner' && role !== 'admin')) return
    setDeleting(true)
    try {
      await softDeleteAdminRecord('conversation', selected.id)
      await supportStore.hydrate()
      setSelectedId(null); setMobileView('list'); navigate('/admin/chat')
    } finally { setDeleting(false) }
  }
  const deleteMessage = async (message: SupportMessage) => {
    if ((role !== 'owner' && role !== 'admin') || !window.confirm(`Delete this ${message.from} message?\n\nOnly the selected message will be removed.`)) return
    try { await softDeleteAdminRecord('message', message.id); await supportStore.hydrate() }
    catch (error) { window.alert(error instanceof Error ? error.message : 'The message could not be deleted.') }
  }
  const requestDelete = () => {
    if (!selected) return
    if (window.confirm(`Delete the conversation with ${selected.customer} (${selected.email})?\n\nThe conversation and its messages will be removed from normal dashboards. The customer, event, and booking will remain intact.`)) void deleteConversation()
  }

  const filters: Array<SupportStatus | 'all'> = ['all', 'open', 'pending', 'resolved', 'closed']

  // ── Sidebar (conversation list) ────────────────────────────────────────────
  const Sidebar = (
    <div style={{
      width: isMobile ? '100%' : 300, flexShrink: 0,
      borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column',
      background: '#0A0A0C',
      height: '100%',
    }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontWeight: 800, fontSize: 18, color: '#FAFAFA', margin: 0 }}>Support</h2>
          <span style={{ fontSize: 11, color: '#52525B', background: 'rgba(255,255,255,0.05)', padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.07)' }}>
            {conversations.filter(c => c.status === 'open').length} open
          </span>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#52525B" strokeWidth="2" width="14" height="14" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '9px 10px 9px 32px', color: '#FAFAFA', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                background: filter === f ? EA.primary : 'rgba(255,255,255,0.05)',
                color: filter === f ? EA.dark : '#71717A',
                border: filter === f ? 'none' : '1px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: '4px 10px', fontSize: 11,
                fontWeight: filter === f ? 700 : 400,
                cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s',
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: '#52525B', fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            No conversations match this filter.
          </div>
        ) : (
          visible.map(c => (
            <ConversationRow
              key={c.id}
              conversation={c}
              selected={!isMobile && selected?.id === c.id}
              onClick={() => handleSelect(c.id)}
            />
          ))
        )}
      </div>
    </div>
  )

  // ── Mobile layout ──────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: 'flex', height: 'calc(100vh - 9rem)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden', background: '#0D0D0F' }}>
        {mobileView === 'list' ? (
          Sidebar
        ) : selected ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%' }}>
            <ConversationPanel
              conversation={selected}
              onUpdate={handleUpdate}
              onDelete={role === 'owner' || role === 'admin' ? requestDelete : undefined}
              onDeleteMessage={role === 'owner' || role === 'admin' ? deleteMessage : undefined}
              onBack={() => { setMobileView('list'); setSelectedId(null); navigate('/admin/chat') }}
              isMobile
            />
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#52525B' }}>
            <div style={{ fontSize: 32 }}>💬</div>
            <button onClick={() => { setMobileView('list'); setSelectedId(null); navigate('/admin/chat') }} style={{ background: EA.glow15, border: `1px solid ${EA.border}`, borderRadius: 12, padding: '10px 20px', color: EA.primary, fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              View Conversations
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Desktop / Tablet layout ────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 9rem)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden', background: '#0D0D0F' }}>
      {Sidebar}

      {selected ? (
        <>
          <ConversationPanel conversation={selected} onUpdate={handleUpdate} onDelete={role === 'owner' || role === 'admin' ? requestDelete : undefined} onDeleteMessage={role === 'owner' || role === 'admin' ? deleteMessage : undefined} />
          <CustomerInfoPanel conversation={selected} onUpdate={handleUpdate} />
        </>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#52525B', gap: 14 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, border: '1px solid rgba(255,255,255,0.06)' }}>💬</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3F3F46' }}>Select a conversation</div>
          <div style={{ fontSize: 12, color: '#27272A' }}>Customer messages will appear here</div>
        </div>
      )}
    </div>
  )
}
