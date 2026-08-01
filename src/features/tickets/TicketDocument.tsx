import { QRCodeSVG } from 'qrcode.react'
import type { CSSProperties } from 'react'
import type { TicketViewModel } from './ticketViewModel'

export const TICKET_EXPORT_WIDTH = 1080
export const TICKET_EXPORT_HEIGHT = 1920

type Props = { ticket: TicketViewModel }

const labelStyle: CSSProperties = {
  color: '#9CA3AF',
  fontSize: 22,
  fontWeight: 700,
  letterSpacing: '0.13em',
  lineHeight: 1.2,
  textTransform: 'uppercase',
}

const valueStyle: CSSProperties = {
  color: '#F9FAFB',
  fontSize: 32,
  fontWeight: 700,
  lineHeight: 1.2,
  marginTop: 12,
  overflowWrap: 'break-word',
  wordBreak: 'normal',
}

export function TicketDocument({ ticket }: Props) {
  const accent = '#34D399'
  const details = [
    { label: 'Date', value: ticket.eventDate },
    { label: 'Time', value: ticket.eventTime },
    { label: 'Venue', value: ticket.venue, full: true },
    { label: 'Package', value: ticket.packageName, accent: true },
    { label: 'Seat', value: ticket.seatLabel },
  ]

  return (
    <article
      data-ticket-export-root="true"
      aria-label="Apex Bookings ticket"
      style={{
        position: 'relative',
        width: TICKET_EXPORT_WIDTH,
        height: TICKET_EXPORT_HEIGHT,
        boxSizing: 'border-box',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        transform: 'none',
        color: '#F9FAFB',
        background: '#101216',
        fontFamily: 'Arial, Helvetica, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header style={{ position: 'relative', height: 530, flex: '0 0 530px', background: '#1F2937', overflow: 'hidden' }}>
        {ticket.eventImage ? (
          <img
            data-ticket-asset="event-image"
            src={ticket.eventImage}
            crossOrigin="anonymous"
            alt=""
            style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #0F172A 0%, #1D4ED8 48%, #111827 100%)' }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(9,11,16,0.06) 12%, rgba(9,11,16,0.92) 100%)' }} />
        <div style={{ position: 'absolute', left: 72, right: 72, bottom: 58 }}>
          <div style={{ color: accent, fontSize: 22, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', maxHeight: 52, overflow: 'hidden', overflowWrap: 'break-word' }}>{ticket.eventHost} presents</div>
          <h1 style={{ color: '#FFFFFF', fontFamily: 'Georgia, serif', fontSize: 62, lineHeight: 1.02, margin: '18px 0 0', maxHeight: 202, overflow: 'hidden', overflowWrap: 'break-word', wordBreak: 'normal' }}>{ticket.eventTitle}</h1>
        </div>
      </header>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '62px 72px 54px', boxSizing: 'border-box', background: 'linear-gradient(145deg, #15181F 0%, #0B0D11 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 28, paddingBottom: 44, borderBottom: '1px solid rgba(255,255,255,0.16)' }}>
          <img data-ticket-asset="organization-logo" src={ticket.organizationLogo} alt={ticket.organizationName} style={{ height: 72, maxWidth: 360, objectFit: 'contain', display: 'block', background: '#000000', borderRadius: 12 }} />
          <div style={{ color: accent, border: `2px solid ${accent}`, borderRadius: 999, padding: '14px 22px', fontSize: 20, lineHeight: 1, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Verified pass</div>
        </div>

        <section style={{ padding: '42px 0 38px', borderBottom: '1px solid rgba(255,255,255,0.16)' }}>
          <div style={labelStyle}>Ticket holder</div>
          <div style={{ ...valueStyle, fontSize: 44, marginTop: 14, maxWidth: '100%', maxHeight: 110, overflow: 'hidden' }}>{ticket.customerName}</div>
          <div style={{ marginTop: 20, color: '#A7F3D0', fontSize: 24, fontWeight: 700, letterSpacing: '0.06em' }}>Ticket {ticket.ticketCode}</div>
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, padding: '38px 0' }}>
          {details.map(detail => (
            <div key={detail.label} style={{ gridColumn: detail.full ? '1 / -1' : undefined, minHeight: detail.full ? 126 : 138, padding: 26, boxSizing: 'border-box', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20, background: 'rgba(255,255,255,0.045)' }}>
              <div style={labelStyle}>{detail.label}</div>
              <div style={{ ...valueStyle, color: detail.accent ? accent : '#F9FAFB', fontSize: detail.full ? 30 : 28, maxHeight: detail.full ? 72 : 80, overflow: 'hidden' }}>{detail.value}</div>
            </div>
          ))}
        </section>

        {ticket.packageBenefits.length > 0 && (
          <section style={{ borderLeft: `5px solid ${accent}`, borderRadius: 18, padding: '24px 28px', background: 'rgba(52,211,153,0.08)', marginBottom: 32 }}>
            <div style={labelStyle}>Included benefits</div>
            <ul style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '13px 24px', maxHeight: 116, overflow: 'hidden', listStyle: 'none', padding: 0, margin: '18px 0 0', color: '#E5E7EB', fontSize: 22, lineHeight: 1.3 }}>
              {ticket.packageBenefits.slice(0, 4).map(benefit => <li key={benefit} style={{ display: 'flex', gap: 12, minWidth: 0, overflowWrap: 'break-word' }}><span style={{ color: accent }}>◆</span><span>{benefit}</span></li>)}
            </ul>
          </section>
        )}

        <section style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 42, paddingTop: 30, borderTop: '1px dashed rgba(255,255,255,0.24)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={labelStyle}>Booking reference</div>
            <div style={{ ...valueStyle, fontFamily: 'monospace', fontSize: 24 }}>{ticket.bookingReference || ticket.ticketCode}</div>
            <p style={{ margin: '30px 0 0', color: '#D1D5DB', fontSize: 21, lineHeight: 1.45, maxWidth: 420 }}>Present this QR code at entry for secure ticket verification.</p>
            <div style={{ marginTop: 18, color: ticket.ticketStatus === 'approved' ? accent : '#FBBF24', fontWeight: 800, fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.11em' }}>{ticket.ticketStatus === 'approved' ? 'Approved ticket' : 'Ticket pending approval'}</div>
          </div>
          <div style={{ width: 336, height: 336, flex: '0 0 336px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, background: '#FFFFFF', borderRadius: 24, boxShadow: '0 0 0 10px rgba(52,211,153,0.13)' }}>
            <QRCodeSVG value={ticket.verificationUrl || ticket.qrToken || ticket.ticketCode} size={300} bgColor="#FFFFFF" fgColor="#09090B" level="H" includeMargin={true} style={{ display: 'block', width: 300, height: 300, aspectRatio: '1 / 1' }} />
          </div>
        </section>
      </main>
    </article>
  )
}
