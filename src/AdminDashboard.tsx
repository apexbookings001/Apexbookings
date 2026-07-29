import { useState, useEffect, useRef, useCallback } from 'react'
import { adminEventStore, type ManagedEvent } from './features/events/adminEventStore'
import { createBookingPageData, masterBookingTemplateStore } from './features/events/bookingTemplate'
import { MediaLibraryPage } from './features/media/MediaLibraryPage'
import { mediaLibraryStore } from './features/media/mediaLibraryStore'
import { PaymentDashboard } from './features/payments/PaymentDashboard'
import { SupportDashboard } from './features/support/SupportDashboard'
import { SocialProofPage } from './features/conversion/SocialProofPage'
import { DocumentationPage } from './features/docs/DocumentationPage'
import { AdminOnboardingFooter } from './components/OnboardingGuide'
import { ticketStore } from './features/bookings/ticketStore'
import { paymentReviewStore } from './features/payments/paymentReviewStore'
import { supportStore } from './features/support/supportStore'

// ─── Design Tokens ────────────────────────────────────────────────────────────
import { getPaymentIcon, getSupportedCryptocurrencies } from './features/payments/PaymentAssets'
import { platformPaymentStore, type PlatformPaymentSettings } from './features/payments/platformPaymentStore'
import { emailService, type EmailConfiguration } from './features/email/emailService'
import movieTicketLogo from '../icons/movie-ticket.gif'
import { useAuth } from './features/auth/AuthContext'
import { teamService, type TeamMember } from './features/auth/teamService'
import type { OrganizationRole } from './services/supabase/workspace'
import { adminSettingsStore, type OrganizationSettings } from './features/settings/adminSettingsStore'
import { getSettingsReadiness, type SetupSection } from './features/settings/settingsReadiness'
import { socialProofStore } from './features/conversion/socialProofStore'
import { NotificationCenter } from './features/notifications/NotificationCenter'
import { notificationStore } from './features/notifications/notificationStore'
import { EventCatalogPage as SupabaseEventCatalogPage } from './features/events/EventCatalogPage'
import { useAdminRecoveryState } from './features/recovery/AdminSessionRecoveryProvider'
import { useLocation, useNavigate } from 'react-router-dom'
import { cleanupTestData, softDeleteAdminRecord, type TestCleanupCategory } from './features/admin/adminDeletionService'

const T = {
  bg: '#09090B', bg2: '#111113', bg3: '#18181B', bg4: '#1E1E21',
  card: 'rgba(255,255,255,0.03)', cardSolid: '#111113',
  cardBorder: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.07)',
  text: '#FAFAFA', textSub: '#A1A1AA', textMuted: '#52525B',
  emerald: '#00FF88', emeraldDim: '#00C866', emeraldGlow: 'rgba(0,255,136,0.18)',
  purple: '#8B5CF6', purpleGlow: 'rgba(139,92,246,0.18)',
  gold: '#F59E0B', goldGlow: 'rgba(245,158,11,0.18)',
  cyan: '#22D3EE', cyanGlow: 'rgba(34,211,238,0.18)',
  red: '#EF4444', redGlow: 'rgba(239,68,68,0.18)',
  inputBg: 'rgba(255,255,255,0.05)',
}

// ─── Hooks ────────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start: number | null = null
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / duration, 1)
      const ease = 1 - Math.pow(1 - p, 3)
      setVal(Math.floor(ease * target))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return val
}

function useToast() {
  const [msg, setMsg] = useState('')
  const show = useCallback((m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2800)
  }, [])
  return { msg, show }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg }: { msg: string }) {
  if (!msg) return null
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-6 py-3 rounded-2xl text-sm font-semibold shadow-2xl"
      style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B', animation: 'fade-in-up 0.3s ease' }}>
      {msg}
    </div>
  )
}

// ─── Icon Components ──────────────────────────────────────────────────────────
const Ico = ({ d, size = 18, stroke = 'currentColor', fill = 'none', sw = '1.8' }: { d: string | string[]; size?: number; stroke?: string; fill?: string; sw?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path}/>) : <path d={d}/>}
  </svg>
)

const Icons = {
  grid: () => <Ico d={['M3 3h7v7H3z','M14 3h7v7h-7z','M14 14h7v7h-7z','M3 14h7v7H3z']}/>,
  calendar: () => <Ico d={['M8 2v3M16 2v3M3 8h18','M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z']}/>,
  ticket: () => <Ico d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2 2 2 0 0 0 0 4v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2 2 2 0 0 0 0-4V7a2 2 0 0 0-2-2z"/>,
  users: () => <Ico d={['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2','M23 21v-2a4 4 0 0 0-3-3.87','M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z','M16 3.13a4 4 0 0 1 0 7.75']}/>,
  card: () => <Ico d={['M2 5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z','M2 10h20']}/>,
  chart: () => <Ico d={['M18 20V10','M12 20V4','M6 20v-6']}/>,
  chat: () => <Ico d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
  bell: () => <Ico d={['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9','M13.73 21a2 2 0 0 1-3.46 0']}/>,
  megaphone: () => <Ico d={['M3 11v2','M5 7v10l6-2V9z','M11 5v14','M11 7l9-4v14l-9-4']}/>,
  pin: () => <Ico d={['M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z','M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z']}/>,
  settings: () => <Ico d={['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z','M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z']}/>,
  search: () => <Ico d={['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z','M21 21l-4.35-4.35']}/>,
  plus: () => <Ico d="M12 5v14M5 12h14"/>,
  x: () => <Ico d="M18 6L6 18M6 6l12 12"/>,
  check: () => <Ico d="M5 13l4 4L19 7"/>,
  chevronRight: () => <Ico d="M9 18l6-6-6-6"/>,
  chevronLeft: () => <Ico d="M15 18l-6-6 6-6"/>,
  chevronDown: () => <Ico d="M6 9l6 6 6-6"/>,
  logout: () => <Ico d={['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4','M16 17l5-5-5-5','M21 12H9']}/>,
  eye: () => <Ico d={['M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z','M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']}/>,
  download: () => <Ico d={['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4','M7 10l5 5 5-5','M12 15V3']}/>,
  filter: () => <Ico d="M22 3H2l8 9.46V19l4 2v-8.54z"/>,
  refresh: () => <Ico d={['M23 4v6h-6','M1 20v-6h6','M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15']}/>,
  send: () => <Ico d={['M22 2L11 13','M22 2L15 22l-4-9-9-4 20-7z']}/>,
  star: () => <Ico d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#F59E0B" stroke="#F59E0B" sw="1"/>,
  trending: () => <Ico d={['M23 6l-9.5 9.5-5-5L1 18','M17 6h6v6']}/>,
  zap: () => <Ico d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>,
  shield: () => <Ico d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
  globe: () => <Ico d={['M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z','M2 12h20','M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2z']}/>,
  key: () => <Ico d={['M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4']}/>,
  image: () => <Ico d={['M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z','M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']}/>,
  mail: () => <Ico d={['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z','M22 6l-10 7L2 6']}/>,
  phone: () => <Ico d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>,
  listview: () => <Ico d={['M8 6h13M8 12h13M8 18h13','M3 6h.01M3 12h.01M3 18h.01']}/>,
  gridview: () => <Ico d={['M10 3H3v7h7V3z','M21 3h-7v7h7V3z','M21 14h-7v7h7v-7z','M10 14H3v7h7v-7z']}/>,
  dollar: () => <Ico d={['M12 1v22','M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6']}/>,
  copy: () => <Ico d={['M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z','M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1']}/>,
  ban: () => <Ico d={['M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z','M4.93 4.93l14.14 14.14']}/>,
  flag: () => <Ico d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>,
  smile: () => <Ico d={['M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z','M8 14s1.5 2 4 2 4-2 4-2','M9 9h.01M15 9h.01']}/>,
  paperclip: () => <Ico d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>,
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
/* Retired prototype fixtures. Live admin data is sourced below.
const MOCK_BOOKINGS = [
  { id: 'APEX-7K2M9P', customer: 'Sophia Chen', email: 'sophia@example.com', avatar: 'SC', event: 'Drake — MSG', tier: 'VVIP Platinum', section: 'GA Floor', qty: 2, total: 1908, status: 'confirmed', payment: 'card', date: 'Jul 14, 2025', phone: '+1 212 555 0181', country: 'United States' },
  { id: 'APEX-3N8XQR', customer: 'Marcus Reid', email: 'marcus@example.com', avatar: 'MR', event: 'Drake — MSG', tier: 'VIP Floor', section: '103', qty: 4, total: 2160, status: 'confirmed', payment: 'apple', date: 'Jul 13, 2025', phone: '+1 917 555 0234', country: 'United States' },
  { id: 'APEX-5L4TYZ', customer: 'Amelia Torres', email: 'amelia@example.com', avatar: 'AT', event: 'Drake — MSG', tier: 'General Admission', section: '307', qty: 1, total: 212, status: 'pending', payment: 'paypal', date: 'Jul 13, 2025', phone: '+44 20 7946 0958', country: 'United Kingdom' },
  { id: 'APEX-9W1KBJ', customer: 'James Park', email: 'james@example.com', avatar: 'JP', event: 'Drake — MSG', tier: 'VIP Floor', section: '105', qty: 40, total: 21600, status: 'confirmed', payment: 'bank', date: 'Jul 12, 2025', phone: '+1 646 555 0312', country: 'United States' },
  { id: 'APEX-2A6PVF', customer: 'Naomi Wells', email: 'naomi@example.com', avatar: 'NW', event: 'Drake — MSG', tier: 'VVIP Platinum', section: 'Platinum Suite A', qty: 1, total: 954, status: 'refunded', payment: 'card', date: 'Jul 11, 2025', phone: '+1 718 555 0445', country: 'United States' },
  { id: 'APEX-8D3QMN', customer: 'David Kim', email: 'david@example.com', avatar: 'DK', event: 'Drake — MSG', tier: 'General Admission', section: '312', qty: 2, total: 424, status: 'confirmed', payment: 'crypto', date: 'Jul 11, 2025', phone: '+82 2 555 0156', country: 'South Korea' },
  { id: 'APEX-4F7RSU', customer: 'Isabella Ruiz', email: 'isabella@example.com', avatar: 'IR', event: 'Drake — MSG', tier: 'VIP Floor', section: '108', qty: 2, total: 1080, status: 'cancelled', payment: 'google', date: 'Jul 10, 2025', phone: '+34 91 555 0789', country: 'Spain' },
  { id: 'APEX-6H2CVW', customer: 'Ethan Brooks', email: 'ethan@example.com', avatar: 'EB', event: 'Drake — MSG', tier: 'General Admission', section: '301', qty: 3, total: 636, status: 'confirmed', payment: 'card', date: 'Jul 10, 2025', phone: '+1 213 555 0567', country: 'United States' },
]

const MOCK_CUSTOMERS = [
  { id: 1, name: 'Sophia Chen', email: 'sophia@example.com', avatar: 'SC', color: '#00FF88', bookings: 8, spent: 12840, vip: true, status: 'active', joined: 'Jan 2024', lastSeen: '2 min ago', tags: ['VIP', 'Platinum'] },
  { id: 2, name: 'Marcus Reid', email: 'marcus@example.com', avatar: 'MR', color: '#8B5CF6', bookings: 5, spent: 8900, vip: true, status: 'active', joined: 'Mar 2024', lastSeen: '1 hr ago', tags: ['VIP'] },
  { id: 3, name: 'James Park', email: 'james@example.com', avatar: 'JP', color: '#F59E0B', bookings: 12, spent: 48200, vip: true, status: 'active', joined: 'Oct 2023', lastSeen: 'Today', tags: ['Corporate', 'VIP', 'Bulk'] },
  { id: 4, name: 'Amelia Torres', email: 'amelia@example.com', avatar: 'AT', color: '#22D3EE', bookings: 3, spent: 2100, vip: false, status: 'active', joined: 'Jun 2024', lastSeen: '3 days ago', tags: [] },
  { id: 5, name: 'Naomi Wells', email: 'naomi@example.com', avatar: 'NW', color: '#F472B6', bookings: 6, spent: 7200, vip: true, status: 'inactive', joined: 'Feb 2024', lastSeen: '2 weeks ago', tags: ['VIP'] },
  { id: 6, name: 'David Kim', email: 'david@example.com', avatar: 'DK', color: '#22D3EE', bookings: 2, spent: 1800, vip: false, status: 'active', joined: 'Jul 2024', lastSeen: 'Yesterday', tags: ['Crypto'] },
  { id: 7, name: 'Ethan Brooks', email: 'ethan@example.com', avatar: 'EB', color: '#00FF88', bookings: 4, spent: 3400, vip: false, status: 'active', joined: 'Apr 2024', lastSeen: 'Today', tags: [] },
]

const MOCK_PAYMENTS = [
  { id: 'TXN-001', customer: 'James Park', amount: 21600, method: 'bank', status: 'pending_review', date: 'Jul 12, 2025', booking: 'APEX-9W1KBJ' },
  { id: 'TXN-002', customer: 'Sophia Chen', amount: 1908, method: 'card', status: 'completed', date: 'Jul 14, 2025', booking: 'APEX-7K2M9P' },
  { id: 'TXN-003', customer: 'Marcus Reid', amount: 2160, method: 'apple', status: 'completed', date: 'Jul 13, 2025', booking: 'APEX-3N8XQR' },
  { id: 'TXN-004', customer: 'Amelia Torres', amount: 212, method: 'paypal', status: 'pending', date: 'Jul 13, 2025', booking: 'APEX-5L4TYZ' },
  { id: 'TXN-005', customer: 'Naomi Wells', amount: 954, method: 'card', status: 'refunded', date: 'Jul 11, 2025', booking: 'APEX-2A6PVF' },
  { id: 'TXN-006', customer: 'David Kim', amount: 424, method: 'crypto', status: 'completed', date: 'Jul 11, 2025', booking: 'APEX-8D3QMN' },
]

const MOCK_CHATS = [
  { id: 1, customer: 'Sophia Chen', avatar: 'SC', color: '#00FF88', preview: 'Hi, I need to change my seat section...', time: '2 min ago', unread: 3, priority: 'high', agent: 'Sarah K.', status: 'open' },
  { id: 2, customer: 'James Park', avatar: 'JP', color: '#F59E0B', preview: "The payment proof was uploaded, can you...", time: '18 min ago', unread: 1, priority: 'urgent', agent: 'Mike D.', status: 'open' },
  { id: 3, customer: 'Amelia Torres', avatar: 'AT', color: '#22D3EE', preview: 'Do you guys offer group discounts?', time: '45 min ago', unread: 0, priority: 'normal', agent: 'Sarah K.', status: 'open' },
  { id: 4, customer: 'Marcus Reid', avatar: 'MR', color: '#8B5CF6', preview: 'Everything was perfect, thank you!', time: '2 hrs ago', unread: 0, priority: 'normal', agent: null, status: 'resolved' },
  { id: 5, customer: 'Ethan Brooks', avatar: 'EB', color: '#00FF88', preview: 'Where can I pick up my wristbands?', time: '3 hrs ago', unread: 0, priority: 'low', agent: 'Mike D.', status: 'open' },
]

const CHAT_MESSAGES = [
  { id: 1, from: 'customer', text: "Hi, I booked 2 VVIP tickets but I need to change the section from GA Floor to Platinum Suite A. Is that possible?", time: '2:14 PM' },
  { id: 2, from: 'agent', text: "Hi Sophia! Of course — let me look into your booking right now.", time: '2:15 PM' },
  { id: 3, from: 'agent', text: "I can see your booking APEX-7K2M9P. Platinum Suite A has 1 seat remaining. I can make the transfer at no extra charge since you're upgrading within the same tier.", time: '2:16 PM' },
  { id: 4, from: 'customer', text: "That would be amazing! Can you confirm the view from Platinum Suite A is better than GA Floor?", time: '2:18 PM' },
  { id: 5, from: 'agent', text: "Absolutely — Suite A gives you an elevated private view with dedicated service, premium bar access, and a direct sightline to the stage. You'll love it.", time: '2:19 PM' },
  { id: 6, from: 'customer', text: "Perfect! Please go ahead with the change 🙏", time: '2:20 PM' },
]

const REVENUE_DATA = [
  { label: 'Jan', v: 42000 }, { label: 'Feb', v: 58000 }, { label: 'Mar', v: 48000 },
  { label: 'Apr', v: 71000 }, { label: 'May', v: 89000 }, { label: 'Jun', v: 112000 },
  { label: 'Jul', v: 156000 },
]

const COUPONS = [
  { code: 'APEX20', discount: '20%', uses: 142, max: 500, expires: 'Sep 15, 2025', status: 'active' },
  { code: 'VIP10', discount: '10%', uses: 89, max: 200, expires: 'Sep 19, 2025', status: 'active' },
  { code: 'EARLYBIRD', discount: '15%', uses: 200, max: 200, expires: 'Jul 1, 2025', status: 'expired' },
  { code: 'SUMMER30', discount: '30%', uses: 0, max: 100, expires: 'Aug 31, 2025', status: 'draft' },
]

*/
type AdminBooking = { id: string; customer: string; email: string; avatar: string; event: string; tier: string; section: string; qty: number; total: number; status: string; payment: string; date: string; phone: string; country: string }
type AdminCustomer = { id: string; name: string; email: string; avatar: string; color: string; bookings: number; spent: number; vip: boolean; status: string; joined: string; lastSeen: string; tags: string[]; country: string }
type AdminPayment = { id: string; customer: string; amount: number; method: string; status: string; date: string; booking: string }
type AdminChat = { id: string; customer: string; avatar: string; color: string; preview: string; time: string; unread: number; priority: string; agent: string | null; status: string; messages: { id: string; from: 'customer' | 'agent'; text: string; time: string }[] }

const initials = (value: string) => value.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'AG'
const adminBookings = (): AdminBooking[] => ticketStore.list().map(ticket => ({ id: ticket.bookingReference, customer: ticket.customerName, email: ticket.customerEmail, avatar: initials(ticket.customerName), event: ticket.eventName, tier: ticket.packageName, section: ticket.seatLabel, qty: 1, total: ticket.amount, status: ticket.status === 'approved' ? 'confirmed' : ticket.status, payment: ticket.paymentMethod, date: new Date(ticket.createdAt).toLocaleDateString(), phone: '', country: ticket.country ?? 'Unknown' }))
const adminCustomers = (): AdminCustomer[] => Array.from(ticketStore.list().reduce((customers, ticket) => { const current = customers.get(ticket.customerEmail) ?? { id: ticket.customerEmail, name: ticket.customerName, email: ticket.customerEmail, avatar: initials(ticket.customerName), color: '#00FF88', bookings: 0, spent: 0, vip: false, status: 'active', joined: new Date(ticket.createdAt).toLocaleDateString(), lastSeen: new Date(ticket.createdAt).toLocaleString(), tags: [] as string[], country: ticket.country ?? 'Unknown' }; current.bookings += 1; current.spent += ticket.amount; current.vip ||= /vvip|vip/i.test(ticket.packageName); current.tags = Array.from(new Set([...current.tags, ticket.packageName])); current.country = ticket.country ?? current.country; customers.set(ticket.customerEmail, current); return customers }, new Map<string, AdminCustomer>()).values())
const adminPayments = (): AdminPayment[] => paymentReviewStore.list().map(record => ({ id: record.id, customer: record.customer, amount: record.amount, method: record.method, status: record.status, date: new Date(record.createdAt).toLocaleDateString(), booking: record.reference }))
const adminChats = (): AdminChat[] => supportStore.list().map(conversation => ({ id: conversation.id, customer: conversation.customer, avatar: initials(conversation.customer), color: conversation.avatarColor ?? '#00FF88', preview: conversation.messages.at(-1)?.body ?? 'No messages yet', time: new Date(conversation.lastActivity).toLocaleString(), unread: conversation.unread, priority: conversation.unread > 2 ? 'high' : 'normal', agent: null, status: conversation.status, messages: conversation.messages.map(message => ({ id: message.id, from: message.from === 'admin' ? 'agent' : 'customer', text: message.body, time: new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })) }))
const revenueData = () => { const months = Array.from({ length: 7 }, (_, offset) => { const date = new Date(); date.setMonth(date.getMonth() - (6 - offset)); return { label: date.toLocaleString('en', { month: 'short' }), v: 0 } }); ticketStore.list().filter(ticket => ticket.status === 'approved').forEach(ticket => { const date = new Date(ticket.createdAt); const index = months.findIndex(month => month.label === date.toLocaleString('en', { month: 'short' })); if (index >= 0) months[index].v += ticket.amount }); return months }
const SUPPORTED_AUDIENCE_COUNTRIES = [
  { country: 'United States', flag: 'US', currency: 'USD' },
  { country: 'Canada', flag: 'CA', currency: 'CAD' },
  { country: 'United Kingdom', flag: 'GB', currency: 'GBP' },
  { country: 'France', flag: 'FR', currency: 'EUR' },
  { country: 'Germany', flag: 'DE', currency: 'EUR' },
  { country: 'Italy', flag: 'IT', currency: 'EUR' },
  { country: 'Spain', flag: 'ES', currency: 'EUR' },
  { country: 'Brazil', flag: 'BR', currency: 'BRL' },
  { country: 'Mexico', flag: 'MX', currency: 'MXN' },
  { country: 'Australia', flag: 'AU', currency: 'AUD' },
  { country: 'Colombia', flag: 'CO', currency: 'COP' },
]
const emptyCoupons: { code: string; discount: string; uses: number; max: number; expires: string; status: string }[] = []

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export type Page = 'dashboard' | 'bookings' | 'events' | 'payments' | 'media' | 'chat' | 'notifications' | 'settings' | 'documentation'

type NavigationItem = { id: Page; label: string; icon: React.ReactNode; badge?: number; badgeColor?: string }

const NAV_ITEMS: NavigationItem[] = [
  { id: 'dashboard' as Page, label: 'Dashboard', icon: <Icons.grid/> },
  { id: 'bookings' as Page, label: 'Bookings', icon: <Icons.ticket/> },
  { id: 'payments' as Page, label: 'Payment', icon: <Icons.card/> },
  { id: 'media' as Page, label: 'Media Center', icon: <Icons.image/> },
  { id: 'chat' as Page, label: 'Live Chat', icon: <Icons.chat/> },
  { id: 'notifications' as Page, label: 'Social Proof', icon: <Icons.bell/> },
  { id: 'events' as Page, label: 'Event', icon: <Icons.calendar/> },
  { id: 'settings' as Page, label: 'Settings', icon: <Icons.settings/> },
  { id: 'documentation' as Page, label: 'Documentation', icon: <Icons.listview/> },
]

function Sidebar({ page, setPage, collapsed, setCollapsed, mobileOpen, setMobileOpen, setupIssueCount }: {
  page: Page; setPage: (p: Page) => void
  collapsed: boolean; setCollapsed: (v: boolean) => void
  mobileOpen: boolean; setMobileOpen: (v: boolean) => void
  setupIssueCount: number
}) {
  const nav = (
    <aside
      className="flex flex-col h-full transition-all duration-300"
      style={{
        width: collapsed ? 64 : 240,
        background: 'linear-gradient(180deg, #0d0d0f 0%, #09090B 100%)',
        borderRight: `1px solid ${T.border}`,
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b shrink-0" style={{ borderColor: T.border }}>
        <div className="w-9 h-9 rounded-xl p-0.5 shadow-[0_10px_26px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.35)]" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.05))', border: '1px solid rgba(255,255,255,0.14)' }}>
          <img src={movieTicketLogo} alt="App logo" className="w-full h-full object-contain rounded-[10px] shrink-0" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-serif font-bold text-base leading-tight" style={{ color: T.text }}>Apex</div>
            <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Admin Center</div>
          </div>
        )}
        {/* Desktop collapse btn */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto w-6 h-6 rounded-md hidden lg:flex items-center justify-center transition-colors shrink-0"
          style={{ color: T.textMuted, background: T.inputBg }}
        >
          {collapsed ? <Icons.chevronRight/> : <Icons.chevronLeft/>}
        </button>
        {/* Mobile close btn */}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto w-6 h-6 rounded-md lg:hidden flex items-center justify-center"
          style={{ color: T.textMuted, background: T.inputBg }}
        >
          <Icons.x/>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_ITEMS.map(item => {
          const active = page === item.id
          const badge = item.id === 'settings' ? setupIssueCount : item.badge
          const badgeColor = item.id === 'settings' ? T.gold : item.badgeColor
          return (
            <button
              key={item.id}
              onClick={() => { setPage(item.id); setMobileOpen(false) }}
              className="admin-sidebar-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-left relative group"
              style={{
                background: active ? 'rgba(0,255,136,0.08)' : 'transparent',
                border: `1px solid ${active ? 'rgba(0,255,136,0.2)' : 'transparent'}`,
                color: active ? T.emerald : T.textSub,
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0" style={{ color: active ? T.emerald : T.textMuted }}>
                {item.icon}
              </span>
              {!collapsed && <span className="text-sm font-medium flex-1">{item.label}</span>}
              {!collapsed && badge ? (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                  style={{ background: badgeColor ? `${badgeColor}20` : 'rgba(239,68,68,0.15)', color: badgeColor || T.red }}>
                  {badge}
                </span>
              ) : null}
              {collapsed && badge ? (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold"
                  style={{ background: badgeColor || T.red, color: '#09090B' }}>
                  {badge > 9 ? '9+' : badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-3 shrink-0" style={{ borderColor: T.border }}>
        <div className="flex items-center gap-3 px-1 py-2 rounded-xl" style={{ background: T.inputBg }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0" style={{ background: 'linear-gradient(135deg,#8B5CF6,#00FF88)', color: '#09090B' }}>AX</div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold truncate" style={{ color: T.text }}>Admin User</div>
              <div className="text-[10px] font-mono truncate" style={{ color: T.textMuted }}>admin@apex.com</div>
            </div>
          )}
          {!collapsed && (
            <button className="shrink-0 p-1 rounded-lg transition-colors" style={{ color: T.textMuted }}>
              <Icons.logout/>
            </button>
          )}
        </div>
      </div>
    </aside>
  )

  return (
    <>
      {/* Desktop: fixed sidebar */}
      <div
        className="fixed left-0 top-0 bottom-0 z-40 hidden lg:block transition-all duration-300"
        style={{ width: collapsed ? 64 : 240 }}
      >
        {nav}
      </div>

      {/* Mobile/Tablet: drawer with overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setMobileOpen(false)}/>
          <div className="relative z-10 flex flex-col" style={{ width: 240, animation: 'fade-in-left 0.25s ease' }}>
            {nav}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Top Navigation ───────────────────────────────────────────────────────────
function TopNav({ page, onExitAdmin, collapsed, show, onHamburger, onCreateEvent, onOpenNotifications }: { page: Page; onExitAdmin: () => void; collapsed: boolean; show: (m: string) => void; onHamburger: () => void; onCreateEvent: () => void; onOpenNotifications: () => void }) {
  const [search, setSearch] = useAdminRecoveryState('dashboard.globalSearch', '', value => typeof value === 'string')
  const [cmdOpen, setCmdOpen] = useAdminRecoveryState('dashboard.commandPaletteOpen', false, value => typeof value === 'boolean')
  const [notificationsOpen, setNotificationsOpen] = useAdminRecoveryState('dashboard.notificationsOpen', false, value => typeof value === 'boolean')
  const [notifications, setNotifications] = useState(() => notificationStore.list())
  useEffect(() => notificationStore.subscribe(() => setNotifications(notificationStore.list())), [])
  const unreadCount = notifications.filter(notification => !notification.readAt).length

  const PAGE_TITLES: Record<Page, string> = {
    dashboard: 'Dashboard Overview', bookings: 'Bookings Management',
    events: 'Event Management', payments: 'Payment Center', media: 'Media Center',
    chat: 'Live Support Chat', notifications: 'Social Proof Notifications',
    settings: 'System Settings', documentation: 'Documentation',
  }

  return (
    <>
      <header
        className="fixed top-0 right-0 z-30 flex items-center gap-3 px-5 py-3 h-14"
        style={{
          left: 0, right: 0,
          background: 'rgba(9,9,11,0.9)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderBottom: `1px solid ${T.border}`,
          transition: 'left 0.3s ease',
        }}
      >
        {/* Mobile hamburger */}
        <button
          className="lg:hidden w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.textSub }}
          onClick={onHamburger}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        {/* Desktop left-offset spacer */}
        <div className="hidden lg:block shrink-0 transition-all duration-300" style={{ width: collapsed ? 64 : 240 }}/>
        {/* Page title */}
        <div className="flex-1 min-w-0">
          <h1 className="font-serif text-base font-bold truncate" style={{ color: T.text }}>{PAGE_TITLES[page]}</h1>
        </div>

        {/* Search */}
        <button
          onClick={() => setCmdOpen(true)}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all"
          style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.textMuted, minWidth: 160 }}
        >
          <Icons.search/>
          <span>Search... </span>
          <span className="ml-auto font-mono px-1.5 py-0.5 rounded text-[10px]" style={{ background: T.bg3, color: T.textMuted }}>⌘K</span>
        </button>

        {/* Actions */}
        <button onClick={onCreateEvent} className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors" style={{ background: T.emerald, color: '#09090B' }}>
          <Icons.plus/>
        </button>
        <button onClick={() => setNotificationsOpen(open => !open)} className="relative w-8 h-8 rounded-xl flex items-center justify-center" aria-label={`Open notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`} style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.textSub }}>
          <Icons.bell/>
          {unreadCount > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-4 h-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>

        {/* Admin avatar */}
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold cursor-pointer" style={{ background: 'linear-gradient(135deg,#8B5CF6,#00FF88)', color: '#09090B' }}
          onClick={onExitAdmin} title="Exit Admin">AX</div>
      </header>

      {notificationsOpen && <div className="fixed right-5 top-16 z-50 w-[min(23rem,calc(100%_-_2.5rem))] overflow-hidden rounded-2xl shadow-2xl" style={{ background: T.bg2, border: `1px solid ${T.cardBorder}` }}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.border }}><div className="text-sm font-semibold" style={{ color: T.text }}>Notifications</div><button onClick={() => { setNotificationsOpen(false); onOpenNotifications() }} className="text-xs" style={{ color: T.emerald }}>View all</button></div>
        {notifications.length === 0 ? <div className="p-5 text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: T.inputBg, color: T.textMuted }}><Icons.bell/></div><div className="text-sm font-medium" style={{ color: T.text }}>You’re all caught up</div><div className="mt-1 text-xs" style={{ color: T.textMuted }}>New booking, payment, and support alerts will appear here.</div></div> : notifications.slice(0, 5).map(notification => <button key={notification.id} onClick={() => { notificationStore.markRead(notification.id); setNotificationsOpen(false); onOpenNotifications() }} className={`w-full px-4 py-3 text-left border-b ${notification.readAt ? 'opacity-60' : ''}`} style={{ borderColor: T.border }}><div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full" style={{ background: notification.readAt ? T.textMuted : T.emerald }}/><div className="text-xs font-semibold" style={{ color: T.text }}>{notification.title}</div></div><div className="mt-1 text-xs" style={{ color: T.textMuted }}>{notification.detail}</div><div className="mt-1 text-[10px]" style={{ color: T.textMuted }}>{new Date(notification.createdAt).toLocaleString()}</div></button>)}
      </div>}

      {/* Command palette */}
      {cmdOpen && (
        <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-20 px-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
          onClick={() => setCmdOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl" style={{ background: T.bg2, border: `1px solid ${T.cardBorder}` }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: T.border }}>
              <Icons.search/>
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search bookings, customers, events..."
                className="flex-1 bg-transparent outline-none text-sm" style={{ color: T.text }}/>
              <button onClick={() => setCmdOpen(false)} style={{ color: T.textMuted }}><Icons.x/></button>
            </div>
            <div className="p-3">
              {['Dashboard Overview','Bookings Management','Customer Profiles','Payment Center','Reports'].map(r => (
                <button key={r} className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors flex items-center gap-3"
                  onClick={() => setCmdOpen(false)} style={{ color: T.textSub }}>
                  <Icons.search/>
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, color, glow, trend }: { label: string; value: string; sub: string; icon: React.ReactNode; color: string; glow: string; trend?: string }) {
  return (
    <div className="relative rounded-2xl p-5 overflow-hidden group transition-all duration-300"
      style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}`, boxShadow: `0 4px 24px rgba(0,0,0,0.35)` }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = color + '40'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 32px ${glow}, 0 4px 24px rgba(0,0,0,0.4)` }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = T.cardBorder; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.35)' }}>
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full -translate-y-1/2 translate-x-1/2 opacity-20" style={{ background: `radial-gradient(circle,${color},transparent 70%)` }}/>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: glow, color }}>
          {icon}
        </div>
        {trend && (
          <div className="flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald }}>
            <Icons.trending/><span>{trend}</span>
          </div>
        )}
      </div>
      <div className="font-serif text-2xl font-bold mb-0.5" style={{ color: T.text }}>{value}</div>
      <div className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>{label}</div>
      <div className="text-xs" style={{ color: T.textSub }}>{sub}</div>
    </div>
  )
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────
function RevenueChart() {
  const data = revenueData()
  const totalRevenue = data.reduce((total, month) => total + month.v, 0)
  const max = Math.max(1, ...data.map(d => d.v))
  const w = 520, h = 160
  const pad = { l: 48, r: 16, t: 16, b: 28 }
  const chartW = w - pad.l - pad.r
  const chartH = h - pad.t - pad.b

  const pts = data.map((d, i) => ({
    x: pad.l + (i / Math.max(1, data.length - 1)) * chartW,
    y: pad.t + chartH - (d.v / max) * chartH,
  }))

  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const area = `${line} L ${pts[pts.length - 1].x} ${pad.t + chartH} L ${pts[0].x} ${pad.t + chartH} Z`

  const [hov, setHov] = useState<number | null>(null)

  return (
    <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider mb-0.5" style={{ color: T.textMuted }}>Revenue Trend</div>
          <div className="font-serif text-xl font-bold" style={{ color: T.text }}>${totalRevenue.toLocaleString()} <span className="text-sm font-normal" style={{ color: T.textMuted }}>approved ticket revenue</span></div>
        </div>
        <div className="flex gap-1.5">
          {['7D','1M','3M','YTD'].map((l, i) => (
            <button key={l} className="text-xs px-2.5 py-1 rounded-lg transition-colors"
              style={{ background: i === 3 ? 'rgba(0,255,136,0.12)' : T.inputBg, color: i === 3 ? T.emerald : T.textMuted, border: `1px solid ${i === 3 ? 'rgba(0,255,136,0.3)' : T.border}` }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={pad.l} y1={pad.t + f * chartH} x2={w - pad.r} y2={pad.t + f * chartH}
              stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>
          ))}
          {/* Y labels */}
          {[0, 0.5, 1].map(f => (
            <text key={f} x={pad.l - 6} y={pad.t + (1 - f) * chartH + 4} textAnchor="end" fill="rgba(255,255,255,0.25)" fontSize="9" fontFamily="DM Mono,monospace">
              ${Math.round(max * f / 1000)}k
            </text>
          ))}
          {/* Area fill */}
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00FF88" stopOpacity="0.2"/>
              <stop offset="100%" stopColor="#00FF88" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={area} fill="url(#chartGrad)"/>
          {/* Line */}
          <path d={line} fill="none" stroke="#00FF88" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          {/* Data points */}
          {pts.map((p, i) => (
            <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r={hov === i ? 6 : 4} fill="#09090B" stroke="#00FF88" strokeWidth="2"/>
              {/* X labels */}
              <text x={p.x} y={pad.t + chartH + 14} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="DM Mono,monospace">
                {data[i].label}
              </text>
              {hov === i && (
                <g>
                  <rect x={p.x - 30} y={p.y - 30} width={60} height={22} rx="6" fill="#18181B" stroke="rgba(0,255,136,0.3)" strokeWidth="1"/>
                  <text x={p.x} y={p.y - 15} textAnchor="middle" fill="#00FF88" fontSize="9" fontFamily="DM Mono,monospace" fontWeight="700">
                    ${(data[i].v / 1000).toFixed(0)}k
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    confirmed: { bg: 'rgba(0,255,136,0.12)', color: '#00FF88', label: 'Confirmed' },
    pending: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Pending' },
    refunded: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6', label: 'Refunded' },
    cancelled: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Cancelled' },
    completed: { bg: 'rgba(0,255,136,0.12)', color: '#00FF88', label: 'Completed' },
    pending_review: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'Review' },
    active: { bg: 'rgba(0,255,136,0.12)', color: '#00FF88', label: 'Active' },
    inactive: { bg: 'rgba(113,113,122,0.15)', color: '#71717A', label: 'Inactive' },
    expired: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Expired' },
    draft: { bg: 'rgba(113,113,122,0.15)', color: '#71717A', label: 'Draft' },
    scheduled: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6', label: 'Scheduled' },
    live: { bg: 'rgba(0,255,136,0.12)', color: '#00FF88', label: 'Live' },
    sold_out: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Sold Out' },
    open: { bg: 'rgba(34,211,238,0.12)', color: '#22D3EE', label: 'Open' },
    resolved: { bg: 'rgba(0,255,136,0.12)', color: '#00FF88', label: 'Resolved' },
    urgent: { bg: 'rgba(239,68,68,0.12)', color: '#EF4444', label: 'Urgent' },
    high: { bg: 'rgba(245,158,11,0.12)', color: '#F59E0B', label: 'High' },
    normal: { bg: 'rgba(113,113,122,0.12)', color: '#71717A', label: 'Normal' },
    low: { bg: 'rgba(34,211,238,0.08)', color: '#22D3EE', label: 'Low' },
  }
  const c = cfg[status] || { bg: T.inputBg, color: T.textMuted, label: status }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: c.bg, color: c.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }}/>
      {c.label}
    </span>
  )
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
function DashboardPage({ show, onNavigate }: { show: (m: string) => void; onNavigate: (page: Page) => void }) {
  /* Retired dashboard fixture calculations.
  const rev = useCountUp(156840)
  const tickets = useCountUp(412)
  const customers = useCountUp(1247)
  const pending = useCountUp(3)
  const [selectedCountry, setSelectedCountry] = useState<{ country: string; flag: string; currency: string; users: number; activity: string } | null>(null)
  const countries = [
    { country: 'United States', flag: '🇺🇸', currency: 'USD', users: 482, activity: '42 active on booking page' },
    { country: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', users: 168, activity: '18 viewed tickets recently' },
    { country: 'Canada', flag: '🇨🇦', currency: 'CAD', users: 126, activity: '11 checkout sessions started' },
    { country: 'Nigeria', flag: '🇳🇬', currency: 'NGN', users: 92, activity: '9 payment attempts today' },
    { country: 'Brazil', flag: '🇧🇷', currency: 'BRL', users: 74, activity: '7 new visitors in the last hour' },
    { country: 'Germany', flag: '🇩🇪', currency: 'EUR', users: 61, activity: '5 tickets reserved' },
    { country: 'Australia', flag: '🇦🇺', currency: 'AUD', users: 39, activity: '4 support conversations opened' },
  ]

  const recentActivity = [
    { icon: '🎟', text: 'APEX-7K2M9P — Sophia Chen booked 2× VVIP', time: '2 min ago', color: T.emerald },
    { icon: '💳', text: 'Payment $21,600 — James Park awaiting review', time: '8 min ago', color: T.gold },
    { icon: '🔄', text: 'Refund processed — APEX-2A6PVF ($954)', time: '22 min ago', color: T.purple },
    { icon: '✅', text: 'APEX-3N8XQR confirmed — 4× VIP Floor', time: '1 hr ago', color: T.emerald },
    { icon: '💬', text: 'New support ticket — Sophia Chen (VVIP)', time: '1 hr ago', color: T.cyan },
    { icon: '🎟', text: 'APEX-8D3QMN — David Kim booked via crypto', time: '2 hrs ago', color: T.gold },
  ]

  */
  const [version, setVersion] = useState(0)
  useEffect(() => { const refresh = () => setVersion(value => value + 1); const unsubscribe = [ticketStore.subscribe(refresh), paymentReviewStore.subscribe(refresh), supportStore.subscribe(refresh), adminEventStore.subscribe(refresh)]; return () => unsubscribe.forEach(stop => stop()) }, [])
  const bookings = adminBookings()
  const customerList = adminCustomers()
  const payments = adminPayments()
  const chats = adminChats()
  const approvedBookings = bookings.filter(booking => booking.status === 'confirmed')
  const approvalRate = bookings.length ? Math.round((approvedBookings.length / bookings.length) * 100) : null
  const rev = useCountUp(approvedBookings.reduce((total, booking) => total + booking.total, 0))
  const tickets = useCountUp(approvedBookings.length)
  const customers = useCountUp(customerList.length)
  const pending = useCountUp(payments.filter(payment => payment.status === 'pending').length)
  const recentActivity = [...bookings.map(booking => ({ icon: '🎟️', text: `${booking.id} — ${booking.customer} selected ${booking.tier}`, time: booking.date, color: T.emerald })), ...payments.filter(payment => payment.status === 'pending').map(payment => ({ icon: '💳', text: `Payment ${payment.booking} is awaiting review`, time: payment.date, color: T.gold })), ...chats.filter(chat => chat.unread > 0).map(chat => ({ icon: '💬', text: `${chat.customer} sent a support message`, time: chat.time, color: T.cyan }))].slice(0, 6)
  const countries = SUPPORTED_AUDIENCE_COUNTRIES.map(country => { const users = customerList.filter(customer => customer.country === country.country).length; return { ...country, users, activity: users ? `${users} recent user${users === 1 ? '' : 's'} interacted through booking records` : 'No recent identified user activity' } })
  const tierStats = Array.from(bookings.reduce((items, booking) => { const current = items.get(booking.tier) ?? { name: booking.tier, sold: 0, cap: 0, color: T.emerald, pct: 0 }; current.sold += booking.qty; current.cap += booking.qty; items.set(booking.tier, current); return items }, new Map<string, { name: string; sold: number; cap: number; color: string; pct: number }>()).values())
  const paymentStats = Array.from(bookings.reduce((items, booking) => { items.set(booking.payment, (items.get(booking.payment) ?? 0) + 1); return items }, new Map<string, number>()).entries()).map(([method, count]) => ({ method, pct: bookings.length ? Math.round((count / bookings.length) * 100) : 0, color: T.cyan }))
  const [selectedCountry, setSelectedCountry] = useState<{ country: string; flag: string; currency: string; users: number; activity: string } | null>(null)
  void version

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl p-6 md:p-8" style={{ background: 'linear-gradient(120deg,#101f1a 0%,#101114 52%,#211637 100%)', border: '1px solid rgba(0,255,136,.2)' }}>
        <div className="absolute -right-10 -top-16 h-52 w-52 rounded-full blur-3xl" style={{ background: 'rgba(0,255,136,.16)' }}/>
        <div className="relative flex flex-wrap items-end justify-between gap-5"><div><div className="text-xs font-mono uppercase tracking-[.22em]" style={{ color: T.emerald }}>Live command center</div><h1 className="mt-2 font-serif text-3xl font-bold md:text-4xl" style={{ color: T.text }}>Your booking operation, in one place.</h1><p className="mt-2 max-w-xl text-sm" style={{ color: T.textSub }}>Revenue, payment reviews, and support activity update from your live booking records.</p></div><div className="rounded-2xl px-5 py-4" style={{ background: 'rgba(9,9,11,.5)', border: '1px solid rgba(255,255,255,.1)' }}><div className="text-[10px] font-mono uppercase" style={{ color: T.textMuted }}>Booking approval rate</div><div className="mt-1 text-3xl font-serif font-bold" style={{ color: T.emerald }}>{approvalRate === null ? '—' : `${approvalRate}%`}</div><div className="text-xs" style={{ color: T.textSub }}>{bookings.length ? `${approvedBookings.length} of ${bookings.length} booking records approved` : 'No booking records yet'}</div></div></div>
      </div>
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Approved Revenue" value={`$${rev.toLocaleString()}`} sub={`${approvedBookings.length} approved booking${approvedBookings.length === 1 ? '' : 's'}`} icon={<Icons.dollar/>} color={T.emerald} glow={T.emeraldGlow}/>
        <StatCard label="Tickets Sold" value={tickets.toString()} sub={`${adminEventStore.list().reduce((total, event) => total + event.capacity, 0)} configured seats`} icon={<Icons.ticket/>} color={T.purple} glow={T.purpleGlow}/>
        <StatCard label="Customers" value={customers.toLocaleString()} sub="Unique customers in booking records" icon={<Icons.users/>} color={T.cyan} glow={T.cyanGlow}/>
        <StatCard label="Pending Reviews" value={pending.toString()} sub="Payments awaiting action" icon={<Icons.zap/>} color={T.gold} glow={T.goldGlow}/>
      </div>

      {/* Chart + Recent Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <RevenueChart/>
        </div>
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Recent Activity</div>
          <div className="space-y-3">
            {recentActivity.map((a, i) => (
              <div key={i} className="flex gap-3 items-start pb-3 border-b last:border-0" style={{ borderColor: T.border }}>
                <div className="text-base shrink-0 mt-0.5">{a.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs leading-relaxed" style={{ color: T.textSub }}>{a.text}</div>
                  <div className="text-[11px] font-mono mt-0.5" style={{ color: T.textMuted }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tier + Occupancy row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Tier breakdown */}
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Ticket Tier Breakdown</div>
          {tierStats.map(tier => (
            <div key={tier.name} className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: T.textSub }}>{tier.name}</span>
                <span className="font-mono" style={{ color: tier.color }}>{tier.sold}/{tier.cap}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${tier.cap ? Math.round((tier.sold / tier.cap) * 100) : 0}%`, background: tier.color }}/>
              </div>
            </div>
          ))}
        </div>

        {/* Payment methods */}
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Payment Methods</div>
          {/* Retired prototype distribution
          {[
            { method: '💳 Credit Card', pct: 52, color: T.emerald },
            { method: '🍎 Apple Pay', pct: 24, color: T.purple },
            { method: '🅿️ PayPal', pct: 12, color: T.cyan },
            { method: '₿ Crypto', pct: 7, color: T.gold },
            { method: '🏦 Bank Transfer', pct: 5, color: '#F472B6' },
          ].map(m => ( */}
          {paymentStats.map(m => (
            <div key={m.method} className="flex items-center gap-3 mb-3">
              <div className="text-sm w-28 text-xs" style={{ color: T.textSub }}>{m.method}</div>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }}/>
              </div>
              <div className="text-xs font-mono w-8 text-right" style={{ color: T.textMuted }}>{m.pct}%</div>
            </div>
          ))}
        </div>

        {/* Support queue */}
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Support Queue</div>
            <StatusBadge status="open"/>
          </div>
          {chats.slice(0, 4).map(chat => (
            <div key={chat.id} className="flex items-center gap-3 mb-3 pb-3 border-b last:border-0" style={{ borderColor: T.border }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: `${chat.color}20`, color: chat.color }}>
                {chat.avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold" style={{ color: T.text }}>{chat.customer}</div>
                <div className="text-[11px] truncate" style={{ color: T.textMuted }}>{chat.preview}</div>
              </div>
              <StatusBadge status={chat.priority}/>
            </div>
          ))}
          <button onClick={() => onNavigate('chat')} className="w-full text-xs py-2 rounded-xl mt-1" style={{ background: T.inputBg, color: T.textMuted, border: `1px solid ${T.border}` }}>
            View all conversations →
          </button>
        </div>

        <div className="rounded-2xl p-5 lg:col-span-1" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="flex items-center justify-between mb-3"><div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Audience by country</div><span className="w-2 h-2 rounded-full animate-pulse" style={{ background: T.emerald }}/></div>
          <p className="mb-3 text-[11px]" style={{ color: T.textMuted }}>Click a country for recent user activity.</p>
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {countries.map(item => <button key={item.country} onClick={() => setSelectedCountry(item)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/[.04]"><span>{item.flag}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold" style={{ color: T.text }}>{item.country}</span><span className="text-[10px] font-mono" style={{ color: T.textMuted }}>{item.currency}</span><span className="w-7 text-right text-xs font-bold" style={{ color: T.emerald }}>{item.users}</span></button>)}
          </div>
        </div>
      </div>
      {selectedCountry && <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4" onClick={() => setSelectedCountry(null)}><div className="w-full max-w-md rounded-3xl p-6 shadow-2xl" style={{ background: T.bg2, border: `1px solid ${T.cardBorder}` }} onClick={event => event.stopPropagation()}><div className="flex items-start justify-between"><div><div className="text-3xl">{selectedCountry.flag}</div><h2 className="mt-2 font-serif text-2xl font-bold" style={{ color: T.text }}>{selectedCountry.country}</h2><p className="text-sm" style={{ color: T.textMuted }}>{selectedCountry.currency} · {selectedCountry.users} recent users</p></div><button onClick={() => setSelectedCountry(null)} style={{ color: T.textMuted }}><Icons.x/></button></div><div className="mt-5 rounded-2xl p-4" style={{ background: T.bg3 }}><div className="text-xs font-mono uppercase" style={{ color: T.textMuted }}>Latest activity</div><div className="mt-2 text-sm" style={{ color: T.textSub }}>{selectedCountry.activity}</div></div><div className="mt-4 space-y-2">{customerList.filter(customer => customer.country === selectedCountry.country).slice(0, 5).map(customer => <div key={customer.id} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: T.inputBg }}><span className="text-xs font-semibold" style={{ color: T.text }}>{customer.name}</span><span className="text-[11px]" style={{ color: T.textMuted }}>{customer.lastSeen}</span></div>)}{!customerList.some(customer => customer.country === selectedCountry.country) && <div className="rounded-xl px-3 py-4 text-center text-xs" style={{ background: T.inputBg, color: T.textMuted }}>No recent identified users from this country.</div>}</div></div></div>}
    </div>
  )
}

// ─── Bookings Page ────────────────────────────────────────────────────────────
function BookingsPage({ show }: { show: (m: string) => void }) {
  const { role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useAdminRecoveryState<string | null>('bookings.selectedId', null, value => value === null || typeof value === 'string')
  const [filter, setFilter] = useAdminRecoveryState('bookings.filter', 'all', value => typeof value === 'string')
  const [search, setSearch] = useAdminRecoveryState('bookings.search', '', value => typeof value === 'string')
  const [bookings, setBookings] = useState<AdminBooking[]>(() => adminBookings())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const selected = bookings.find(booking => booking.id === selectedId) ?? null

  useEffect(() => {
    const routeId = location.pathname.startsWith('/admin/bookings/') ? decodeURIComponent(location.pathname.slice('/admin/bookings/'.length)) : null
    if (routeId && routeId !== selectedId) setSelectedId(routeId)
  }, [location.pathname, selectedId, setSelectedId])

  useEffect(() => {
    const refresh = () => setBookings(adminBookings())
    refresh()
    return ticketStore.subscribe(refresh)
  }, [])

  const FILTERS = ['all', 'confirmed', 'pending', 'refunded', 'cancelled']

  const filtered = bookings.filter(b => {
    if (filter !== 'all' && b.status !== filter) return false
    if (search && !b.customer.toLowerCase().includes(search.toLowerCase()) && !b.id.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const payIcon: Record<string, string> = { card: '💳', apple: '🍎', google: '🅶', paypal: '🅿️', crypto: '₿', cryptocurrency: '₿', bank: '🏦' }
  const renderPayIcon = (method: string) => {
    const url = getPaymentIcon(method === 'crypto' ? 'cryptocurrency' : method);
    if (url) return <img src={url} alt={method} className="w-5 h-5 object-contain inline-block" />;
    return <span className="text-base">{payIcon[method] || '💳'}</span>;
  }
  const deleteBooking = async () => {
    if (!selected || deleting || (role !== 'owner' && role !== 'admin')) return
    setDeleting(true)
    try {
      await softDeleteAdminRecord('booking', selected.id, role === 'owner')
      await ticketStore.hydrate()
      setBookings(adminBookings()); setSelectedId(null); setConfirmDelete(false); navigate('/admin/bookings')
      show('Booking archived and linked payment records reconciled.')
    } catch (error) { show(error instanceof Error ? error.message : 'The booking could not be deleted.') }
    finally { setDeleting(false) }
  }

  return (
    <div className="flex gap-5 h-full" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 flex-1 min-w-48 px-4 py-2.5 rounded-xl" style={{ background: T.cardSolid, border: `1px solid ${T.border}` }}>
            <Icons.search/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or booking ID..."
              className="flex-1 bg-transparent text-sm outline-none" style={{ color: T.text }}/>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className="text-xs px-3 py-2 rounded-xl capitalize transition-colors"
                style={{ background: filter === f ? 'rgba(0,255,136,0.1)' : T.inputBg, color: filter === f ? T.emerald : T.textMuted, border: `1px solid ${filter === f ? 'rgba(0,255,136,0.25)' : T.border}` }}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={() => show('Export started!')} className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl" style={{ background: T.inputBg, color: T.textMuted, border: `1px solid ${T.border}` }}>
            <Icons.download/> Export
          </button>
        </div>

        {/* Table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['Booking ID','Customer','Tier','Section','Qty','Total','Payment','Status',''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={b.id} className="border-b transition-colors cursor-pointer"
                    style={{ borderColor: T.border }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                    onClick={() => { setSelectedId(b.id); navigate(`/admin/bookings/${encodeURIComponent(b.id)}`) }}>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs" style={{ color: T.emerald }}>{b.id}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
                          style={{ background: `${['#00FF88','#8B5CF6','#F59E0B','#22D3EE','#F472B6','#22D3EE','#EF4444','#00FF88'][i % 8]}20`, color: ['#00FF88','#8B5CF6','#F59E0B','#22D3EE','#F472B6','#22D3EE','#EF4444','#00FF88'][i % 8] }}>
                          {b.avatar}
                        </div>
                        <div>
                          <div className="text-xs font-semibold" style={{ color: T.text }}>{b.customer}</div>
                          <div className="text-[11px]" style={{ color: T.textMuted }}>{b.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs" style={{ color: T.textSub }}>{b.tier}</td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs" style={{ color: T.cyan }}>Sec {b.section}</span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs text-center" style={{ color: T.textSub }}>{b.qty}×</td>
                    <td className="px-4 py-3.5 font-mono text-sm font-bold" style={{ color: T.text }}>${b.total.toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-base">{renderPayIcon(b.payment)}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={b.status}/></td>
                    <td className="px-4 py-3.5">
                      <button className="text-xs px-2 py-1 rounded-lg" style={{ background: T.inputBg, color: T.textMuted }}>
                        <Icons.eye/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t text-xs" style={{ borderColor: T.border }}>
            <span style={{ color: T.textMuted }}>Showing {filtered.length} of {bookings.length} bookings</span>
            <div className="flex gap-1">
              {[1,2,3,'...'].map((n,i) => (
                <button key={i} className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: n === 1 ? 'rgba(0,255,136,0.12)' : T.inputBg, color: n === 1 ? T.emerald : T.textMuted, border: `1px solid ${n === 1 ? 'rgba(0,255,136,0.3)' : T.border}` }}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <div className="w-80 shrink-0 rounded-2xl overflow-hidden flex flex-col" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}`, animation: 'panel-in 0.25s ease' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.border }}>
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Booking Details</div>
            <button onClick={() => { setSelectedId(null); navigate('/admin/bookings') }} style={{ color: T.textMuted }}><Icons.x/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Customer */}
            <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: T.bg3 }}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold" style={{ background: 'rgba(0,255,136,0.15)', color: T.emerald }}>
                {selected.avatar}
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: T.text }}>{selected.customer}</div>
                <div className="text-xs" style={{ color: T.textMuted }}>{selected.email}</div>
                <div className="text-xs font-mono mt-0.5" style={{ color: T.textMuted }}>{selected.phone}</div>
              </div>
            </div>
            {/* Booking info */}
            <div className="space-y-2 text-xs">
              {[['Booking ID', <span className="font-mono" style={{ color: T.emerald }}>{selected.id}</span>],
                ['Event', selected.event],
                ['Tier', selected.tier],
                ['Section', `Sec ${selected.section}`],
                ['Quantity', `${selected.qty} ticket${selected.qty > 1 ? 's' : ''}`],
                ['Date', selected.date],
                ['Country', selected.country],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between py-2 border-b" style={{ borderColor: T.border }}>
                  <span style={{ color: T.textMuted }}>{k}</span>
                  <span className="font-semibold text-right" style={{ color: T.textSub }}>{v}</span>
                </div>
              ))}
            </div>
            {/* Payment */}
            <div className="p-3 rounded-xl" style={{ background: T.bg3 }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>Payment</div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: T.textSub }}>Total Charged</span>
                <span className="font-serif text-lg font-bold" style={{ color: T.emerald }}>${selected.total.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs" style={{ color: T.textMuted }}>Method</span>
                <StatusBadge status={selected.status}/>
              </div>
            </div>
            {/* QR */}
            <div className="flex justify-center p-3 rounded-xl" style={{ background: T.bg3 }}>
              <div className="w-24 h-24 bg-white rounded-lg flex items-center justify-center">
                <svg viewBox="0 0 80 80" className="w-20 h-20">
                  {Array.from({length:5}, (_,r) => Array.from({length:5}, (_,c) => {
                    const isC = (r<2&&c<2)||(r<2&&c>2)||(r>2&&c<2)
                    return (Math.random()>0.35||isC) ? <rect key={`${r}-${c}`} x={c*16+2} y={r*16+2} width={13} height={13} fill="#09090B" rx="1"/> : null
                  }))}
                </svg>
              </div>
            </div>
          </div>
          {/* Actions */}
          <div className="p-4 border-t space-y-2" style={{ borderColor: T.border }}>
            <button onClick={() => show('Ticket resent!')} className="w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald, border: '1px solid rgba(0,255,136,0.2)' }}>
              📤 Resend Ticket
            </button>
            {selected.status !== 'refunded' && (
              <button onClick={() => show('Refund initiated!')} className="w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(139,92,246,0.1)', color: T.purple, border: '1px solid rgba(139,92,246,0.2)' }}>
                🔄 Issue Refund
              </button>
            )}
            {selected.status !== 'cancelled' && (
              <button onClick={() => show('Booking cancelled!')} className="w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.08)', color: T.red, border: '1px solid rgba(239,68,68,0.2)' }}>
                ✕ Cancel Booking
              </button>
            )}
            {(role === 'owner' || role === 'admin') && <button onClick={() => setConfirmDelete(true)} className="w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.08)', color: T.red, border: '1px solid rgba(239,68,68,0.2)' }}>🗑 Archive / Delete Test Booking</button>}
          </div>
          {confirmDelete && <div className="fixed inset-0 z-[150] grid place-items-center bg-black/80 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl p-6" style={{ background: T.bg2, border: '1px solid rgba(239,68,68,.25)' }}><div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: T.red }}>Archive booking</div><h2 className="mt-2 font-serif text-xl font-bold" style={{ color: T.text }}>{selected.id}</h2><div className="mt-4 space-y-1 text-sm" style={{ color: T.textSub }}><p>{selected.customer} · {selected.email}</p><p>{selected.event} · {selected.tier}</p><p>${selected.total.toLocaleString()} · {selected.status}</p></div><p className="mt-4 text-sm" style={{ color: T.textMuted }}>The booking will leave normal dashboards. Linked payments, tickets, proofs, transfers, email queue entries, and recovery records are handled in one protected transaction. Non-test records require owner confirmation.</p><div className="mt-6 flex justify-end gap-2"><button disabled={deleting} onClick={() => setConfirmDelete(false)} className="rounded-xl px-4 py-2 text-xs" style={{ background: T.inputBg, color: T.text }}>Cancel</button><button disabled={deleting || role !== 'owner'} onClick={deleteBooking} className="rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-40" style={{ background: T.red, color: '#fff' }}>{deleting ? 'Deleting…' : 'Confirm archive'}</button></div></div></div>}
        </div>
      )}
    </div>
  )
}

// ─── Events Page ──────────────────────────────────────────────────────────────
type EWizStep = 'info' | 'packages' | 'seats' | 'payments' | 'publish'
type PackageDef = { name: string; color: string; seatCount: number; posFrom: number; posTo: number; taken: number[] }

function EventPublishedScreen({ form, show, onDone }: { form: any; show: (m:string)=>void; onDone: ()=>void }) {
  const link = `https://yourdomain.com/e/ABX72P`; const qr = Array.from({length: 121},(_,i)=>(i*7+i%5)%3!==0)
  return <div className="max-w-5xl mx-auto space-y-5" style={{animation:'fade-in-up .35s ease'}}><div className="rounded-3xl overflow-hidden" style={{background:T.cardSolid,border:'1px solid rgba(0,255,136,.3)'}}><div className="p-8 md:p-10 text-center" style={{background:'radial-gradient(circle at 50% 0,rgba(0,255,136,.15),transparent 55%)'}}><div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl mb-4" style={{background:'rgba(0,255,136,.15)'}}>🎉</div><div className="font-serif text-3xl font-bold" style={{color:T.text}}>Event Successfully Published</div><div className="text-sm mt-2" style={{color:T.textSub}}>Your booking page is live and ready to share.</div></div><div className="grid md:grid-cols-[1.3fr_.7fr] gap-6 p-6 md:p-8"><div>{form.heroImage&&<img src={form.heroImage} className="w-full h-48 rounded-2xl object-cover mb-5"/>}<div className="font-serif text-2xl font-bold" style={{color:T.text}}>{form.showName || 'Untitled Event'}</div><div className="grid grid-cols-2 gap-3 mt-5">{[['Event ID','ABX72P'],['Status','Live'],['Date & Time',form.dateTime||'To be announced'],['Total Seats',form.totalSeats],['Seats Available',form.totalSeats],['Event URL',link]].map(([l,v])=><div key={l as string} className="p-3 rounded-xl" style={{background:T.bg3}}><div className="text-[10px] uppercase font-mono" style={{color:T.textMuted}}>{l}</div><div className="text-xs font-semibold mt-1 truncate" style={{color:l==='Status'?T.emerald:T.text}}>{v}</div></div>)}</div></div><div className="rounded-2xl p-5 flex flex-col items-center" style={{background:T.bg3}}><div className="p-3 bg-white rounded-xl grid grid-cols-11 gap-px">{qr.map((on,i)=><span key={i} className="w-2 h-2" style={{background:on?'#09090B':'white'}}/>)}</div><div className="text-xs font-mono mt-3" style={{color:T.textMuted}}>Scan to book directly</div><button onClick={()=>show('QR downloaded as PNG')} className="mt-3 text-xs" style={{color:T.cyan}}>Download PNG · SVG · Print poster</button></div></div><div className="p-6 border-t" style={{borderColor:T.border}}><div className="grid sm:grid-cols-3 gap-3">{[['Copy Link','Link copied'],['Generate QR Code','QR code generated'],['Share Link','Share sheet opened'],['Edit Event','Edit event opened'],['Preview Booking Page','Booking page preview opened'],['View Analytics','Analytics opened']].map(([l,m])=><button key={l} onClick={()=>show(m)} className="py-3 rounded-xl text-sm font-semibold" style={{background:l==='Copy Link'?'linear-gradient(135deg,#00FF88,#00C866)':T.inputBg,color:l==='Copy Link'?T.bg:T.textSub}}>{l}</button>)}</div><button onClick={onDone} className="w-full mt-4 text-xs" style={{color:T.textMuted}}>Back to event management</button></div></div></div>
}
function LegacyEventsPage({ show, createSignal = 0 }: { show: (m: string) => void; createSignal?: number }) {
  const [view, setView] = useState<'list' | 'create' | 'success'>('list')
  const [wizStep, setWizStep] = useState<EWizStep>('info')

  const [form, setForm] = useState({
    showName: '', hostName: '', artists: '', totalSeats: 100, paymentMethods: ['apple_gift_card', 'paypal'] as string[], venue: '', googleMapAddress: '', eventAddress: '', dateTime: '', heroImage: '', eventFacts: '', importantInfo: '', reviews: '', faqs: '',
  })
  const [schedule, setSchedule] = useState([{ time: '6:00 PM', title: 'Doors Open', detail: 'Security check and wristband collection begins.' }, { time: '8:00 PM', title: 'Show Starts', detail: 'Main performance begins.' }])
  const [packages, setPackages] = useState<PackageDef[]>([
    { name: 'Regular', color: '#71717A', seatCount: 60, posFrom: 1, posTo: 60, taken: [] },
    { name: 'VIP', color: '#00FF88', seatCount: 30, posFrom: 61, posTo: 90, taken: [] },
    { name: 'VVIP', color: '#F59E0B', seatCount: 10, posFrom: 91, posTo: 100, taken: [] },
  ])

  const [events, setEvents] = useState<ManagedEvent[]>(() => adminEventStore.list())
  const [editingId, setEditingId] = useState<string | null>(null)
  const resetForm = () => { setForm({ showName: '', hostName: '', artists: '', totalSeats: 100, paymentMethods: ['apple_gift_card', 'paypal'], venue: '', googleMapAddress: '', eventAddress: '', dateTime: '', heroImage: '', eventFacts: '', importantInfo: '', reviews: '', faqs: '' }); setSchedule([{ time: '6:00 PM', title: 'Doors Open', detail: 'Security check and wristband collection begins.' }, { time: '8:00 PM', title: 'Show Starts', detail: 'Main performance begins.' }]); setEditingId(null) }
  const beginCreate = () => { resetForm(); setWizStep('info'); setView('create') }
  const beginEdit = (event: ManagedEvent) => { setEditingId(event.id); setForm(current => ({ ...current, showName: event.title, venue: event.venue, dateTime: event.date, heroImage: event.banner ?? '', totalSeats: event.capacity })); setSchedule(event.schedule); setWizStep('info'); setView('create') }
  const publishEvent = () => { const existing = editingId ? events.find(event => event.id === editingId) : undefined; const id = editingId ?? crypto.randomUUID(); adminEventStore.save({ id, title: form.showName || 'Untitled event', venue: form.venue || 'Venue to be announced', date: form.dateTime || new Date().toLocaleString(), banner: form.heroImage, sold: existing?.sold ?? 0, capacity: form.totalSeats, revenue: existing?.revenue ?? 0, status: 'live', schedule }); setEvents(adminEventStore.list()); setView('success'); setWizStep('info'); setEditingId(null) }
  const copyEventLink = async (event: ManagedEvent) => { const link = `${window.location.origin}/events/${event.id}`; try { await navigator.clipboard.writeText(link); show('Show link copied') } catch { show(link) } }
  useEffect(() => { if (createSignal > 0) beginCreate() }, [createSignal])
  const allSeats = Array.from({ length: form.totalSeats }, (_, i) => i + 1)
  const getSeatPkg = (n: number) => packages.find(p => n >= p.posFrom && n <= p.posTo)

  const toggleSeatTaken = (pkgIdx: number, seat: number) => {
    setPackages(prev => prev.map((p, i) => {
      if (i !== pkgIdx) return p
      const taken = p.taken.includes(seat) ? p.taken.filter(s => s !== seat) : [...p.taken, seat]
      return { ...p, taken }
    }))
  }

  if (view === 'success') return <EventPublishedScreen form={form} show={show} onDone={() => { setEvents(adminEventStore.list()); setView('list') }} />
  if (view === 'create') return (
    <div className="space-y-5 max-w-3xl" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="flex items-center gap-3">
        <button onClick={() => { setView('list'); setWizStep('info') }} className="p-2 rounded-xl" style={{ background: T.inputBg, color: T.textMuted, border: `1px solid ${T.border}` }}>
          <Icons.chevronLeft/>
        </button>
        <div>
          <div className="font-serif text-xl font-bold" style={{ color: T.text }}>Create New Event</div>
          <div className="text-xs" style={{ color: T.textMuted }}>Fill in event details to set up your booking page</div>
        </div>
      </div>

      {/* Wizard steps indicator */}
      <div className="flex items-center gap-2">
        {([['info','Event Information'],['packages','Packages'],['seats','Seat Configuration'],['payments','Payment Methods'],['publish','Publish']] as [EWizStep,string][]).map(([s, label], i) => {
          const steps: EWizStep[] = ['info','packages','seats','payments','publish']
          const idx = steps.indexOf(wizStep)
          const done = steps.indexOf(s) < idx
          const active = s === wizStep
          return (
            <div key={s} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: done ? T.emerald : active ? 'rgba(0,255,136,0.15)' : T.inputBg, border: `1.5px solid ${done||active ? T.emerald : T.border}`, color: done ? '#09090B' : active ? T.emerald : T.textMuted }}>
                  {done ? '✓' : i+1}
                </div>
                <span className="text-xs hidden sm:inline" style={{ color: active ? T.text : T.textMuted }}>{label}</span>
              </div>
              {i < 2 && <div className="w-8 h-px" style={{ background: done ? T.emerald : T.border }}/>}
            </div>
          )
        })}
      </div>

      {/* Step: Show Info */}
      {wizStep === 'info' && (
        <div className="rounded-2xl p-6 space-y-4" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>Show Information</div>
          {[
            { label: 'Show Name', key: 'showName', placeholder: "e.g. Drake — It's All A Blur Tour", required: true },
            { label: 'Host Name', key: 'hostName', placeholder: 'e.g. Apex Events Inc.', required: true },
            { label: 'Performing Artists / Celebrities', key: 'artists', placeholder: 'e.g. Drake ft. 21 Savage (optional)', required: false },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>
                {f.label} {f.required && <span style={{ color: T.red }}>*</span>}
              </label>
              <input className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                placeholder={f.placeholder} value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}/>
            </div>
          ))}
          <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: T.border }}>
            {[{label:'Date & Time',key:'dateTime',placeholder:'Sep 20, 2026 · 8:00 PM'}, {label:'Venue',key:'venue',placeholder:'Madison Square Garden'}, {label:'Google Maps Address',key:'googleMapAddress',placeholder:'Paste Google Maps address or URL'}, {label:'Public Event Address',key:'eventAddress',placeholder:'Street, city, country'}, {label:'Hero / Show Banner URL',key:'heroImage',placeholder:'Media Center asset URL'}].map(f => <div key={f.key} className={f.key==='googleMapAddress'||f.key==='heroImage'?'sm:col-span-2':''}><label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{color:T.textMuted}}>{f.label}</label><input value={(form as any)[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} placeholder={f.placeholder} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text}}/>{f.key==='heroImage'&&<button onClick={()=>show('Media Center selector opened')} className="mt-2 text-xs" style={{color:T.cyan}}>Choose existing image from Media Center</button>}</div>)}
          </div>
          <div className="grid sm:grid-cols-2 gap-4"><div><label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{color:T.textMuted}}>Event Facts</label><textarea value={form.eventFacts} onChange={e=>setForm(p=>({...p,eventFacts:e.target.value}))} placeholder="Age limit, dress code, doors open…" className="w-full h-24 p-3 rounded-xl text-sm outline-none" style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text}}/></div><div><label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{color:T.textMuted}}>Important Information</label><textarea value={form.importantInfo} onChange={e=>setForm(p=>({...p,importantInfo:e.target.value}))} placeholder="Refunds, access, security, parking…" className="w-full h-24 p-3 rounded-xl text-sm outline-none" style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text}}/></div><div><label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{color:T.textMuted}}>Customer Reviews</label><textarea value={form.reviews} onChange={e=>setForm(p=>({...p,reviews:e.target.value}))} placeholder="Edit default reviews" className="w-full h-20 p-3 rounded-xl text-sm outline-none" style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text}}/></div><div><label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{color:T.textMuted}}>FAQs</label><textarea value={form.faqs} onChange={e=>setForm(p=>({...p,faqs:e.target.value}))} placeholder="Edit default FAQ entries" className="w-full h-20 p-3 rounded-xl text-sm outline-none" style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text}}/></div></div>          <div className="rounded-2xl p-4 space-y-3" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
            <div className="flex items-center justify-between gap-3"><div><div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Show Schedule</div><div className="text-xs mt-1" style={{ color: T.textSub }}>This schedule appears on the booking page.</div></div><button type="button" onClick={() => setSchedule(items => [...items, { time: '', title: '', detail: '' }])} className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald }}>+ Add item</button></div>
            {schedule.map((item, index) => <div key={`${item.time}-${index}`} className="grid sm:grid-cols-[110px_1fr_1fr_auto] gap-2"><input value={item.time} onChange={event => setSchedule(items => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, time: event.target.value } : entry))} placeholder="6:00 PM" aria-label="Schedule time" className="px-3 py-2 rounded-xl text-xs outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/><input value={item.title} onChange={event => setSchedule(items => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, title: event.target.value } : entry))} placeholder="Schedule title" aria-label="Schedule title" className="px-3 py-2 rounded-xl text-xs outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/><input value={item.detail} onChange={event => setSchedule(items => items.map((entry, itemIndex) => itemIndex === index ? { ...entry, detail: event.target.value } : entry))} placeholder="Short description" aria-label="Schedule description" className="px-3 py-2 rounded-xl text-xs outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/><button type="button" aria-label="Remove schedule item" disabled={schedule.length === 1} onClick={() => setSchedule(items => items.filter((_entry, itemIndex) => itemIndex !== index))} className="px-3 py-2 rounded-xl text-xs disabled:opacity-30" style={{ background: 'rgba(239,68,68,0.1)', color: T.red }}>Remove</button></div>)}
          </div>          <button onClick={() => setWizStep('packages')} disabled={!form.showName || !form.hostName}
            className="px-8 py-3 rounded-2xl font-bold text-sm"
            style={{ background: form.showName && form.hostName ? 'linear-gradient(135deg,#00FF88,#00C866)' : T.inputBg, color: form.showName && form.hostName ? '#09090B' : T.textMuted }}>
            Continue to Packages →
          </button>
        </div>
      )}

      {/* Step: Seat Arrangement */}
      {wizStep === 'seats' && (
        <div className="rounded-2xl p-6 space-y-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Total Seat Count</div>
          <p className="text-sm" style={{ color: T.textSub }}>Enter the total number of seats. The system will generate seat numbers (001, 002, …) automatically.</p>
          <div className="flex items-center gap-4">
            <input type="number" min={1} max={10000} className="w-40 px-4 py-3 rounded-xl text-sm font-mono outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
              value={form.totalSeats} onChange={e => setForm(p => ({ ...p, totalSeats: Math.max(1, parseInt(e.target.value)||1) }))}/>
            <span className="text-sm" style={{ color: T.textMuted }}>seats → Seat 001 to Seat {String(form.totalSeats).padStart(3,'0')}</span>
          </div>
          {/* Preview first few */}
          <div>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>Preview</div>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: Math.min(20, form.totalSeats) }, (_, i) => (
                <div key={i} className="w-12 h-10 rounded-lg flex items-center justify-center text-[10px] font-mono" style={{ background: T.bg3, border: `1px solid ${T.border}`, color: T.textMuted }}>
                  {String(i+1).padStart(3,'0')}
                </div>
              ))}
              {form.totalSeats > 20 && <div className="w-12 h-10 rounded-lg flex items-center justify-center text-[10px]" style={{ background: T.bg3, border: `1px dashed ${T.border}`, color: T.textMuted }}>+{form.totalSeats-20}</div>}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setWizStep('info')} className="px-6 py-3 rounded-2xl text-sm" style={{ background: T.inputBg, color: T.textSub }}>← Back</button>
            <button onClick={() => setWizStep('packages')} className="px-8 py-3 rounded-2xl font-bold text-sm" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
              Continue to Packages →
            </button>
          </div>
        </div>
      )}

            {/* Step: Packages */}
      {wizStep === 'packages' && (
        <div className="space-y-6" style={{ animation: 'fade-in-up 0.25s ease' }}>
          {packages.map((pkg, pkgIdx) => (
            <div key={pkgIdx} className="rounded-2xl p-5 space-y-4" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center justify-between">
                <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Package {pkgIdx + 1}</div>
                <button type="button" onClick={() => setPackages(prev => prev.filter((_, i) => i !== pkgIdx))} className="text-xs" style={{ color: T.red }}>Remove</button>
              </div>
              <div className="space-y-3">
                {['Name','Description'].map(key => (
                  <div key={key}>
                    <label className="text-xs font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>{key}</label>
                    <input className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                      placeholder={key} value={(pkg as any)[key.toLowerCase()]} onChange={e => setPackages(prev => prev.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: e.target.value} : p))}/>
                  </div>
                ))}
              </div>
              <div className="space-y-3 mt-4">
                {['Price','Capacity'].map(key => (
                  <div key={key}>
                    <label className="text-xs font-mono uppercase tracking-wider block mb-1" style={{ color: T.textMuted }}>{key}</label>
                    <input className="w-full px-3 py-2 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                      type="number" value={(pkg as any)[key.toLowerCase()]} onChange={e => setPackages(prev => prev.map((p,i) => i===pkgIdx ? {...p, [key.toLowerCase()]: parseInt(e.target.value)||0} : p))}/>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>Mark Taken Seats — Seats {pkg.posFrom}–{pkg.posTo}</div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {Array.from({ length: pkg.posTo - pkg.posFrom + 1 }, (_, i) => pkg.posFrom + i).map(n => {
                    const isTaken = pkg.taken.includes(n);
                    return (
                      <button type="button" key={n} onClick={() => toggleSeatTaken(pkgIdx, n)}
                        className="w-10 h-9 rounded-lg text-[10px] font-mono transition-all"
                        style={{ background: isTaken ? 'rgba(239,68,68,0.2)' : T.bg3, border: `1px solid ${isTaken ? '#EF4444' : T.border}`, color: isTaken ? '#EF4444' : T.textMuted }}>
                        {String(n).padStart(3,'0')}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <button type="button" onClick={() => setWizStep('info')} className="px-6 py-3 rounded-2xl text-sm" style={{ background: T.inputBg, color: T.textSub }}>← Back</button>
            <button type="button" onClick={() => setWizStep('payments')} className="px-8 py-3 rounded-2xl font-bold text-sm" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
              Continue to Payments →
            </button>
          </div>
        </div>
      )}
      {wizStep === 'payments' && <div className="rounded-2xl p-6 space-y-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div><div className="text-xs font-mono uppercase tracking-wider" style={{color:T.textMuted}}>Payment Methods</div><p className="text-sm mt-2" style={{color:T.textSub}}>Select the methods available to attendees. Bank transfers expire in 30 minutes and are reviewed manually.</p></div><div className="grid sm:grid-cols-2 gap-3">{[['apple_gift_card','Apple Gift Card'],['paypal','PayPal'],['bitcoin','Bitcoin'],['cash_app','Cash App'],['bank_transfer','Bank Transfer']].map(([id,label]) => { const enabled=form.paymentMethods.includes(id); return <button type="button" key={id} onClick={()=>setForm(p=>({...p,paymentMethods:enabled?p.paymentMethods.filter(x=>x!==id):[...p.paymentMethods,id]}))} className="p-4 rounded-xl flex items-center justify-between text-left" style={{background:enabled?'rgba(0,255,136,.08)':T.inputBg,border:`1px solid ${enabled?'rgba(0,255,136,.35)':T.border}`,color:enabled?T.emerald:T.textSub}}><span className="text-sm font-semibold">{label}</span><span>{enabled?'✓':'+'}</span></button>})}</div><div className="flex gap-3"><button onClick={()=>setWizStep('seats')} className="px-6 py-3 rounded-2xl text-sm" style={{background:T.inputBg,color:T.textSub}}>â† Back</button><button disabled={!form.paymentMethods.length} onClick={()=>setWizStep('publish')} className="px-8 py-3 rounded-2xl font-bold text-sm" style={{background:'linear-gradient(135deg,#00FF88,#00C866)',color:'#09090B'}}>Continue to Publish â†’</button></div></div>}
      {wizStep === 'publish' && <div className="rounded-2xl p-6 space-y-5" style={{background:T.cardSolid,border:`1px solid ${T.cardBorder}`}}><div className="text-xs font-mono uppercase tracking-wider" style={{color:T.textMuted}}>Publish Review</div><div className="grid sm:grid-cols-2 gap-3">{[['Event',form.showName],['Venue',form.venue||'Not set'],['Total seats',String(form.totalSeats)],['Payment methods',form.paymentMethods.join(', ')||'None']].map(([label,value])=><div key={label} className="p-4 rounded-xl" style={{background:T.bg3}}><div className="text-[10px] uppercase font-mono" style={{color:T.textMuted}}>{label}</div><div className="text-sm font-semibold mt-1" style={{color:T.text}}>{value}</div></div>)}</div><div className="flex gap-3"><button onClick={()=>setWizStep('payments')} className="px-6 py-3 rounded-2xl text-sm" style={{background:T.inputBg,color:T.textSub}}>â† Back</button><button onClick={publishEvent} className="px-8 py-3 rounded-2xl font-bold text-sm" style={{background:'linear-gradient(135deg,#00FF88,#00C866)',color:'#09090B'}}>ðŸš€ Publish Event</button></div></div>}
    </div>
  )

  return (
    <div className="space-y-5" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="flex items-center justify-between">
        <div className="text-sm" style={{ color: T.textSub }}>{events.length} events</div>
        <button onClick={beginCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
          <Icons.plus/> Create Event
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {events.map(ev => (
          <div key={ev.id} className="rounded-2xl overflow-hidden group transition-all duration-300"
            style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}
            onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(0,255,136,0.25)'}
            onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = T.cardBorder}>
            <div className="relative h-44 overflow-hidden">
              <img src={ev.banner || 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=300&fit=crop&auto=format'} alt={ev.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"/>
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,transparent 40%,rgba(9,9,11,0.9))' }}/>
              <div className="absolute top-3 left-3"><StatusBadge status={ev.status}/></div>
              <div className="absolute top-3 right-3 flex gap-1.5">
                <button onClick={() => beginEdit(ev)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'rgba(0,0,0,0.6)', color: T.text, backdropFilter: 'blur(8px)' }}>Edit</button><button onClick={() => void copyEventLink(ev)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'rgba(0,0,0,0.6)', color: T.text, backdropFilter: 'blur(8px)' }}>Copy link</button>
              </div>
            </div>
            <div className="p-5">
              <div className="font-serif text-lg font-bold mb-1" style={{ color: T.text }}>{ev.title}</div>
              <div className="text-xs mb-4" style={{ color: T.textSub }}>📍 {ev.venue} · 📅 {ev.date}</div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[['Sold', `${ev.sold}/${ev.capacity}`, T.emerald],['Revenue', `$${(ev.revenue/1000).toFixed(0)}k`, T.gold],['Fill', `${ev.capacity > 0 ? Math.round(ev.sold/ev.capacity*100) : 0}%`, T.cyan]].map(([l,v,c]) => (
                  <div key={l as string} className="text-center py-2 rounded-xl" style={{ background: T.bg3 }}>
                    <div className="font-mono text-sm font-bold" style={{ color: c as string }}>{v}</div>
                    <div className="text-[10px] font-mono uppercase mt-0.5" style={{ color: T.textMuted }}>{l}</div>
                  </div>
                ))}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: T.border }}>
                <div className="h-full rounded-full" style={{ width: `${ev.capacity > 0 ? (ev.sold/ev.capacity)*100 : 0}%`, background: 'linear-gradient(90deg,#00FF88,#22D3EE)' }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Customers Page ───────────────────────────────────────────────────────────
function MediaCenterPage({ show }: { show: (m: string) => void }) {
  const [tab, setTab] = useState('Payment Proofs'); const [filter, setFilter] = useState('All'); const [selected, setSelected] = useState<string | null>(null)
  const assets = [
    { id:'p1', type:'Payment Proofs', customer:'James Park', event:'Drake — MSG', method:'Bank Transfer', status:'pending', booking:'APEX-9W1KBJ', date:'Today, 2:18 PM', image:'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=600&h=420&fit=crop&auto=format' },
    { id:'p2', type:'Payment Proofs', customer:'Amelia Torres', event:'Drake — MSG', method:'PayPal', status:'pending', booking:'APEX-5L4TYZ', date:'Today, 12:43 PM', image:'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=420&fit=crop&auto=format' },
    { id:'e1', type:'Event Images', customer:'Apex Events', event:'Drake — MSG', method:'Hero banner', status:'approved', booking:'ASSET-001', date:'Jul 14, 2025', image:'https://images.unsplash.com/photo-1577648884063-1d3d1477b8a7?w=600&h=420&fit=crop&auto=format' },
    { id:'t1', type:'Ticket Assets', customer:'Apex Events', event:'All events', method:'Ticket background', status:'approved', booking:'ASSET-002', date:'Jul 12, 2025', image:'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=600&h=420&fit=crop&auto=format' },
  ]; const current=assets.find(x=>x.id===selected); const visible=assets.filter(x=>(tab==='All'||x.type===tab)&&(filter==='All'||x.status===filter))
  return <div className="space-y-5"><div className="rounded-2xl p-4 flex flex-wrap gap-3 items-center" style={{background:'linear-gradient(135deg,rgba(245,158,11,.13),rgba(139,92,246,.08))',border:'1px solid rgba(245,158,11,.25)'}}><div className="text-lg">✓</div><div className="flex-1"><div className="font-semibold text-sm" style={{color:T.text}}>Verification Queue</div><div className="text-xs" style={{color:T.textMuted}}>A single visual workflow for payment proof reviews</div></div>{['Pending Proofs (18)','Gift Cards (9)','Bank Transfers (6)','Bitcoin (2)','PayPal (1)'].map(q=><button key={q} onClick={()=>setFilter('pending')} className="px-3 py-2 rounded-xl text-xs" style={{background:T.inputBg,color:T.gold}}>{q}</button>)}</div><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[['Storage Used','2.3 GB / 10 GB'],['Images','1,284'],['PDFs','96'],['Payment Proofs','18']].map(([l,v])=><div key={l} className="rounded-2xl p-4" style={{background:T.cardSolid,border:`1px solid ${T.cardBorder}`}}><div className="text-xl font-serif font-bold" style={{color:T.text}}>{v}</div><div className="text-[10px] font-mono uppercase" style={{color:T.textMuted}}>{l}</div></div>)}</div><div className="flex flex-wrap gap-2">{['Payment Proofs','Event Images','Ticket Assets','All'].map(x=><button key={x} onClick={()=>setTab(x)} className="px-3 py-2 rounded-xl text-xs" style={{background:tab===x?'rgba(0,255,136,.12)':'transparent',color:tab===x?T.emerald:T.textMuted}}>{x}</button>)}<div className="flex-1"/><button onClick={()=>show('Upload panel opened')} className="px-4 py-2 rounded-xl text-xs font-bold" style={{background:T.emerald,color:T.bg}}>+ Upload media</button></div><div className="flex gap-2"><input placeholder="Search customer, event, booking ID…" className="px-3 py-2 rounded-xl text-xs outline-none" style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text}}/>{['All','pending','approved','rejected'].map(x=><button key={x} onClick={()=>setFilter(x)} className="text-xs capitalize" style={{color:filter===x?T.emerald:T.textMuted}}>{x}</button>)}<button onClick={()=>show('Bulk selection enabled')} className="ml-auto text-xs" style={{color:T.cyan}}>Bulk actions</button></div><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">{visible.map(a=><button key={a.id} onClick={()=>setSelected(a.id)} className="text-left overflow-hidden rounded-2xl" style={{background:T.cardSolid,border:`1px solid ${T.cardBorder}`}}><img src={a.image} className="w-full h-36 object-cover"/><div className="p-3"><div className="flex justify-between"><span className="text-xs font-semibold" style={{color:T.text}}>{a.customer}</span><StatusBadge status={a.status}/></div><div className="text-[11px] mt-2" style={{color:T.textSub}}>{a.event}</div><div className="text-[10px] mt-1" style={{color:T.textMuted}}>{a.method} · {a.booking}</div></div></button>)}</div>{current&&<div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,.75)'}} onClick={()=>setSelected(null)}><div className="w-full max-w-xl rounded-3xl overflow-hidden" style={{background:T.bg2,border:`1px solid ${T.cardBorder}`}} onClick={e=>e.stopPropagation()}><img src={current.image} className="w-full h-64 object-cover"/><div className="p-5"><div className="flex justify-between"><div><div className="font-serif text-xl font-bold" style={{color:T.text}}>{current.customer}</div><div className="text-xs" style={{color:T.textMuted}}>{current.booking} · linked booking → payment → media</div></div><button onClick={()=>setSelected(null)}><Icons.x/></button></div><textarea placeholder="Leave internal note…" className="w-full mt-4 p-3 rounded-xl text-xs" style={{background:T.inputBg,border:`1px solid ${T.border}`,color:T.text}}/><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={()=>show('Payment approved')} className="py-2.5 rounded-xl text-xs font-bold" style={{background:T.emerald,color:T.bg}}>Approve payment</button><button onClick={()=>show('Payment rejected')} className="py-2.5 rounded-xl text-xs" style={{background:'rgba(239,68,68,.12)',color:T.red}}>Reject payment</button><button onClick={()=>show('Download started')} className="py-2.5 rounded-xl text-xs" style={{background:T.inputBg,color:T.textSub}}>Download</button><button onClick={()=>show('Booking opened')} className="py-2.5 rounded-xl text-xs" style={{background:T.inputBg,color:T.textSub}}>View booking</button></div></div></div></div>}</div>
}
function CustomersPage({ show }: { show: (m: string) => void }) {
  const { role } = useAuth()
  const [selected, setSelected] = useState<AdminCustomer | null>(null)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(false)

  const deleteCustomer = async () => {
    if (!selected || deleting || (role !== 'owner' && role !== 'admin')) return
    if (!window.confirm(`Delete customer ${selected.name} (${selected.email})?\n\nDeletion is blocked when a retained booking, payment, ticket, or conversation depends on this customer.`)) return
    setDeleting(true)
    try { await softDeleteAdminRecord('customer', selected.id, role === 'owner'); setSelected(null); show('Customer deleted.') }
    catch (error) { show(error instanceof Error ? error.message : 'The customer could not be deleted.') }
    finally { setDeleting(false) }
  }

  const filtered = adminCustomers().filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex gap-5" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 px-4 py-2.5 rounded-xl" style={{ background: T.cardSolid, border: `1px solid ${T.border}` }}>
            <Icons.search/>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customers..."
              className="flex-1 bg-transparent text-sm outline-none" style={{ color: T.text }}/>
          </div>
          <button onClick={() => show('Export customers...')} className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl" style={{ background: T.inputBg, color: T.textMuted, border: `1px solid ${T.border}` }}>
            <Icons.download/> Export
          </button>
        </div>
        <div className="rounded-2xl overflow-hidden" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                {['Customer','Bookings','Total Spent','Status','Tags',''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} className="border-b cursor-pointer transition-colors" style={{ borderColor: T.border }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}
                  onClick={() => setSelected(c)}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0" style={{ background: `${c.color}20`, color: c.color }}>
                        {c.avatar}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold" style={{ color: T.text }}>{c.name}</span>
                          {c.vip && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: T.goldGlow, color: T.gold }}>VIP</span>}
                        </div>
                        <div className="text-xs" style={{ color: T.textMuted }}>{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-sm text-center" style={{ color: T.textSub }}>{c.bookings}</td>
                  <td className="px-4 py-3.5 font-mono text-sm font-bold" style={{ color: T.emerald }}>${c.spent.toLocaleString()}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={c.status}/></td>
                  <td className="px-4 py-3.5">
                    <div className="flex gap-1 flex-wrap">
                      {c.tags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: T.inputBg, color: T.textMuted }}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <button className="px-2.5 py-1 rounded-lg text-xs" style={{ background: T.inputBg, color: T.textMuted }}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="w-72 shrink-0 rounded-2xl overflow-hidden" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}`, animation: 'panel-in 0.25s ease' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.border }}>
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Customer Profile</div>
            <button onClick={() => setSelected(null)} style={{ color: T.textMuted }}><Icons.x/></button>
          </div>
          <div className="p-4 space-y-4">
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold mx-auto mb-3" style={{ background: `${selected.color}20`, color: selected.color }}>
                {selected.avatar}
              </div>
              <div className="font-serif text-lg font-bold" style={{ color: T.text }}>{selected.name}</div>
              <div className="text-xs" style={{ color: T.textMuted }}>{selected.email}</div>
              {selected.vip && <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full font-bold" style={{ background: T.goldGlow, color: T.gold }}>⭐ VIP Member</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['Bookings', selected.bookings.toString(), T.emerald],['Spent', `$${(selected.spent/1000).toFixed(1)}k`, T.gold],['Joined', selected.joined, T.textSub],['Last Seen', selected.lastSeen, T.cyan]].map(([l,v,c]) => (
                <div key={l as string} className="p-3 rounded-xl text-center" style={{ background: T.bg3 }}>
                  <div className="font-bold text-sm" style={{ color: c as string }}>{v}</div>
                  <div className="text-[10px] font-mono uppercase" style={{ color: T.textMuted }}>{l}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {selected.tags.map(t => <span key={t} className="text-xs px-2 py-1 rounded-lg" style={{ background: T.inputBg, color: T.textSub }}>{t}</span>)}
                <button onClick={() => show('Add tag...')} className="text-xs px-2 py-1 rounded-lg" style={{ background: T.inputBg, color: T.textMuted, border: `1px dashed ${T.border}` }}>+ Add</button>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => show('Opening chat...')} className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald, border: '1px solid rgba(0,255,136,0.2)' }}>
                💬 Message Customer
              </button>
              <button onClick={() => show('User banned!')} className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.08)', color: T.red, border: '1px solid rgba(239,68,68,0.15)' }}>
                🚫 Blacklist User
              </button>
              {(role === 'owner' || role === 'admin') && <button disabled={deleting} onClick={() => void deleteCustomer()} className="w-full py-2 rounded-xl text-xs font-semibold disabled:opacity-40" style={{ background: 'rgba(239,68,68,0.08)', color: T.red, border: '1px solid rgba(239,68,68,0.2)' }}>🗑 {deleting ? 'Deleting…' : 'Delete Customer'}</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Payments Page ────────────────────────────────────────────────────────────
function PaymentsPage({ show }: { show: (m: string) => void }) {
  const [mainTab, setMainTab] = useState<'transactions'|'setup'>('transactions')
  const [tab, setTab] = useState('all')
  const [selected, setSelected] = useState<AdminPayment | null>(null)
  const [payDetails, setPayDetails] = useState({
    paypal: '', cashapp: '', bitcoin: '',
    bank_name: '', bank_account: '', bank_routing: '', bank_holder: '',
    gift_instructions: 'Purchase an Apple Gift Card from any Apple Store or apple.com. Scratch the back to reveal the code, then take a clear photo of the card showing the code and upload it below as proof of payment. Our team will verify within 10–20 minutes.',
    cryptocurrencies: {
      bitcoin: { enabled: true, address: 'bc1q...', network: 'Bitcoin' },
      ethereum: { enabled: true, address: '0x...', network: 'ERC20' },
    } as Record<string, { enabled: boolean; address: string; network: string }>
  })
  const TABS = ['all','pending_review','completed','pending','refunded']
  const payIcon: Record<string, string> = { card: '💳', apple: '🍎', apple_gift: '🎁', paypal: '🅿️', crypto: '₿', cryptocurrency: '₿', cashapp: '💚', bank: '🏦' }
  const renderPayIcon = (method: string) => {
    const url = getPaymentIcon(method === 'crypto' ? 'cryptocurrency' : method);
    if (url) return <img src={url} alt={method} className="w-8 h-8 object-contain" />;
    return <span className="text-3xl">{payIcon[method] || '💳'}</span>;
  }
  const renderPayIconLg = renderPayIcon;
  const payName: Record<string, string> = { card: 'Credit Card', apple: 'Apple Pay', apple_gift: 'Apple Gift Card', paypal: 'PayPal', crypto: 'Crypto', cryptocurrency: 'Crypto', cashapp: 'Cash App', bank: 'Bank Transfer' }

  const payments = adminPayments()
  const filtered = tab === 'all' ? payments : payments.filter(p => p.status === tab)

  return (
    <div className="flex gap-5" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="flex-1 min-w-0 space-y-4">
        {/* Main tab switcher */}
        <div className="flex gap-2">
          {(['transactions','setup'] as const).map(t => (
            <button key={t} onClick={() => setMainTab(t)} className="text-sm px-4 py-2 rounded-xl capitalize transition-colors"
              style={{ background: mainTab === t ? 'rgba(0,255,136,0.1)' : T.inputBg, color: mainTab === t ? T.emerald : T.textMuted, border: `1px solid ${mainTab === t ? 'rgba(0,255,136,0.25)' : T.border}` }}>
              {t === 'transactions' ? 'Transactions' : 'Payment Setup'}
            </button>
          ))}
        </div>

        {mainTab === 'setup' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* PayPal */}
            <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(59,130,246,0.15)' }}>🅿️</div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: T.text }}>PayPal</div>
                  <div className="text-xs" style={{ color: T.textMuted }}>Your PayPal email for receiving payments</div>
                </div>
              </div>
              <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>PayPal Email</label>
              <input className="w-full px-4 py-3 rounded-xl text-sm outline-none mb-3" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                placeholder="you@example.com" value={payDetails.paypal} onChange={e => setPayDetails(d => ({ ...d, paypal: e.target.value }))}/>
              <button onClick={() => show('PayPal details saved!')} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save PayPal Details</button>
            </div>

            {/* Bitcoin */}
            <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(245,158,11,0.15)' }}>₿</div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: T.text }}>Bitcoin</div>
                  <div className="text-xs" style={{ color: T.textMuted }}>Your BTC wallet address for payments</div>
                </div>
              </div>
              <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>Bitcoin Wallet Address</label>
              <input className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none mb-3" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                placeholder="bc1q..." value={payDetails.bitcoin} onChange={e => setPayDetails(d => ({ ...d, bitcoin: e.target.value }))}/>
              <button onClick={() => show('Bitcoin address saved!')} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save Bitcoin Address</button>
            </div>

            {/* Cash App */}
            <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(0,214,130,0.15)' }}>💚</div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: T.text }}>Cash App</div>
                  <div className="text-xs" style={{ color: T.textMuted }}>Your $Cashtag for receiving payments</div>
                </div>
              </div>
              <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>Cash App $Cashtag</label>
              <input className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none mb-3" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                placeholder="$YourCashtag" value={payDetails.cashapp} onChange={e => setPayDetails(d => ({ ...d, cashapp: e.target.value }))}/>
              <button onClick={() => show('Cash App details saved!')} className="w-full py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save Cash App Tag</button>
            </div>

            {/* Bank Transfer */}
            <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(34,211,238,0.15)' }}>🏦</div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: T.text }}>Bank Transfer</div>
                  <div className="text-xs" style={{ color: T.textMuted }}>Users have 30 minutes to complete transfer</div>
                </div>
              </div>
              <div className="space-y-3">
                {[['Account Holder Name','bank_holder','John Smith'],['Bank Name','bank_name','Chase Bank'],['Account Number','bank_account','0123456789'],['Routing Number','bank_routing','021000021']].map(([label,key,placeholder]) => (
                  <div key={key as string}>
                    <label className="text-xs font-mono uppercase tracking-wider block mb-1.5" style={{ color: T.textMuted }}>{label}</label>
                    <input className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                      placeholder={placeholder as string} value={(payDetails as any)[key as string]} onChange={e => setPayDetails(d => ({ ...d, [key as string]: e.target.value }))}/>
                  </div>
                ))}
              </div>
              <button onClick={() => show('Bank details saved!')} className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save Bank Details</button>
            </div>

            {/* Apple Gift Card Instructions */}
            <div className="rounded-2xl p-5 lg:col-span-2" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(255,255,255,0.08)' }}>🎁</div>
                <div>
                  <div className="font-semibold text-sm" style={{ color: T.text }}>Apple Gift Card — Payment Guide</div>
                  <div className="text-xs" style={{ color: T.textMuted }}>This guide is shown to users when they select Apple Gift Card payment</div>
                </div>
              </div>
              <textarea rows={4} className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}
                value={payDetails.gift_instructions} onChange={e => setPayDetails(d => ({ ...d, gift_instructions: e.target.value }))}/>
              <button onClick={() => show('Gift card instructions saved!')} className="mt-3 px-6 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>Save Instructions</button>
            </div>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Revenue', val: '$182,944', color: T.emerald, glow: T.emeraldGlow },
                { label: 'Pending Review', val: '$21,600', color: T.gold, glow: T.goldGlow },
                { label: 'Refunds', val: '$954', color: T.purple, glow: T.purpleGlow },
                { label: 'Rejected', val: '$0', color: T.red, glow: T.redGlow },
              ].map(s => (
                <div key={s.label} className="p-4 rounded-2xl" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}`, boxShadow: `0 0 20px ${s.glow}` }}>
                  <div className="text-xs font-mono uppercase tracking-wider mb-1" style={{ color: T.textMuted }}>{s.label}</div>
                  <div className="font-serif text-xl font-bold" style={{ color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 flex-wrap">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)} className="text-xs px-3 py-1.5 rounded-xl capitalize transition-colors"
                  style={{ background: tab === t ? 'rgba(0,255,136,0.1)' : T.inputBg, color: tab === t ? T.emerald : T.textMuted, border: `1px solid ${tab === t ? 'rgba(0,255,136,0.25)' : T.border}` }}>
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Transactions */}
            <div className="rounded-2xl overflow-hidden" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              {filtered.map(p => (
                <div key={p.id} className="flex items-center gap-4 px-5 py-4 border-b last:border-0 cursor-pointer transition-colors"
                  style={{ borderColor: T.border }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                  onClick={() => setSelected(p)}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: T.bg3 }}>
                    {renderPayIconLg(p.method)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" style={{ color: T.text }}>{p.customer}</span>
                      <span className="font-mono text-[11px]" style={{ color: T.textMuted }}>{p.id}</span>
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: T.textMuted }}>{payName[p.method] || p.method} · {p.date} · <span className="font-mono" style={{ color: T.cyan }}>{p.booking}</span></div>
                  </div>
                  <div className="font-serif text-lg font-bold" style={{ color: T.text }}>${p.amount.toLocaleString()}</div>
                  <StatusBadge status={p.status}/>
                  {p.status === 'pending_review' && (
                    <div className="flex gap-1.5">
                      <button onClick={e => { e.stopPropagation(); show('Payment approved!') }} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.12)', color: T.emerald }}>
                        Approve
                      </button>
                      <button onClick={e => { e.stopPropagation(); show('Payment rejected!') }} className="px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: T.red }}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {selected && selected.status === 'pending_review' && mainTab === 'transactions' && (
        <div className="w-72 shrink-0 rounded-2xl overflow-hidden" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}`, animation: 'panel-in 0.25s ease' }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: T.border }}>
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Payment Proof</div>
            <button onClick={() => setSelected(null)} style={{ color: T.textMuted }}><Icons.x/></button>
          </div>
          <div className="p-4 space-y-3">
            <div className="rounded-xl overflow-hidden bg-zinc-900 h-40 flex items-center justify-center" style={{ border: `1px solid ${T.border}` }}>
              <div className="text-center">
                <div className="text-3xl mb-2">🏦</div>
                <div className="text-xs" style={{ color: T.textMuted }}>Bank Transfer Receipt</div>
                <div className="text-xs mt-1 font-mono" style={{ color: T.textSub }}>receipt_proof.pdf</div>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              {[['Customer', selected.customer],['Amount', `$${selected.amount.toLocaleString()}`],['Booking', selected.booking],['Date', selected.date]].map(([k,v]) => (
                <div key={k as string} className="flex justify-between py-1.5 border-b" style={{ borderColor: T.border }}>
                  <span style={{ color: T.textMuted }}>{k}</span>
                  <span className="font-semibold" style={{ color: T.textSub }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-1">
              <button onClick={() => { show('Approved!'); setSelected(null) }} className="w-full py-2.5 rounded-xl text-xs font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
                ✓ Approve Payment
              </button>
              <button onClick={() => { show('Rejected!'); setSelected(null) }} className="w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: T.red }}>
                ✕ Reject Payment
              </button>
              <button onClick={() => show('Re-upload requested!')} className="w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: T.inputBg, color: T.textMuted }}>
                ↻ Request New Upload
              </button>
            </div>
            <textarea placeholder="Internal notes..." rows={3} className="w-full px-3 py-2 rounded-xl text-xs outline-none resize-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.textSub }}/>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Chat Page ────────────────────────────────────────────────────────────────
function ChatPage() {
  const [activeChat, setActiveChat] = useState<AdminChat | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const [msg, setMsg] = useState('')
  const [messages, setMessages] = useState(() => adminChats()[0]?.messages ?? [])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const send = () => {
    if (!msg.trim()) return
    setMessages(m => [...m, { id: String(m.length + 1), from: 'agent', text: msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }])
    setMsg('')
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const SMART_REPLIES = ["I'll look into that right away!", "Your booking has been updated.", "Is there anything else I can help you with?", "I've escalated this to our team."]

  const chatList = adminChats()
  const chat = activeChat || chatList[0]

  const ConversationList = () => (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b shrink-0" style={{ borderColor: T.border }}>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: T.inputBg, border: `1px solid ${T.border}` }}>
          <Icons.search/>
          <input placeholder="Search chats..." className="flex-1 bg-transparent text-xs outline-none" style={{ color: T.text }}/>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {chatList.map(c => (
          <button key={c.id} onClick={() => { setActiveChat(c); setShowInfo(false) }}
            className="w-full text-left p-3 rounded-xl mb-1 transition-colors"
            style={{ background: chat.id === c.id ? 'rgba(0,255,136,0.08)' : 'transparent', border: `1px solid ${chat.id === c.id ? 'rgba(0,255,136,0.2)' : 'transparent'}` }}>
            <div className="flex items-center gap-2.5">
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `${c.color}20`, color: c.color }}>
                  {c.avatar}
                </div>
                {c.unread > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold" style={{ background: T.red, color: 'white' }}>{c.unread}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold" style={{ color: T.text }}>{c.customer}</span>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: T.textMuted }}>{c.time}</span>
                </div>
                <div className="text-[11px] truncate mt-0.5" style={{ color: T.textMuted }}>{c.preview}</div>
                <div className="flex gap-1 mt-1">
                  <StatusBadge status={c.priority}/>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const ChatWindow = () => (
    <div className="flex flex-col h-full min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: T.border, background: T.cardSolid }}>
        {/* Mobile back btn */}
        <button className="md:hidden p-1.5 rounded-lg mr-1" style={{ color: T.textMuted, background: T.inputBg }} onClick={() => setActiveChat(null)}>
          <Icons.chevronLeft/>
        </button>
        <div className="relative">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `${chat.color}20`, color: chat.color }}>
            {chat.avatar}
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 bg-emerald-400" style={{ borderColor: T.cardSolid }}/>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: T.text }}>{chat.customer}</div>
          <div className="text-[11px]" style={{ color: '#00FF88' }}>Online</div>
        </div>
        <div className="flex items-center gap-2">
          <button className="hidden sm:flex px-3 py-1.5 rounded-xl text-xs" style={{ background: T.inputBg, color: T.textMuted }}>Escalate</button>
          <button className="hidden sm:flex px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald }}>Resolve</button>
          <button className="p-2 rounded-xl" style={{ background: T.inputBg, color: T.textMuted }} onClick={() => setShowInfo(s => !s)}>
            <Icons.eye/>
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: T.bg }}>
        {/* Date divider */}
        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px" style={{ background: T.border }}/>
          <span className="text-[10px] font-mono px-2" style={{ color: T.textMuted }}>Today</span>
          <div className="flex-1 h-px" style={{ background: T.border }}/>
        </div>
        {messages.map(m => (
          <div key={m.id} className={`flex items-end gap-2 ${m.from === 'agent' ? 'justify-end' : 'justify-start'}`}>
            {m.from === 'customer' && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mb-1" style={{ background: `${chat.color}20`, color: chat.color }}>
                {chat.avatar}
              </div>
            )}
            <div className={`max-w-[75%] sm:max-w-xs px-4 py-2.5 text-sm leading-relaxed ${m.from === 'agent' ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-bl-sm'}`}
              style={{
                background: m.from === 'agent' ? 'linear-gradient(135deg,#00FF88,#00C866)' : T.cardSolid,
                color: m.from === 'agent' ? '#09090B' : T.textSub,
                border: m.from === 'customer' ? `1px solid ${T.border}` : 'none',
              }}>
              {m.text}
              <div className={`text-[10px] mt-1 font-mono ${m.from === 'agent' ? 'text-right opacity-60' : ''}`} style={{ color: m.from === 'agent' ? '#09090B' : T.textMuted }}>
                {m.time} {m.from === 'agent' && '✓✓'}
              </div>
            </div>
          </div>
        ))}
        {/* Typing indicator */}
        <div className="flex items-end gap-2 justify-start">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: `${chat.color}20`, color: chat.color }}>{chat.avatar}</div>
          <div className="px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1" style={{ background: T.cardSolid, border: `1px solid ${T.border}` }}>
            {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: T.textMuted }}/>)}
          </div>
        </div>
        <div ref={messagesEndRef}/>
      </div>

      {/* Quick replies */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t" style={{ borderColor: T.border, background: T.cardSolid }}>
        {SMART_REPLIES.map(r => (
          <button key={r} onClick={() => setMsg(r)} className="shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors"
            style={{ background: T.bg3, color: T.textMuted, border: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
            {r}
          </button>
        ))}
      </div>

      {/* Input bar — WhatsApp style */}
      <div className="px-4 py-3 border-t shrink-0" style={{ borderColor: T.border, background: T.cardSolid }}>
        <div className="flex items-center gap-2">
          <button className="p-2.5 rounded-full transition-colors" style={{ color: T.textMuted, background: T.inputBg }}>
            <Icons.smile/>
          </button>
          <button className="p-2.5 rounded-full transition-colors" style={{ color: T.textMuted, background: T.inputBg }}>
            <Icons.paperclip/>
          </button>
          <div className="flex-1 flex items-center px-4 py-2.5 rounded-full" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
            <input value={msg} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Type a message..." className="flex-1 bg-transparent text-sm outline-none" style={{ color: T.text }}/>
          </div>
          <button onClick={send} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all"
            style={{ background: msg ? 'linear-gradient(135deg,#00FF88,#00C866)' : T.inputBg, color: msg ? '#09090B' : T.textMuted }}>
            <Icons.send/>
          </button>
        </div>
      </div>
    </div>
  )

  const CustomerInfo = () => (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b shrink-0" style={{ borderColor: T.border }}>
        <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Customer Info</div>
        <button className="p-1 rounded-lg" style={{ color: T.textMuted }} onClick={() => setShowInfo(false)}><Icons.x/></button>
      </div>
      <div className="p-4 space-y-4">
        <div className="text-center pt-2">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-3" style={{ background: `${chat.color}20`, color: chat.color }}>
            {chat.avatar}
          </div>
          <div className="font-semibold text-sm" style={{ color: T.text }}>{chat.customer}</div>
          <div className="text-xs mt-0.5" style={{ color: T.textMuted }}>sophia@example.com</div>
          <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full" style={{ background: T.goldGlow, color: T.gold }}>⭐ VIP</span>
        </div>
        <div className="space-y-2 text-xs">
          {[['Booking','APEX-7K2M9P'],['Tier','VVIP Platinum'],['Seat','Seat 042'],['Payment','Confirmed'],['Total Spent','$12,840']].map(([k,v]) => (
            <div key={k as string} className="flex justify-between py-2 border-b" style={{ borderColor: T.border }}>
              <span style={{ color: T.textMuted }}>{k}</span>
              <span className="font-semibold" style={{ color: T.textSub }}>{v}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: T.textMuted }}>Previous Events</div>
          {['Travis Scott — Barclays','Post Malone — MSG'].map(e => (
            <div key={e} className="text-xs py-1.5 px-2 rounded-lg mb-1" style={{ background: T.inputBg, color: T.textSub }}>{e}</div>
          ))}
        </div>
        <div className="space-y-2">
          <button className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.08)', color: T.red, border: '1px solid rgba(239,68,68,0.15)' }}>🚫 Ban User</button>
          <button className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(139,92,246,0.1)', color: T.purple, border: '1px solid rgba(139,92,246,0.2)' }}>🔄 Issue Refund</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ animation: 'fade-in-up 0.3s ease' }}>
      {/* Desktop 3-panel */}
      <div className="hidden md:flex rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 130px)', background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
        {/* Conversation list */}
        <div className="w-64 shrink-0 border-r" style={{ borderColor: T.border }}>
          <ConversationList/>
        </div>
        {/* Chat window */}
        <div className="flex-1 min-w-0">
          <ChatWindow/>
        </div>
        {/* Customer info panel */}
        {showInfo && (
          <div className="w-64 shrink-0 border-l" style={{ borderColor: T.border, animation: 'panel-in 0.2s ease' }}>
            <CustomerInfo/>
          </div>
        )}
      </div>

      {/* Mobile: conversation list OR chat view */}
      <div className="md:hidden rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 130px)', background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
        {activeChat ? (
          <ChatWindow/>
        ) : (
          <ConversationList/>
        )}
      </div>
    </div>
  )
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
function ReportsPage({ show }: { show: (m: string) => void }) {
  const reportRevenue = revenueData()
  const maxRev = Math.max(1, ...reportRevenue.map(d => d.v))
  return (
    <div className="space-y-6" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {['Last 7 Days','Last 30 Days','Last 3 Months','Custom'].map((l, i) => (
            <button key={l} className="text-xs px-3 py-2 rounded-xl transition-colors"
              style={{ background: i === 1 ? 'rgba(0,255,136,0.1)' : T.inputBg, color: i === 1 ? T.emerald : T.textMuted, border: `1px solid ${i === 1 ? 'rgba(0,255,136,0.25)' : T.border}` }}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {['CSV','Excel','PDF'].map(f => (
            <button key={f} onClick={() => show(`Exporting ${f}...`)} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl"
              style={{ background: T.inputBg, color: T.textMuted, border: `1px solid ${T.border}` }}>
              <Icons.download/>{f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', val: '$576,000', chg: '+38%', color: T.emerald },
          { label: 'Tickets Sold', val: '3,847', chg: '+22%', color: T.purple },
          { label: 'Conversion Rate', val: '8.4%', chg: '+1.2%', color: T.cyan },
          { label: 'Refund Rate', val: '1.2%', chg: '-0.3%', color: T.gold },
        ].map(s => (
          <div key={s.label} className="p-4 rounded-2xl" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
            <div className="text-xs font-mono uppercase mb-2" style={{ color: T.textMuted }}>{s.label}</div>
            <div className="font-serif text-xl font-bold" style={{ color: T.text }}>{s.val}</div>
            <div className="text-xs font-mono mt-1" style={{ color: s.color }}>{s.chg} vs prior period</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueChart/>
        </div>
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Top Customers by Spend</div>
          {adminCustomers().sort((a,b) => b.spent - a.spent).slice(0,5).map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 mb-3">
              <div className="text-xs font-mono w-4" style={{ color: T.textMuted }}>#{i+1}</div>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: `${c.color}20`, color: c.color }}>{c.avatar}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: T.text }}>{c.name}</div>
                <div className="h-1 rounded-full mt-1 overflow-hidden" style={{ background: T.border }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.spent / Math.max(1, ...adminCustomers().map(customer => customer.spent))) * 100)}%`, background: c.color }}/>
                </div>
              </div>
              <div className="text-xs font-mono font-bold" style={{ color: T.emerald }}>${(c.spent/1000).toFixed(1)}k</div>
            </div>
          ))}
        </div>
      </div>

      {/* Heatmap-style table */}
      <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
        <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Monthly Revenue Heatmap</div>
        <div className="grid grid-cols-7 gap-2">
          {reportRevenue.map(d => {
            const pct = d.v / maxRev
            return (
              <div key={d.label} className="text-center">
                <div className="h-16 rounded-xl mb-1 transition-all" style={{ background: `rgba(0,255,136,${pct * 0.7 + 0.05})`, border: `1px solid rgba(0,255,136,${pct * 0.4})` }}/>
                <div className="text-[10px] font-mono" style={{ color: T.textMuted }}>{d.label}</div>
                <div className="text-[10px] font-mono" style={{ color: T.textSub }}>${(d.v/1000).toFixed(0)}k</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Marketing Page ───────────────────────────────────────────────────────────
function MarketingPage({ show }: { show: (m: string) => void }) {
  return (
    <div className="space-y-6" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Coupon codes */}
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Promo Codes</div>
            <button onClick={() => show('Creating new promo...')} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold"
              style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald, border: '1px solid rgba(0,255,136,0.2)' }}>
              <Icons.plus/> New Code
            </button>
          </div>
          <div className="space-y-3">
            {emptyCoupons.map(c => (
              <div key={c.code} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold" style={{ color: T.text }}>{c.code}</span>
                    <StatusBadge status={c.status}/>
                  </div>
                  <div className="text-xs" style={{ color: T.textMuted }}>{c.discount} off · {c.uses}/{c.max} used · Expires {c.expires}</div>
                  <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: T.border }}>
                    <div className="h-full rounded-full" style={{ width: `${(c.uses/c.max)*100}%`, background: c.status === 'expired' ? T.red : T.emerald }}/>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => show('Copied!')} className="p-1.5 rounded-lg" style={{ background: T.inputBg, color: T.textMuted }}><Icons.copy/></button>
                  <button onClick={() => show('Editing...')} className="p-1.5 rounded-lg" style={{ background: T.inputBg, color: T.textMuted }}><Icons.settings/></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Campaigns */}
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Active Campaigns</div>
            <button onClick={() => show('Creating campaign...')} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold"
              style={{ background: 'rgba(139,92,246,0.1)', color: T.purple, border: '1px solid rgba(139,92,246,0.2)' }}>
              <Icons.plus/> New Campaign
            </button>
          </div>
          {[
            { type: '📧 Email', name: 'Drake Early Access', sent: 12450, opens: 38, status: 'active' },
            { type: '📱 SMS', name: 'VIP Seat Reminder', sent: 890, opens: 72, status: 'active' },
            { type: '🔔 Push', name: 'Limited Seats Alert', sent: 3200, opens: 51, status: 'scheduled' },
          ].map(c => (
            <div key={c.name} className="flex items-center gap-3 p-3 rounded-xl mb-2 last:mb-0" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
              <div className="text-xl shrink-0">{c.type.split(' ')[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold mb-0.5" style={{ color: T.text }}>{c.name}</div>
                <div className="text-xs" style={{ color: T.textMuted }}>{c.sent.toLocaleString()} sent · {c.opens}% open rate</div>
              </div>
              <StatusBadge status={c.status === 'scheduled' ? 'pending' : 'confirmed'}/>
            </div>
          ))}
        </div>
      </div>

      {/* Push notification composer */}
      <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
        <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Compose Push Notification</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>Title</label>
              <input className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }} placeholder="🎟 Urgent: Only 12 VVIP seats left!"/>
            </div>
            <div>
              <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>Message</label>
              <textarea rows={3} className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }} placeholder="Don't miss your chance to see Drake live at MSG..."/>
            </div>
            <div className="flex gap-2">
              <select className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}>
                <option>All Subscribers</option>
                <option>VIP Only</option>
                <option>Pending Bookings</option>
              </select>
              <button onClick={() => show('Notification sent!')} className="px-5 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
                Send
              </button>
            </div>
          </div>
          {/* Preview */}
          <div className="flex items-center justify-center p-4 rounded-xl" style={{ background: T.bg3 }}>
            <div className="w-64 rounded-2xl p-3 shadow-2xl" style={{ background: T.bg2, border: `1px solid ${T.border}` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#00FF88,#8B5CF6)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-3.5 h-3.5"><path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <span className="text-xs font-semibold" style={{ color: T.text }}>Apex Events</span>
                <span className="ml-auto text-[10px]" style={{ color: T.textMuted }}>now</span>
              </div>
              <div className="text-xs font-bold mb-0.5" style={{ color: T.text }}>🎟 Urgent: Only 12 VVIP seats left!</div>
              <div className="text-[11px]" style={{ color: T.textMuted }}>Don't miss your chance to see Drake live...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Venue Page ───────────────────────────────────────────────────────────────
function VenuePage({ show }: { show: (m: string) => void }) {
  const [hov, setHov] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)

  const cx = 260, cy = 200
  const sections = [
    ...Array.from({ length: 12 }, (_, i) => ({ id: `3${String(i+1).padStart(2,'0')}`, tier: 0, ring: 'outer' as const, angle: (i/12)*360 })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `1${String(i+1).padStart(2,'0')}`, tier: 1, ring: 'middle' as const, angle: (i/10)*360 })),
    { id: 'GA Floor', tier: 2, ring: 'inner' as const, angle: 0 },
    { id: 'Suite A', tier: 2, ring: 'inner' as const, angle: 120 },
    { id: 'Suite B', tier: 2, ring: 'inner' as const, angle: 240 },
  ]

  const colors = ['rgba(113,113,122,0.6)', '#00FF88', '#F59E0B']
  const ringR = { outer: 175, middle: 120, inner: 65 }
  const ringW = { outer: 38, middle: 36, inner: 38 }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="xl:col-span-2">
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>Venue Map — Interactive</div>
              <div className="font-serif text-lg font-bold mt-0.5" style={{ color: T.text }}>Madison Square Garden</div>
            </div>
            <div className="flex gap-1.5">
              {['🔴 Sold Out','🟡 Partial','🟢 Available'].map(l => (
                <span key={l} className="text-[10px] px-2 py-1 rounded-full" style={{ background: T.inputBg, color: T.textMuted }}>{l}</span>
              ))}
            </div>
          </div>
          <svg viewBox="0 0 520 400" className="w-full rounded-xl" style={{ background: T.bg3 }}>
            {sections.map(sec => {
              const r = ringR[sec.ring]
              const w = ringW[sec.ring]
              const color = colors[sec.tier]
              const isSelected = sel === sec.id
              const isHov = hov === sec.id
              const alpha = isSelected ? 0.9 : isHov ? 0.5 : 0.2

              if (sec.ring === 'inner') {
                const idx = sec.id === 'GA Floor' ? 0 : sec.id === 'Suite A' ? 1 : 2
                const startA = ((idx/3)*360 - 90) * Math.PI/180
                const endA = (((idx+1)/3)*360 - 90) * Math.PI/180
                const r1 = 32, r2 = 78
                const pts = [[r1,startA],[r2,startA],[r2,endA],[r1,endA]]
                const [x1,y1] = [cx + r1*Math.cos(startA), cy + r1*Math.sin(startA)]
                const [x2,y2] = [cx + r2*Math.cos(startA), cy + r2*Math.sin(startA)]
                const [x3,y3] = [cx + r2*Math.cos(endA), cy + r2*Math.sin(endA)]
                const [x4,y4] = [cx + r1*Math.cos(endA), cy + r1*Math.sin(endA)]
                const midA = (startA+endA)/2
                const [lx,ly] = [cx + 55*Math.cos(midA), cy + 55*Math.sin(midA)]
                return (
                  <g key={sec.id} style={{ cursor: 'pointer' }}
                    onClick={() => setSel(sec.id === sel ? null : sec.id)}
                    onMouseEnter={() => setHov(sec.id)} onMouseLeave={() => setHov(null)}>
                    <path d={`M ${x1} ${y1} L ${x2} ${y2} A ${r2} ${r2} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${r1} ${r1} 0 0 0 ${x1} ${y1}`}
                      fill={`${color.replace('0.6','').replace('#','')}`.startsWith('rgba') ? color.replace(/[\d.]+\)$/, `${alpha})`) : color + (isSelected ? 'ff' : isHov ? '88' : '38')}
                      stroke={isSelected || isHov ? color : 'rgba(255,255,255,0.1)'} strokeWidth={isSelected ? 2 : 0.5}/>
                    <text x={lx} y={ly+3} textAnchor="middle" fill={color} fontSize="6" fontFamily="DM Mono,monospace" fontWeight="700">{sec.id === 'GA Floor' ? 'GA' : sec.id.replace('Suite ', 'P')}</text>
                  </g>
                )
              }

              const count = sec.ring === 'outer' ? 12 : 10
              const span = (360/count) * Math.PI/180
              const startA = (sec.angle - 90 - (360/count/2)) * Math.PI/180
              const endA = startA + span*0.88
              const r1b = r - w/2, r2b = r + w/2
              const x1b = cx + r1b*Math.cos(startA), y1b = cy + r1b*Math.sin(startA)
              const x2b = cx + r2b*Math.cos(startA), y2b = cy + r2b*Math.sin(startA)
              const x3b = cx + r2b*Math.cos(endA), y3b = cy + r2b*Math.sin(endA)
              const x4b = cx + r1b*Math.cos(endA), y4b = cy + r1b*Math.sin(endA)
              const midAb = (startA+endA)/2
              const lxb = cx + r*Math.cos(midAb), lyb = cy + r*Math.sin(midAb)
              return (
                <g key={sec.id} style={{ cursor: 'pointer' }}
                  onClick={() => setSel(sec.id === sel ? null : sec.id)}
                  onMouseEnter={() => setHov(sec.id)} onMouseLeave={() => setHov(null)}>
                  <path d={`M ${x1b} ${y1b} L ${x2b} ${y2b} A ${r2b} ${r2b} 0 0 1 ${x3b} ${y3b} L ${x4b} ${y4b} A ${r1b} ${r1b} 0 0 0 ${x1b} ${y1b}`}
                    fill={color + (isSelected ? 'cc' : isHov ? '66' : '30')}
                    stroke={isSelected || isHov ? color : 'rgba(255,255,255,0.08)'} strokeWidth={isSelected ? 1.5 : 0.5}/>
                  <text x={lxb} y={lyb+3} textAnchor="middle" fill={color} fontSize={sec.ring === 'outer' ? '7' : '8'} fontFamily="DM Mono,monospace">{sec.id}</text>
                </g>
              )
            })}
            <ellipse cx={cx} cy={cy} rx={25} ry={20} fill="#F59E0B" opacity="0.9"/>
            <text x={cx} y={cy+4} textAnchor="middle" fill="#09090B" fontSize="7" fontFamily="DM Mono,monospace" fontWeight="700">STAGE</text>
            {hov && <text x={cx} y={20} textAnchor="middle" fill="rgba(0,255,136,0.8)" fontSize="8" fontFamily="DM Mono,monospace">Section: {hov}</text>}
          </svg>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Occupancy Heatmap</div>
          {[
            { name: 'General Admission (300s)', pct: 95, color: T.red, label: 'CRITICAL' },
            { name: 'VIP Floor (100s)', pct: 86, color: T.gold, label: 'HIGH' },
            { name: 'VVIP Platinum', pct: 80, color: T.emerald, label: 'GOOD' },
          ].map(s => (
            <div key={s.name} className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: T.textSub }}>{s.name}</span>
                <span className="font-mono font-bold" style={{ color: s.color }}>{s.pct}% — {s.label}</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: T.border }}>
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.color }}/>
              </div>
            </div>
          ))}
        </div>

        {sel && (
          <div className="rounded-2xl p-4" style={{ background: T.bg3, border: `1px solid rgba(0,255,136,0.2)`, animation: 'panel-in 0.2s ease' }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: T.emerald }}>Section {sel}</div>
            <div className="space-y-2 text-xs">
              {[['Capacity','~48 seats'],['Sold','~41 seats'],['Available','~7 seats'],['Price','$189–$850']].map(([k,v]) => (
                <div key={k as string} className="flex justify-between">
                  <span style={{ color: T.textMuted }}>{k}</span>
                  <span style={{ color: T.text }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={() => show('Section settings opened!')} className="w-full mt-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald }}>
              Configure Section →
            </button>
          </div>
        )}

        <div className="rounded-2xl p-4" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          <div className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: T.textMuted }}>Quick Actions</div>
          {['Edit Seat Layout','Lock Section','Reserve Block','Export Map PDF'].map(a => (
            <button key={a} onClick={() => show(`${a}...`)} className="w-full text-left py-2.5 px-3 rounded-xl text-xs mb-1 transition-colors"
              style={{ background: 'transparent', color: T.textSub }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = T.inputBg}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}>
              → {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Notifications Page ───────────────────────────────────────────────────────
function NotificationsPage() {
  const items = [
    { icon: '💳', type: 'Payment', text: 'Bank transfer from James Park ($21,600) awaiting review', time: '8 min ago', color: T.gold, unread: true },
    { icon: '🎟', type: 'Booking', text: 'New VVIP booking — Sophia Chen, 2 tickets, GA Floor', time: '12 min ago', color: T.emerald, unread: true },
    { icon: '💬', type: 'Support', text: "Sophia Chen opened a chat — 'Hi, I need to change my seat...'", time: '15 min ago', color: T.cyan, unread: true },
    { icon: '🔄', type: 'Refund', text: 'Refund processed — Naomi Wells, $954, APEX-2A6PVF', time: '45 min ago', color: T.purple, unread: false },
    { icon: '✅', type: 'Booking', text: 'Corporate booking confirmed — James Park, 40× VIP Floor', time: '1 hr ago', color: T.emerald, unread: false },
    { icon: '⚠️', type: 'System', text: 'VVIP Platinum tier is 80% sold — consider price adjustment', time: '2 hrs ago', color: T.gold, unread: false },
    { icon: '📧', type: 'Campaign', text: 'Email campaign "Drake Early Access" sent to 12,450 subscribers', time: '3 hrs ago', color: T.purple, unread: false },
    { icon: '🔔', type: 'System', text: 'System health check passed — all services operational', time: '6 hrs ago', color: T.emerald, unread: false },
  ]

  return (
    <div className="max-w-3xl space-y-4" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold" style={{ color: T.text }}>23 notifications</div>
        <button className="text-xs" style={{ color: T.textMuted }}>Mark all as read</button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex gap-4 p-4 rounded-2xl transition-all cursor-pointer"
          style={{ background: item.unread ? T.bg3 : T.cardSolid, border: `1px solid ${item.unread ? `${item.color}20` : T.border}` }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = `${item.color}30`}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = item.unread ? `${item.color}20` : T.border}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${item.color}15` }}>
            {item.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{ background: `${item.color}15`, color: item.color }}>{item.type}</span>
              {item.unread && <span className="w-2 h-2 rounded-full" style={{ background: item.color }}/>}
            </div>
            <div className="text-sm" style={{ color: T.textSub }}>{item.text}</div>
            <div className="text-xs font-mono mt-1" style={{ color: T.textMuted }}>{item.time}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Settings Page ────────────────────────────────────────────────────────────
function PaymentSettingsPanel({ show }: { show: (m: string) => void }) {
  const [tab, setTab] = useAdminRecoveryState<'methods' | 'crypto'>('settings.paymentTab', 'methods', value => value === 'methods' || value === 'crypto')
  const [settings, setSettings] = useState<PlatformPaymentSettings>(() => platformPaymentStore.get())
  const cryptoCoins = getSupportedCryptocurrencies()

  const save = (next: PlatformPaymentSettings) => {
    setSettings(next)
    platformPaymentStore.save(next)
    show('Payment settings saved')
  }

  const METHOD_LABELS: Record<string, string> = {
    apple_gift_card: 'Apple Gift Card',
    paypal:          'PayPal',
    cryptocurrency:  'Cryptocurrency',
    cash_app:        'Cash App',
    bank_transfer:   'Bank Transfer',
  }

  const inp = 'w-full px-3 py-2.5 rounded-xl text-sm outline-none'
  const inpStyle = { background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }

  const sortedMethods = [...settings.methods].sort((a, b) => a.order - b.order)

  const moveMethod = (id: string, direction: -1 | 1) => {
    const arr = [...sortedMethods]
    const idx = arr.findIndex(m => m.id === id)
    const swapIdx = idx + direction
    if (swapIdx < 0 || swapIdx >= arr.length) return
    const newArr = arr.map((m, i) => {
      if (i === idx) return { ...m, order: arr[swapIdx].order }
      if (i === swapIdx) return { ...m, order: arr[idx].order }
      return m
    })
    save({ ...settings, methods: newArr })
  }

  const toggleMethod = (id: string, enabled: boolean) => {
    save({ ...settings, methods: settings.methods.map(m => m.id === id ? { ...m, enabled } : m) })
  }

  const setDefault = (id: string) => {
    save({ ...settings, methods: settings.methods.map(m => ({ ...m, isDefault: m.id === id })) })
  }

  const updateMethod = (id: string, change: Partial<PlatformPaymentSettings['methods'][number]>) => {
    save({ ...settings, methods: settings.methods.map(method => method.id === id ? { ...method, ...change } : method) })
  }

  const updateCoin = (id: string, change: Partial<PlatformPaymentSettings['cryptocurrencies'][string]>) => {
    const current = settings.cryptocurrencies[id] || { enabled: false, address: '', network: '', label: '' }
    save({ ...settings, cryptocurrencies: { ...settings.cryptocurrencies, [id]: { ...current, ...change } } })
  }

  const readyCryptoCount = Object.values(settings.cryptocurrencies).filter(coin => coin.enabled && coin.address.trim() && coin.network.trim()).length
  const methodsNeedingSetup = settings.methods.filter(method => method.enabled && ((method.id === 'paypal' && !/^\S+@\S+\.\S+$/.test(method.destination.trim())) || (method.id === 'cash_app' && !/^\$[A-Za-z0-9_]{1,20}$/.test(method.destination.trim())) || (method.id !== 'cryptocurrency' && !method.instructions.trim()))).length
  const cryptoNeedsSetup = settings.methods.some(method => method.id === 'cryptocurrency' && method.enabled) && readyCryptoCount === 0

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-2xl" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
        {([['methods', 'Payment Methods'], ['crypto', 'Cryptocurrency Manager']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all"
            style={{ background: tab === t ? T.emerald : 'transparent', color: tab === t ? T.bg : T.textMuted }}>
            <span className="inline-flex items-center gap-2">{label}{((t === 'methods' && methodsNeedingSetup > 0) || (t === 'crypto' && cryptoNeedsSetup)) && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-zinc-950">{t === 'methods' ? methodsNeedingSetup : '!'}</span>}</span>
          </button>
        ))}
      </div>

      {/* ── Tab 1: Payment Method Manager ── */}
      {tab === 'methods' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(0,255,136,0.05)', border: '1px solid rgba(0,255,136,0.15)' }}>
            <div className="text-xs" style={{ color: T.emerald }}>ℹ️ Changes apply platform-wide. Drag order determines display order for customers.</div>
          </div>
          {sortedMethods.map((method, idx) => {
            const iconUrl = getPaymentIcon(method.id)
            const destinationMissing = method.id === 'paypal' ? !/^\S+@\S+\.\S+$/.test(method.destination.trim()) : method.id === 'cash_app' ? !/^\$[A-Za-z0-9_]{1,20}$/.test(method.destination.trim()) : false
            const methodNeedsSetup = method.enabled && (destinationMissing || (method.id !== 'cryptocurrency' && !method.instructions.trim()) || (method.id === 'cryptocurrency' && readyCryptoCount === 0))
            return (
              <div key={method.id}
                className="rounded-2xl p-4 transition-all"
                style={{ background: T.cardSolid, border: `1px solid ${method.enabled ? 'rgba(0,255,136,0.25)' : T.cardBorder}` }}>
                <div className="flex items-center gap-3">
                  {/* Reorder arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveMethod(method.id, -1)} disabled={idx === 0}
                      className="w-5 h-5 rounded flex items-center justify-center text-xs transition-opacity"
                      style={{ background: T.inputBg, color: T.textMuted, opacity: idx === 0 ? 0.3 : 1 }}>▲</button>
                    <button onClick={() => moveMethod(method.id, 1)} disabled={idx === sortedMethods.length - 1}
                      className="w-5 h-5 rounded flex items-center justify-center text-xs transition-opacity"
                      style={{ background: T.inputBg, color: T.textMuted, opacity: idx === sortedMethods.length - 1 ? 0.3 : 1 }}>▼</button>
                  </div>

                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: T.inputBg, padding: '8px', border: `1px solid ${T.border}` }}>
                    {iconUrl
                      ? <img src={iconUrl} alt={METHOD_LABELS[method.id]} className="w-full h-full object-contain" />
                      : <span className="text-xl">💳</span>}
                  </div>

                  {/* Name + status */}
                  <div className="flex-1">
                    <div className="text-sm font-semibold" style={{ color: T.text }}>{METHOD_LABELS[method.id] || method.id}</div>
                    <div className="flex items-center gap-2 mt-1">
                      {method.isDefault && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: T.emeraldGlow, color: T.emerald }}>Default</span>
                      )}
                      {methodNeedsSetup && <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">Setup required</span>}
                      <span className="text-[10px]" style={{ color: method.enabled ? T.emerald : T.textMuted }}>
                        {method.enabled ? '● Enabled' : '○ Disabled'}
                      </span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!method.isDefault && method.enabled && (
                      <button onClick={() => setDefault(method.id)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                        style={{ background: 'rgba(0,255,136,0.08)', color: T.emerald, border: '1px solid rgba(0,255,136,0.2)' }}>
                        Set Default
                      </button>
                    )}
                    {/* Enable/Disable toggle */}
                    <button
                      onClick={() => toggleMethod(method.id, !method.enabled)}
                      className="h-6 w-11 shrink-0 overflow-hidden rounded-full p-1 transition-all"
                      style={{ background: method.enabled ? T.emerald : T.border }}>
                      <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${method.enabled ? 'translate-x-5' : 'translate-x-0'}`}/>
                    </button>
                  </div>
                </div>
                {method.enabled && method.id !== 'cryptocurrency' && <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2" style={{ borderColor: T.border }}>
                  {(method.id === 'paypal' || method.id === 'cash_app') && <label className="block"><span className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider" style={{ color: destinationMissing ? T.gold : T.textMuted }}>{method.id === 'paypal' ? 'Receiving PayPal Email' : 'Cash App $Cashtag'} {destinationMissing && '• Required'}</span><input value={method.destination} onChange={event => updateMethod(method.id, { destination: event.target.value })} placeholder={method.id === 'paypal' ? 'payments@example.com' : '$YourCashtag'} className={inp} style={{ ...inpStyle, borderColor: destinationMissing ? 'rgba(245,158,11,.45)' : T.border }} /></label>}
                  <label className={`block ${(method.id === 'paypal' || method.id === 'cash_app') ? '' : 'md:col-span-2'}`}><span className="mb-1.5 block text-[10px] font-mono uppercase tracking-wider" style={{ color: !method.instructions.trim() ? T.gold : T.textMuted }}>Customer Instructions {!method.instructions.trim() && '• Required'}</span><textarea value={method.instructions} onChange={event => updateMethod(method.id, { instructions: event.target.value })} rows={2} className={`${inp} resize-none`} style={{ ...inpStyle, borderColor: !method.instructions.trim() ? 'rgba(245,158,11,.45)' : T.border }} /></label>
                </div>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab 2: Cryptocurrency Manager ── */}
      {tab === 'crypto' && (
        <div className="space-y-3">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="text-xs" style={{ color: '#FCD34D' }}>ℹ️ Only enabled coins with a wallet address appear to customers. Adding a new coin icon to the icons/ folder makes it available here automatically.</div>
          </div>

          {/* Default crypto selector */}
          <div className="rounded-2xl p-4" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-3" style={{ color: T.textMuted }}>Default Cryptocurrency</div>
            <select
              value={settings.defaultCrypto}
              onChange={e => save({ ...settings, defaultCrypto: e.target.value })}
              className={inp} style={inpStyle}>
              {cryptoCoins.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.symbol})</option>
              ))}
            </select>
          </div>

          {/* Per-coin cards */}
          {cryptoCoins.map(coin => {
            const cConfig = settings.cryptocurrencies[coin.id] || { enabled: false, address: '', network: '', label: '' }
            const coinNeedsSetup = cConfig.enabled && (!cConfig.address.trim() || !cConfig.network.trim())
            return (
              <div key={coin.id}
                className="rounded-2xl overflow-hidden"
                style={{ background: T.cardSolid, border: `1px solid ${cConfig.enabled ? 'rgba(0,255,136,0.25)' : T.cardBorder}` }}>

                {/* Header */}
                <div className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: T.inputBg, padding: '6px', border: `1px solid ${T.border}` }}>
                    <img src={coin.icon} alt={coin.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold" style={{ color: T.text }}>{coin.name}</div>
                    <div className="text-xs font-mono" style={{ color: T.emerald }}>{coin.symbol}</div>
                  </div>
                  {settings.defaultCrypto === coin.id && (
                    <span className="order-last text-[10px] px-2 py-0.5 rounded-full font-mono sm:order-none" style={{ background: T.emeraldGlow, color: T.emerald }}>Default</span>
                  )}
                  {coinNeedsSetup && <span className="order-last rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-300 sm:order-none">Setup required</span>}
                  {/* Enable toggle */}
                  <button
                    onClick={() => updateCoin(coin.id, { enabled: !cConfig.enabled })}
                    className="ml-auto h-6 w-11 shrink-0 overflow-hidden rounded-full p-1 transition-all"
                    style={{ background: cConfig.enabled ? T.emerald : T.border }}>
                    <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${cConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`}/>
                  </button>
                </div>

                {/* Config fields — only when enabled */}
                {cConfig.enabled && (
                  <div className="border-t px-4 pb-4 pt-3 space-y-3" style={{ borderColor: T.border }}>
                    <div>
                      <label className="text-xs font-mono uppercase tracking-wider block mb-1.5" style={{ color: T.textMuted }}>Wallet Address</label>
                      <input
                        value={cConfig.address}
                        onChange={e => updateCoin(coin.id, { address: e.target.value })}
                        placeholder={`Enter ${coin.name} wallet address`}
                        className={inp} style={inpStyle}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-mono uppercase tracking-wider block mb-1.5" style={{ color: T.textMuted }}>Network</label>
                        <input
                          value={cConfig.network}
                          onChange={e => updateCoin(coin.id, { network: e.target.value })}
                          placeholder="e.g. ERC-20"
                          className={inp} style={inpStyle}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-mono uppercase tracking-wider block mb-1.5" style={{ color: T.textMuted }}>Label (optional)</label>
                        <input
                          value={cConfig.label || ''}
                          onChange={e => updateCoin(coin.id, { label: e.target.value })}
                          placeholder={`${coin.name} (${coin.symbol})`}
                          className={inp} style={inpStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-mono uppercase tracking-wider block mb-1.5" style={{ color: T.textMuted }}>Payment Instructions</label>
                      <textarea
                        value={cConfig.instructions || ''}
                        onChange={e => updateCoin(coin.id, { instructions: e.target.value })}
                        placeholder={`Instructions shown to customers when paying with ${coin.name}`}
                        rows={2}
                        className={`${inp} resize-none`} style={inpStyle}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LocalizationSettingsPanel() {
  return (
    <div className="space-y-4" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="mb-5">
        <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.emerald }}>Global Reach</p>
        <h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Localization Settings</h2>
        <p className="mt-1 text-sm" style={{ color: T.textMuted }}>Configuration and information for international audiences.</p>
      </div>

      <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
        <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Supported Regions (11)</div>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: T.textSub }}>
          The public booking flow uses one supported-country mapping for language and currency across booking, checkout, payment, and ticket screens.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { c: 'United States', flag: '🇺🇸', lang: 'English', curr: 'USD' },
            { c: 'Canada', flag: '🇨🇦', lang: 'English', curr: 'CAD' },
            { c: 'United Kingdom', flag: '🇬🇧', lang: 'English', curr: 'GBP' },
            { c: 'France', flag: '🇫🇷', lang: 'Français', curr: 'EUR' },
            { c: 'Germany', flag: '🇩🇪', lang: 'Deutsch', curr: 'EUR' },
            { c: 'Italy', flag: '🇮🇹', lang: 'Italiano', curr: 'EUR' },
            { c: 'Spain', flag: '🇪🇸', lang: 'Español', curr: 'EUR' },
            { c: 'Brazil', flag: '🇧🇷', lang: 'Português', curr: 'BRL' },
            { c: 'Mexico', flag: '🇲🇽', lang: 'Español', curr: 'MXN' },
            { c: 'Australia', flag: '🇦🇺', lang: 'English', curr: 'AUD' },
            { c: 'Colombia', flag: '🇨🇴', lang: 'Español', curr: 'COP' },
          ].map(r => (
            <div key={r.c} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
              <span className="text-xl leading-none">{r.flag}</span>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: T.text }}>{r.c}</div>
                <div className="text-[10px] font-mono text-zinc-400 mt-0.5">{r.lang} · {r.curr}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
        <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>System Details</div>
        <div className="space-y-4">
          <div className="flex gap-3">
            <span className="text-lg">🌍</span>
            <div>
              <div className="text-sm font-semibold" style={{ color: T.text }}>Country Resolution</div>
              <div className="text-xs mt-1 leading-relaxed" style={{ color: T.textMuted }}>Resolution order is manual selection, reliable country signal, configured event country, then the United States fallback. Browser language never determines a visitor&apos;s country.</div>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="text-lg">💱</span>
            <div>
              <div className="text-sm font-semibold" style={{ color: T.text }}>Currency Conversion</div>
              <div className="text-xs mt-1 leading-relaxed" style={{ color: T.textMuted }}>Live exchange rates are served through the secured currency-rates function and formatted by the shared locale service. Baseline rates keep checkout readable during a network interruption.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailConfigurationPanel({ show }: { show: (message: string) => void }) {
  const [settings, setSettings] = useAdminRecoveryState<EmailConfiguration>('settings.emailDraft', emailService.configuration(), (value): value is EmailConfiguration => Boolean(value && typeof value === 'object' && typeof (value as EmailConfiguration).senderEmail === 'string'))
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [testError, setTestError] = useState<string | null>(null)
  const set = (key: keyof EmailConfiguration, value: string | number) => setSettings(current => ({ ...current, [key]: value }))
  const field = (label: string, key: keyof EmailConfiguration, type = 'text') => <label className="block"><span className="mb-2 block text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>{label}</span><input type={type} value={String(settings[key] ?? '')} onChange={event => set(key, type === 'number' ? Number(event.target.value) : event.target.value)} className="w-full rounded-xl px-4 py-3 text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/></label>
  const save = () => { emailService.saveConfiguration(settings); show('Email configuration saved') }
  const validate = () => { emailService.saveConfiguration(settings); const status = emailService.validate(); setSettings(emailService.configuration()); show(status === 'connected' ? 'Email configuration validated' : 'Email configuration needs attention') }
  const test = async () => { if (!settings.testRecipient) return show('Enter a test recipient email'); setTestState('sending'); setTestError(null); emailService.saveConfiguration(settings); try { await emailService.sendTest(settings.testRecipient); setTestState('sent'); show('Test email delivered successfully') } catch (error) { const message = error instanceof Error ? error.message : 'Test email delivery failed'; setTestState('failed'); setTestError(message) } }
  const statusLabel = settings.status.replaceAll('_', ' ')
  return <div className="space-y-5"><div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-mono uppercase tracking-wider" style={{ color: T.emerald }}>Production delivery</p><h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Email Configuration</h2><p className="mt-1 text-sm" style={{ color: T.textMuted }}>Apex sends application events to the deployed app-api Edge Function. SMTP credentials remain in Supabase secrets.</p></div><span className="rounded-full px-3 py-1 text-xs font-semibold capitalize" style={{ background: settings.status === 'connected' ? 'rgba(0,255,136,.12)' : 'rgba(245,158,11,.12)', color: settings.status === 'connected' ? T.emerald : T.gold }}>{statusLabel}</span></div><div className="mt-6 grid gap-4 md:grid-cols-2">{field('SMTP Provider', 'provider')}{field('SMTP Host', 'host')}{field('SMTP Port', 'port', 'number')}{field('Sender Email', 'senderEmail', 'email')}{field('Sender Name', 'senderName')}{field('Reply-To Email', 'replyTo', 'email')}{field('Test Recipient Email', 'testRecipient', 'email')}</div><div className="mt-5 flex flex-wrap gap-3"><button onClick={save} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-zinc-950">Save Configuration</button><button onClick={validate} className="rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}>Validate Connection</button><button disabled={testState === 'sending'} onClick={() => void test()} className="rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}>{testState === 'sending' ? 'Sending Test Email…' : 'Send Test Email'}</button></div>{testState === 'sent' && <p className="mt-4 rounded-xl bg-emerald-400/10 p-3 text-sm" style={{ color: T.emerald }}>Test email delivered. The delivery log has been updated.</p>}{testState === 'failed' && <p className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm" style={{ color: T.red }}>{testError}</p>}</div><div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><h3 className="font-serif text-lg font-bold" style={{ color: T.text }}>Gmail setup guide</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm" style={{ color: T.textSub }}><li>Enable 2-Step Verification on the sender Gmail account.</li><li>Generate a Google App Password; normal Gmail passwords are not supported.</li><li>Save the App Password as the secure Supabase secret <code>GMAIL_SMTP_APP_PASSWORD</code>.</li><li>Validate the public configuration, then send a real test email.</li></ol></div></div>
}

function TeamManagementPanel({ show }: { show: (message: string) => void }) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [email, setEmail] = useAdminRecoveryState('settings.teamInviteEmail', '', value => typeof value === 'string')
  const [role, setRole] = useAdminRecoveryState<OrganizationRole>('settings.teamInviteRole', 'admin', value => value === 'owner' || value === 'admin' || value === 'support')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setMembers(await teamService.list()) } catch (error) { show(error instanceof Error ? error.message : 'Team members could not be loaded') } finally { setLoading(false) }
  }, [show])
  useEffect(() => { void load() }, [load])
  const invite = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return show('Enter a valid team member email')
    setLoading(true)
    try { await teamService.invite(email.trim(), role); setEmail(''); show('Invitation sent'); await load() } catch (error) { show(error instanceof Error ? error.message : 'Invitation could not be sent'); setLoading(false) }
  }
  return <div className="space-y-5"><div><p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.emerald }}>Owner access</p><h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Team Management</h2><p className="mt-1 text-sm" style={{ color: T.textMuted }}>Invite approved admins and support users into this organization.</p></div><div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div className="grid gap-3 md:grid-cols-[1fr_150px_auto]"><input value={email} onChange={event => setEmail(event.target.value)} type="email" placeholder="team@example.com" className="rounded-xl px-4 py-3 text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/><select value={role} onChange={event => setRole(event.target.value as OrganizationRole)} className="rounded-xl px-3 py-3 text-sm" style={{ background: T.bg3, border: `1px solid ${T.border}`, color: T.text }}><option value="admin">Admin</option><option value="support">Support</option><option value="owner">Owner</option></select><button disabled={loading} onClick={() => void invite()} className="rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-50" style={{ background: T.emerald, color: T.bg }}>Invite member</button></div></div><div className="overflow-hidden rounded-2xl" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>{members.map(member => <div key={member.userId} className="flex items-center justify-between gap-4 border-b p-4 last:border-0" style={{ borderColor: T.border }}><div className="min-w-0"><div className="truncate text-sm font-semibold" style={{ color: T.text }}>{member.email}</div><div className="mt-1 text-xs" style={{ color: T.textMuted }}>Joined {new Date(member.createdAt).toLocaleDateString()}</div></div><span className="rounded-full px-3 py-1 text-xs capitalize" style={{ background: member.role === 'owner' ? T.emeraldGlow : T.inputBg, color: member.role === 'owner' ? T.emerald : T.textSub }}>{member.role}</span></div>)}{!loading && !members.length && <div className="p-8 text-center text-sm" style={{ color: T.textMuted }}>No team members were returned.</div>}{loading && <div className="p-8 text-center text-sm" style={{ color: T.textMuted }}>Loading team…</div>}</div></div>
}

function TestDataCleanupPanel({ show }: { show: (message: string) => void }) {
  const categories: TestCleanupCategory[] = ['notifications', 'conversations', 'payments', 'bookings', 'analytics']
  const [selected, setSelected] = useState<TestCleanupCategory[]>(categories)
  const [preview, setPreview] = useState<Record<string, number> | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const loadPreview = async () => { setBusy(true); try { setPreview(await cleanupTestData(selected, true)) } catch (error) { show(error instanceof Error ? error.message : 'Could not load test-data preview.') } finally { setBusy(false) } }
  const execute = async () => { setBusy(true); try { const result = await cleanupTestData(selected, false); setPreview(result); setConfirming(false); show('Selected test data removed transactionally.') } catch (error) { show(error instanceof Error ? error.message : 'Test data cleanup failed.') } finally { setBusy(false) } }
  return <div className="space-y-5"><div><p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.red }}>Owner only</p><h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Test Data Cleanup</h2><p className="mt-1 text-sm" style={{ color: T.textMuted }}>Only records explicitly marked as test data are eligible. Names and email addresses are never guessed.</p></div><div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div className="grid gap-3 sm:grid-cols-2">{categories.map(category => <label key={category} className="flex items-center justify-between rounded-xl p-3 capitalize" style={{ background: T.inputBg, color: T.textSub }}><span>{category}{preview && <small className="ml-2" style={{ color: T.textMuted }}>({preview[category] ?? 0})</small>}</span><input type="checkbox" checked={selected.includes(category)} onChange={event => setSelected(current => event.target.checked ? [...current, category] : current.filter(item => item !== category))} className="accent-emerald-400"/></label>)}</div><div className="mt-5 flex flex-wrap gap-2"><button disabled={busy || !selected.length} onClick={() => void loadPreview()} className="rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-40" style={{ background: T.inputBg, color: T.text }}>Preview affected records</button><button disabled={busy || !selected.length || !preview} onClick={() => setConfirming(true)} className="rounded-xl px-4 py-2.5 text-xs font-bold disabled:opacity-40" style={{ background: T.red, color: '#fff' }}>Permanently clean selected test data</button></div></div>{confirming && <div className="fixed inset-0 z-[160] grid place-items-center bg-black/85 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-md rounded-3xl p-6" style={{ background: T.bg2, border: '1px solid rgba(239,68,68,.3)' }}><h3 className="font-serif text-xl font-bold" style={{ color: T.text }}>Confirm permanent cleanup</h3><p className="mt-3 text-sm" style={{ color: T.textSub }}>This owner-only action removes the selected records marked <code>is_test = true</code>. It cannot be undone.</p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setConfirming(false)} className="rounded-xl px-4 py-2 text-xs" style={{ background: T.inputBg, color: T.text }}>Cancel</button><button disabled={busy} onClick={() => void execute()} className="rounded-xl px-4 py-2 text-xs font-bold" style={{ background: T.red, color: '#fff' }}>{busy ? 'Cleaning…' : 'Delete test data'}</button></div></div></div>}</div>
}

function SettingsPage({ show }: { show: (m: string) => void }) {
  const { role } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const routeSection = location.pathname.startsWith('/admin/settings/') ? decodeURIComponent(location.pathname.slice('/admin/settings/'.length)).replaceAll('-', ' ') : null
  const [activeSection, setActiveSection] = useAdminRecoveryState('settings.activeSection', routeSection || 'organization', value => typeof value === 'string')
  const [, setReadinessVersion] = useState(0)
  const SECTIONS = ['organization', ...(role === 'owner' ? ['team', 'test data cleanup'] : []), 'email','branding','payments','media','notifications','social proof','localization','backup']
  const [organization, setOrganization] = useAdminRecoveryState<OrganizationSettings>('settings.organizationDraft', adminSettingsStore.get().organization, (value): value is OrganizationSettings => Boolean(value && typeof value === 'object' && typeof (value as OrganizationSettings).name === 'string'))
  const [brand, setBrand] = useAdminRecoveryState('settings.brandingDraft', adminSettingsStore.get().branding, (value): value is ReturnType<typeof adminSettingsStore.get>['branding'] => Boolean(value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string'))
  const [notificationPrefs, setNotificationPrefs] = useAdminRecoveryState('settings.notificationDraft', adminSettingsStore.get().notifications, (value): value is ReturnType<typeof adminSettingsStore.get>['notifications'] => Boolean(value && typeof value === 'object' && typeof (value as { bookings?: unknown }).bookings === 'boolean'))
  const togglePref = (key: keyof typeof notificationPrefs) => setNotificationPrefs(current => ({ ...current, [key]: !current[key] }))
  useEffect(() => {
    const refresh = () => setReadinessVersion(version => version + 1)
    const unsubscribers = [
      adminSettingsStore.subscribe(() => { const settings = adminSettingsStore.get(); setOrganization(settings.organization); setBrand(settings.branding); setNotificationPrefs(settings.notifications); refresh() }),
      platformPaymentStore.subscribe(refresh),
      emailService.subscribe(refresh),
      mediaLibraryStore.subscribe(refresh),
      socialProofStore.subscribe(refresh),
    ]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [])
  const readiness = getSettingsReadiness()
  const setupSections = SECTIONS.filter((section): section is SetupSection => section in readiness)
  const incompleteSections = setupSections.filter(section => !readiness[section].complete)
  const completedCount = setupSections.length - incompleteSections.length
  const activeReadiness = activeSection in readiness ? readiness[activeSection as SetupSection] : null
  const selectSection = (section: string) => { setActiveSection(section); navigate(`/admin/settings/${section.replaceAll(' ', '-')}`) }

  useEffect(() => { if (routeSection && SECTIONS.includes(routeSection) && routeSection !== activeSection) setActiveSection(routeSection) }, [activeSection, routeSection, SECTIONS, setActiveSection])

  return (
    <div className="flex flex-col gap-5 lg:flex-row" style={{ animation: 'fade-in-up 0.3s ease' }}>
      <div className="w-full shrink-0 lg:w-52">
        <div className="mb-3 rounded-2xl p-4" style={{ background: incompleteSections.length ? 'rgba(245,158,11,.08)' : T.emeraldGlow, border: `1px solid ${incompleteSections.length ? 'rgba(245,158,11,.25)' : 'rgba(0,255,136,.25)'}` }}>
          <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: incompleteSections.length ? T.gold : T.emerald }}>{incompleteSections.length ? 'Setup in progress' : 'Setup complete'}</div>
          <div className="mt-1 text-xl font-bold" style={{ color: T.text }}>{completedCount}/{setupSections.length}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: T.inputBg }}><div className="h-full rounded-full transition-[width]" style={{ width: `${setupSections.length ? (completedCount / setupSections.length) * 100 : 100}%`, background: incompleteSections.length ? T.gold : T.emerald }} /></div>
          {incompleteSections.length > 0 && <button onClick={() => selectSection(incompleteSections[0])} className="mt-3 text-left text-[10px] font-semibold" style={{ color: T.gold }}>Continue setup →</button>}
        </div>
        <div className="flex overflow-x-auto rounded-2xl lg:block" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
          {SECTIONS.map(s => (
            <button key={s} onClick={() => selectSection(s)}
              className="shrink-0 whitespace-nowrap border-r px-4 py-3 text-left text-xs capitalize transition-colors last:border-0 lg:block lg:w-full lg:border-b lg:border-r-0"
              style={{ borderColor: T.border, background: activeSection === s ? 'rgba(0,255,136,0.07)' : 'transparent', color: activeSection === s ? T.emerald : T.textSub }}>
              <span className="flex items-center justify-between gap-2"><span>{s}</span>{s in readiness && !readiness[s as SetupSection].complete && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-zinc-950">{readiness[s as SetupSection].issues.length}</span>}{s in readiness && readiness[s as SetupSection].complete && <span className="text-[10px]" style={{ color: T.emerald }}>✓</span>}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-5">
        {activeReadiness && !activeReadiness.complete && <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[.07] p-4"><div className="flex items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-400 text-sm font-black text-zinc-950">!</span><div><div className="text-sm font-bold" style={{ color: T.gold }}>Setup required</div><p className="mt-1 text-xs" style={{ color: T.textSub }}>Complete these items before relying on this configuration in a live event.</p><div className="mt-3 flex flex-wrap gap-2">{activeReadiness.issues.map(issue => <span key={issue} className="rounded-full border border-amber-400/20 bg-black/10 px-2.5 py-1 text-[10px] text-amber-200">{issue}</span>)}</div></div></div></div>}
        {activeSection === 'team' && role === 'owner' && <TeamManagementPanel show={show} />}
        {activeSection === 'test data cleanup' && role === 'owner' && <TestDataCleanupPanel show={show} />}
        {activeSection === 'organization' && (
          <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-5" style={{ color: T.textMuted }}>Organization Details</div>
            <div className="space-y-4 max-w-lg">
              {([['Organization Name','name'],['Website','website'],['Support Email','supportEmail'],['Phone','phone']] as const).map(([label,key]) => (
                <div key={key}>
                  <label className="text-xs font-mono uppercase tracking-wider block mb-2" style={{ color: T.textMuted }}>{label}</label>
                  <input value={organization[key]} onChange={event => setOrganization(current => ({ ...current, [key]: event.target.value }))} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/>
                </div>
              ))}
              <button onClick={() => { adminSettingsStore.saveOrganization(organization); show('Settings saved!') }} className="px-6 py-2.5 rounded-xl text-sm font-bold" style={{ background: 'linear-gradient(135deg,#00FF88,#00C866)', color: '#09090B' }}>
                Save Changes
              </button>
            </div>
          </div>
        )}

        {activeSection === 'payments' && (
          <div>
            <div className="mb-5">
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.emerald }}>Platform configuration</p>
              <h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Payment Settings</h2>
              <p className="mt-1 text-sm" style={{ color: T.textMuted }}>Configure payment methods and cryptocurrency wallets for all events.</p>
            </div>
            <PaymentSettingsPanel show={show} />
          </div>
        )}

        {activeSection === 'email' && <EmailConfigurationPanel show={show} />}

        {activeSection === 'branding' && <div className="space-y-5"><div><p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.emerald }}>Public experience</p><h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Branding</h2><p className="mt-1 text-sm" style={{ color: T.textMuted }}>Control how your booking pages look to every visitor.</p></div><div className="grid gap-5 xl:grid-cols-[1fr_.7fr]"><div className="rounded-2xl p-5 space-y-4" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>{[['Brand name','name'],['Tagline','tagline'],['Accent color','accent']].map(([label, key]) => <label key={key} className="block text-xs font-mono uppercase tracking-wider" style={{ color: T.textMuted }}>{label}<input value={brand[key as keyof typeof brand]} type={key === 'accent' ? 'color' : 'text'} onChange={event => setBrand(current => ({ ...current, [key]: event.target.value }))} className="mt-2 block h-11 w-full rounded-xl px-3 text-sm normal-case" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/></label>)}<button onClick={() => { adminSettingsStore.saveBranding(brand); show('Brand settings saved') }} className="rounded-xl px-5 py-2.5 text-sm font-bold" style={{ background: T.emerald, color: T.bg }}>Save branding</button></div><div className="rounded-2xl p-6" style={{ background: `linear-gradient(135deg,${brand.accent}24,#18181B)`, border: `1px solid ${brand.accent}55` }}><div className="text-[10px] font-mono uppercase" style={{ color: T.textMuted }}>Live preview</div><div className="mt-10 font-serif text-3xl font-bold" style={{ color: T.text }}>{brand.name}</div><div className="mt-2 text-sm" style={{ color: T.textSub }}>{brand.tagline}</div><button className="mt-8 rounded-xl px-4 py-2 text-xs font-bold" style={{ background: brand.accent, color: T.bg }}>Book tickets</button></div></div></div>}

        {activeSection === 'media' && <div><div className="mb-5"><p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.emerald }}>Asset management</p><h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Media Settings</h2><p className="mt-1 text-sm" style={{ color: T.textMuted }}>Upload, organize, preview, rename, and remove assets used across your event pages.</p></div><MediaLibraryPage show={show}/></div>}

        {activeSection === 'notifications' && <div className="space-y-5"><div><p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.emerald }}>Admin alerts</p><h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>Notification Settings</h2><p className="mt-1 text-sm" style={{ color: T.textMuted }}>Choose which real-time events deserve your attention.</p></div><div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>{([{ key: 'bookings', label: 'New bookings', desc: 'Immediately alert on confirmed and pending bookings.' }, { key: 'payments', label: 'Payment reviews', desc: 'Alert when customer proof or manual review is required.' }, { key: 'support', label: 'Support messages', desc: 'Alert when a customer starts or replies to a conversation.' }, { key: 'daily', label: 'Daily performance digest', desc: 'Receive a summary of sales and visitor activity.' }] as const).map(item => <div key={item.key} className="flex items-center justify-between gap-4 border-b py-4 last:border-0" style={{ borderColor: T.border }}><div><div className="text-sm font-semibold" style={{ color: T.text }}>{item.label}</div><div className="mt-1 text-xs" style={{ color: T.textMuted }}>{item.desc}</div></div><button aria-label={`Toggle ${item.label}`} onClick={() => togglePref(item.key)} className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full p-1" style={{ background: notificationPrefs[item.key] ? T.emerald : T.border }}><span className={`block h-4 w-4 rounded-full bg-white transition-transform ${notificationPrefs[item.key] ? 'translate-x-5' : 'translate-x-0'}`}/></button></div>)}<button onClick={() => { adminSettingsStore.saveNotifications(notificationPrefs); show('Notification preferences saved') }} className="mt-4 rounded-xl px-5 py-2.5 text-sm font-bold" style={{ background: T.emerald, color: T.bg }}>Save preferences</button></div></div>}

        {activeSection === 'social proof' && <SocialProofPage show={show}/>} 

        {activeSection === 'security' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-4" style={{ color: T.textMuted }}>Security Settings</div>
              {[
                { label: 'Two-Factor Authentication', desc: 'Require 2FA for all admin users', enabled: true },
                { label: 'Session Timeout', desc: 'Auto-logout after 30 minutes of inactivity', enabled: true },
                { label: 'IP Allowlist', desc: 'Restrict admin access to specific IPs', enabled: false },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between py-4 border-b last:border-0" style={{ borderColor: T.border }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: T.text }}>{s.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: T.textMuted }}>{s.desc}</div>
                  </div>
                  <button onClick={() => show('Toggle updated!')}
                    className="w-12 h-6 rounded-full transition-all relative"
                    style={{ background: s.enabled ? T.emerald : T.border }}>
                    <span className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all" style={{ left: s.enabled ? 28 : 4 }}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'api' && (
          <div className="rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-5" style={{ color: T.textMuted }}>API Keys</div>
            <div className="space-y-3">
              {[
                { label: 'Live Secret Key', key: 'sk_live_••••••••••••••••••••xOC5u', created: 'Jan 12, 2025' },
                { label: 'Live Publishable Key', key: 'pk_live_••••••••••••••••••••xOC5u', created: 'Jan 12, 2025' },
                { label: 'Webhook Signing Secret', key: 'whsec_••••••••••••••••••••xOC5u', created: 'Mar 5, 2025' },
              ].map(k => (
                <div key={k.label} className="p-4 rounded-xl flex items-center gap-3" style={{ background: T.bg3, border: `1px solid ${T.border}` }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold mb-1" style={{ color: T.text }}>{k.label}</div>
                    <div className="font-mono text-xs" style={{ color: T.textMuted }}>{k.key}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: T.textMuted }}>Created {k.created}</div>
                  </div>
                  <button onClick={() => show('Copied!')} className="p-2 rounded-lg" style={{ background: T.inputBg, color: T.textMuted }}><Icons.copy/></button>
                  <button onClick={() => show('Key regenerated!')} className="p-2 rounded-lg" style={{ background: T.inputBg, color: T.textMuted }}><Icons.refresh/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSection === 'localization' && (
          <LocalizationSettingsPanel />
        )}

        {activeSection === 'backup' && (
          <div className="rounded-2xl p-12 text-center" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
            <div className="text-3xl mb-3">⚙️</div>
            <div className="font-serif text-xl font-bold mb-2" style={{ color: T.text }}>{activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} Settings</div>
            <div className="text-sm" style={{ color: T.textMuted }}>Export a portable snapshot of event data, bookings, and platform configuration.</div>
            <button onClick={() => show('Backup export prepared')} className="mt-4 px-6 py-2 rounded-xl text-sm font-semibold" style={{ background: 'rgba(0,255,136,0.1)', color: T.emerald, border: '1px solid rgba(0,255,136,0.2)' }}>
              Create Backup
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const SHOW_TYPES = ['Private Show','Concert','Music Festival','Comedy Show','Theatre','Dance Performance','Sports Event','Conference','Workshop','Seminar','Exhibition','Art Show','Fashion Show','Film Screening','Awards Ceremony','Fundraiser','Nightlife Event','Religious Gathering','Community Event','Product Launch']
const PAYMENT_OPTIONS = ['Card','Bank Transfer','PayPal','Apple Pay','Google Pay','Cash App','Cryptocurrency','Apple Gift Card']
const BUILDER_SECTIONS = ['Hero','About the show','Venue map','Event timeline','Ticket/package selection','Testimonials','FAQ section','Call-to-action section','Footer']

function EventBuilder({ event, onSave, onExit, show }: { event: ManagedEvent; onSave: (event: ManagedEvent) => void; onExit: () => void; show: (message: string) => void }) {
  const initial = event.setup?.sectionContent ?? {}
  const [content, setContent] = useState<Record<string, string>>(() => Object.fromEntries(BUILDER_SECTIONS.map(section => [section, initial[section] ?? (section === 'Hero' ? `${event.title}\n${event.date} · ${event.venue}` : section === 'About the show' ? `Hosted by ${event.setup?.hostName || 'your host'} · ${event.setup?.showType || 'Live event'}` : `${section} content`)])))
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [paymentMethods, setPaymentMethods] = useState(event.setup?.paymentMethods ?? ['Card'])
  const save = (status: 'draft' | 'live') => { const next: ManagedEvent = { ...event, status, setup: { hostName: event.setup?.hostName ?? '', showType: event.setup?.showType ?? '', startTime: event.setup?.startTime ?? '', endTime: event.setup?.endTime ?? '', mapLink: event.setup?.mapLink ?? '', banners: event.setup?.banners ?? [], paymentMethods, sectionContent: content } }; onSave(next); return next }
  const eventLink = `${window.location.origin}/e/${event.id.slice(0, 8)}`
  const edit = (section: string) => { setSelected(section); setDraft(content[section]); }
  return <div className="min-h-[calc(100vh-8rem)]" style={{ animation: 'fade-in-up .25s ease' }}>
    <div className="sticky top-14 z-20 -mx-4 mb-5 flex flex-wrap items-center gap-2 border-b px-4 py-3 lg:-mx-6 lg:px-6" style={{ background: 'rgba(9,9,11,.94)', borderColor: T.border, backdropFilter: 'blur(16px)' }}>
      <div className="mr-auto"><div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: T.emerald }}>Unpublished event builder</div><div className="text-sm font-semibold" style={{ color: T.text }}>{event.title}</div></div>
      <button onClick={() => { save('draft'); show('Draft saved') }} className="px-3 py-2 rounded-xl text-xs" style={{ background: T.inputBg, color: T.textSub }}>Save draft</button>
      <button onClick={onExit} className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,.08)', color: T.red }}>Cancel</button>
      <button onClick={() => { save('live'); show(`Event published — share ${eventLink}`) }} className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: T.emerald, color: T.bg }}>Publish</button>
    </div>
    <div className="mb-5 rounded-2xl p-4" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-semibold" style={{ color: T.text }}>Share links</div><div className="mt-1 text-xs" style={{ color: T.textMuted }}>Event link becomes public after publishing. The default demo template always remains viewable.</div></div><div className="flex flex-wrap gap-2"><button onClick={() => navigator.clipboard?.writeText(eventLink).then(() => show('Event link copied'))} className="px-3 py-2 rounded-xl text-xs" style={{ background: T.inputBg, color: T.cyan }}>Copy event link</button><button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/template/default-booking`).then(() => show('Default template link copied'))} className="px-3 py-2 rounded-xl text-xs" style={{ background: T.inputBg, color: T.cyan }}>Copy default link</button></div></div></div>
    <div className="grid gap-5 xl:grid-cols-[1fr_20rem]"><div className="space-y-4">{BUILDER_SECTIONS.map((section, index) => <button key={section} onDoubleClick={() => edit(section)} onClick={() => edit(section)} className="w-full rounded-2xl p-5 text-left transition-colors" style={{ background: T.cardSolid, border: `1px solid ${selected === section ? 'rgba(0,255,136,.5)' : T.cardBorder}` }}><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'rgba(0,255,136,.12)', color: T.emerald }}>{index + 1}</span><div className="text-sm font-semibold" style={{ color: T.text }}>{section}</div><span className="ml-auto text-[10px] font-mono" style={{ color: T.textMuted }}>Double-click to edit</span></div><div className="mt-3 whitespace-pre-line text-sm leading-relaxed" style={{ color: T.textSub }}>{content[section]}</div>{section === 'Hero' && event.setup?.banners?.[0] && <img src={event.setup.banners[0]} alt="Event banner" className="mt-4 h-36 w-full rounded-xl object-cover"/>}</button>)}</div>
      <aside className="h-fit rounded-2xl p-4" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div className="text-xs font-mono uppercase" style={{ color: T.textMuted }}>Accepted payments</div><div className="mt-3 space-y-2">{PAYMENT_OPTIONS.map(method => <label key={method} className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs" style={{ background: paymentMethods.includes(method) ? 'rgba(0,255,136,.08)' : T.inputBg, color: paymentMethods.includes(method) ? T.emerald : T.textSub }}><span>{method}</span><input type="checkbox" checked={paymentMethods.includes(method)} onChange={() => setPaymentMethods(list => list.includes(method) ? list.filter(item => item !== method) : [...list, method])}/></label>)}</div></aside></div>
    {selected && <div className="fixed inset-y-0 right-0 z-[100] w-full max-w-md p-5 shadow-2xl" style={{ background: T.bg2, borderLeft: `1px solid ${T.cardBorder}`, animation: 'panel-in .25s ease' }}><div className="flex items-center justify-between"><div><div className="text-[10px] font-mono uppercase" style={{ color: T.emerald }}>Edit section</div><div className="font-serif text-xl font-bold" style={{ color: T.text }}>{selected}</div></div><button onClick={() => setSelected(null)} style={{ color: T.textMuted }}><Icons.x/></button></div><label className="mt-6 block text-xs" style={{ color: T.textMuted }}>Original text / content</label><textarea value={draft} onChange={event => setDraft(event.target.value)} className="mt-2 h-48 w-full rounded-xl p-3 text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/>{selected === 'Hero' && <div className="mt-4"><label className="text-xs" style={{ color: T.textMuted }}>Replace hero media (1–5 images)</label><input multiple accept="image/*" type="file" className="mt-2 block w-full text-xs" onChange={async input => { const files = Array.from(input.target.files ?? []).slice(0, 5); const banners = await Promise.all(files.map(file => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file) }))); event.setup = { ...(event.setup ?? { hostName:'', showType:'', startTime:'', endTime:'', mapLink:'', paymentMethods, sectionContent:content, banners:[] }), banners }; show('Hero media updated') }}/><button onClick={() => { if (event.setup) event.setup.banners = []; show('Hero media removed') }} className="mt-2 text-xs" style={{ color: T.red }}>Delete hero media</button></div>}<div className="absolute bottom-5 right-5 flex gap-2"><button onClick={() => setSelected(null)} className="px-4 py-2 rounded-xl text-xs" style={{ background: T.inputBg, color: T.textSub }}>Cancel</button><button onClick={() => { setContent(current => ({ ...current, [selected]: draft })); setSelected(null) }} className="px-4 py-2 rounded-xl text-xs font-bold" style={{ background: T.emerald, color: T.bg }}>Apply</button></div></div>}
  </div>
}

function EventsPage({ show, createSignal = 0 }: { show: (m: string) => void; createSignal?: number }) {
  const [events, setEvents] = useState<ManagedEvent[]>(() => adminEventStore.list())
  const [open, setOpen] = useState(false)
  const empty = { name: '', host: '', venue: '', date: '', start: '', end: '', map: '', capacity: '100', showType: '', guestPerformers: [] as string[], payments: ['Card'], banners: [] as string[] }
  const [form, setForm] = useState(empty)
  useEffect(() => { if (createSignal) setOpen(true) }, [createSignal])
  const create = () => { if (!form.name || !form.host || !form.venue || !form.date || !form.start || !form.end || !form.map || !form.showType) return show('Complete all required event details'); const id = crypto.randomUUID(); const setup = { name: form.name, host: form.host, venue: form.venue, date: form.date, start: form.start, end: form.end, map: form.map, capacity: Number(form.capacity), showType: form.showType, guestPerformers: form.guestPerformers, banners: form.banners }; const event: ManagedEvent = { id, title: form.name, venue: form.venue, date: `${form.date} · ${form.start}–${form.end}`, banner: form.banners[0], sold: 0, capacity: Number(form.capacity), revenue: 0, status: 'draft', schedule: [], bookingPage: createBookingPageData(setup), setup: { hostName: form.host, showType: form.showType, startTime: form.start, endTime: form.end, mapLink: form.map, banners: form.banners, paymentMethods: form.payments, sectionContent: {} } }; adminEventStore.save(event); setEvents(adminEventStore.list()); setOpen(false); show('Event created successfully'); window.location.assign(`/admin/events/${id}/edit`) }
  return <div className="space-y-5"><div className="flex items-center justify-between"><div className="text-sm" style={{ color: T.textSub }}>{events.length} events</div><button onClick={() => { setForm(empty); setOpen(true) }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: T.emerald, color: T.bg }}><Icons.plus/> Create New Event</button></div><section className="overflow-hidden rounded-2xl" style={{ background: T.cardSolid, border: `1px solid rgba(0,255,136,.28)` }}><div className="grid gap-5 p-5 md:grid-cols-[180px_1fr]"><div className="rounded-xl bg-gradient-to-br from-emerald-400/20 to-violet-500/15 p-5"><div className="text-xs font-mono uppercase tracking-widest" style={{ color: T.emerald }}>Default</div><div className="mt-2 font-serif text-xl font-bold" style={{ color: T.text }}>Booking Template</div></div><div><p className="text-sm" style={{ color: T.textSub }}>The original Apex booking page. Preview or edit this same template; every new event begins as a complete clone of it.</p><div className="mt-4 flex flex-wrap gap-2"><a href="/demo" className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.textSub }}>Preview</a><a href="/admin/events/template/edit" className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: T.emerald, color: T.bg }}>Edit Template</a><button onClick={() => { const copy = structuredClone(createBookingPageData()); const id = crypto.randomUUID(); adminEventStore.save({ id, title: 'Booking Template Copy', venue: copy.venue.name, date: copy.hero.date, banner: copy.hero.images[0], sold: 0, capacity: copy.packages.reduce((sum, item) => sum + item.seats, 0), revenue: 0, status: 'draft', schedule: [], bookingPage: copy }); setEvents(adminEventStore.list()); window.location.assign(`/admin/events/${id}/edit`) }} className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.textSub }}>Duplicate</button><a href="/demo" className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.cyan }}>View Demo</a></div></div></div></section>{events.length === 0 ? <DataReadyPage title="Create your first event" description="Start with the event details, then tailor the existing booking page before publishing." actionLabel="Use Create New Event"/> : <div className="grid gap-4 md:grid-cols-2">{events.map(event => <div key={event.id} className="rounded-2xl overflow-hidden" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>{event.banner && <img src={event.banner} className="h-36 w-full object-cover"/>}<div className="p-5"><StatusBadge status={event.status}/><div className="mt-3 font-serif text-xl font-bold" style={{ color: T.text }}>{event.title}</div><div className="mt-1 text-xs" style={{ color: T.textMuted }}>{event.venue} · {event.date}</div><a href={`/admin/events/${event.id}/edit`} className="mt-4 inline-flex px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: T.inputBg, color: T.emerald }}>Edit booking page</a></div></div>)}</div>}
    {open && <div className="fixed inset-0 z-[200] overflow-y-auto p-4" style={{ background: 'rgba(0,0,0,.72)' }}><div className="mx-auto my-8 max-w-3xl rounded-3xl p-6" style={{ background: T.bg2, border: `1px solid ${T.cardBorder}` }}><div className="flex justify-between"><div><div className="font-serif text-2xl font-bold" style={{ color: T.text }}>Create new event</div><div className="mt-1 text-xs" style={{ color: T.textMuted }}>These details tailor the new booking page before it is published.</div></div><button onClick={() => setOpen(false)}><Icons.x/></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{[['Event / show name','name','text'],['Host name','host','text'],['Venue','venue','text'],['Date','date','date'],['Start time','start','time'],['End time','end','time'],['Google Maps directions link','map','url'],['Show capacity','capacity','number']].map(([label,key,type]) => <label key={key} className={key === 'map' ? 'sm:col-span-2' : ''}><span className="text-xs" style={{ color: T.textMuted }}>{label} *</span><input type={type} value={(form as any)[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/></label>)}<label><span className="text-xs" style={{ color: T.textMuted }}>Show type *</span><select value={form.showType} onChange={event => setForm(current => ({ ...current, showType: event.target.value }))} className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}><option value="">Select a show type</option>{SHOW_TYPES.map(type => <option key={type}>{type}</option>)}</select></label><div><div className="text-xs" style={{ color: T.textMuted }}>Accepted payment methods</div><div className="mt-2 flex flex-wrap gap-2">{PAYMENT_OPTIONS.map(method => <button key={method} onClick={() => setForm(current => ({ ...current, payments: current.payments.includes(method) ? current.payments.filter(item => item !== method) : [...current.payments, method] }))} className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: form.payments.includes(method) ? 'rgba(0,255,136,.12)' : T.inputBg, color: form.payments.includes(method) ? T.emerald : T.textMuted }}>{method}</button>)}</div></div><label className="sm:col-span-2"><span className="text-xs" style={{ color: T.textMuted }}>Show banners (upload 1–5 images)</span><input type="file" accept="image/*" multiple className="mt-2 block text-xs" onChange={async input => { const files = Array.from(input.target.files ?? []).slice(0, 5); const banners = await Promise.all(files.map(file => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file) }))); setForm(current => ({ ...current, banners })) }}/><div className="mt-2 text-xs" style={{ color: T.textMuted }}>{form.banners.length}/5 banner images selected</div></label></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="px-4 py-2.5 rounded-xl text-sm" style={{ background: T.inputBg, color: T.textSub }}>Cancel</button><button onClick={create} className="px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: T.emerald, color: T.bg }}>Create event and edit page</button></div></div></div>}
  </div>
}

function EventCatalogPage({ show, createSignal = 0 }: { show: (message: string) => void; createSignal?: number }) {
  const empty = { name: '', host: '', venue: '', date: '', start: '', end: '', map: '', capacity: '100', showType: '', guestPerformers: [] as string[], payments: ['Card'], banners: [] as string[] }
  const [events, setEvents] = useState<ManagedEvent[]>(() => adminEventStore.list())
  const [form, setForm] = useState(empty)
  const [open, setOpen] = useState(false)
  const [performer, setPerformer] = useState('')
  useEffect(() => adminEventStore.subscribe(() => setEvents(adminEventStore.list())), [])
  useEffect(() => { void adminEventStore.hydrate().then(setEvents).catch(() => undefined) }, [])
  useEffect(() => { if (createSignal) { setForm(empty); setOpen(true) } }, [createSignal])
  const create = () => {
    if (!form.name || !form.host || !form.venue || !form.date || !form.start || !form.end || !form.map || !form.showType) return show('Complete all required event details')
    const id = crypto.randomUUID()
    const page = createBookingPageData({ ...form, capacity: Number(form.capacity) }, masterBookingTemplateStore.load())
    adminEventStore.save({ id, title: form.name, venue: form.venue, date: `${form.date} · ${form.start}–${form.end}`, banner: form.banners[0], sold: 0, capacity: Number(form.capacity), revenue: 0, status: 'draft', schedule: [], bookingPage: page, setup: { hostName: form.host, showType: form.showType, startTime: form.start, endTime: form.end, mapLink: form.map, banners: form.banners, paymentMethods: form.payments, sectionContent: {} } })
    setEvents(adminEventStore.list()); setOpen(false); show('Draft created'); window.location.assign(`/admin/events/${id}/edit`)
  }
  const duplicateTemplate = () => { const page = createBookingPageData({}, masterBookingTemplateStore.load()); const id = crypto.randomUUID(); adminEventStore.save({ id, title: 'Booking Template Copy', venue: page.venue.name, date: page.hero.date, banner: page.hero.images[0], sold: 0, capacity: page.packages.reduce((sum, item) => sum + item.seats, 0), revenue: 0, status: 'draft', schedule: [], bookingPage: page }); window.location.assign(`/admin/events/${id}/edit`) }
  const grouped = { draft: events.filter(event => event.status === 'draft'), published: events.filter(event => event.status === 'published'), archived: events.filter(event => event.status === 'archived') }
  const EventCards = ({ title, list }: { title: string; list: ManagedEvent[] }) => <section><h2 className="mb-3 text-xs font-mono uppercase tracking-widest" style={{ color: T.textMuted }}>{title} · {list.length}</h2>{list.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map(event => <article key={event.id} className="overflow-hidden rounded-2xl" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>{event.bookingPage?.hero.images[0] || event.banner ? <img src={event.bookingPage?.hero.images[0] ?? event.banner} className="h-32 w-full object-cover"/> : null}<div className="p-4"><StatusBadge status={event.status}/><h3 className="mt-3 font-serif text-lg font-bold" style={{ color: T.text }}>{event.title}</h3><p className="mt-1 text-xs" style={{ color: T.textMuted }}>{event.venue} · {event.date}</p><a href={`/admin/events/${event.id}/edit`} className="mt-4 inline-flex rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: T.inputBg, color: T.emerald }}>{event.status === 'archived' ? 'View booking page' : 'Edit booking page'}</a></div></article>)}</div> : <div className="rounded-2xl border border-dashed p-6 text-sm" style={{ borderColor: T.cardBorder, color: T.textMuted }}>No {title.toLowerCase()} yet.</div>}</section>
  return <div className="space-y-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-mono uppercase tracking-widest" style={{ color: T.emerald }}>Event pages</p><h1 className="mt-1 font-serif text-2xl font-bold" style={{ color: T.text }}>Events</h1></div><button onClick={() => { setForm(empty); setOpen(true) }} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: T.emerald, color: T.bg }}><Icons.plus/> Create Event</button></div><section className="overflow-hidden rounded-2xl" style={{ background: T.cardSolid, border: '1px solid rgba(0,255,136,.30)' }}><div className="grid gap-5 p-5 md:grid-cols-[11rem_1fr]"><div className="rounded-2xl p-5" style={{ background: 'linear-gradient(135deg,rgba(0,255,136,.14),rgba(139,92,246,.14))' }}><p className="text-xs font-mono uppercase" style={{ color: T.emerald }}>Default</p><h2 className="mt-2 font-serif text-xl font-bold" style={{ color: T.text }}>Booking Template</h2></div><div><p className="text-sm leading-relaxed" style={{ color: T.textSub }}>The original booking page is the source template. Preview, edit, and duplicate this exact page—new events inherit every section, package, testimonial, FAQ, animation, and style.</p><div className="mt-4 flex flex-wrap gap-2"><a href="/demo" className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.textSub }}>Preview</a><a href="/admin/events/template/edit" className="rounded-xl px-3 py-2 text-xs font-bold" style={{ background: T.emerald, color: T.bg }}>Edit Template</a><button onClick={duplicateTemplate} className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.textSub }}>Duplicate</button><a href="/demo" className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.cyan }}>View Demo</a></div></div></div></section><EventCards title="Draft Events" list={grouped.draft}/><EventCards title="Published Events" list={grouped.published}/><EventCards title="Archived Events" list={grouped.archived}/>{open && <div className="fixed inset-0 z-[300] overflow-y-auto bg-black/75 p-4"><div className="mx-auto my-6 w-full max-w-3xl rounded-3xl p-6" style={{ background: T.bg2, border: `1px solid ${T.cardBorder}` }}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-mono uppercase tracking-widest" style={{ color: T.emerald }}>Event setup</p><h2 className="mt-1 font-serif text-2xl font-bold" style={{ color: T.text }}>Create draft</h2><p className="mt-1 text-sm" style={{ color: T.textMuted }}>Continue opens the existing booking page in editor mode.</p></div><button onClick={() => setOpen(false)}><Icons.x/></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2">{[['Event name', 'name', 'text'], ['Host name', 'host', 'text'], ['Venue', 'venue', 'text'], ['Date', 'date', 'date'], ['Start time', 'start', 'time'], ['End time', 'end', 'time'], ['Google Maps link', 'map', 'url'], ['Capacity', 'capacity', 'number']].map(([label, key, type]) => <label key={key}><span className="text-xs" style={{ color: T.textMuted }}>{label} *</span><input type={type} value={(form as any)[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}/></label>)}<label><span className="text-xs" style={{ color: T.textMuted }}>Show type *</span><select value={form.showType} onChange={event => setForm(current => ({ ...current, showType: event.target.value }))} className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: T.inputBg, border: `1px solid ${T.border}`, color: T.text }}><option value="">Select a show type</option>{SHOW_TYPES.map(type => <option key={type}>{type}</option>)}</select></label><div><span className="text-xs" style={{ color: T.textMuted }}>Accepted payment methods</span><div className="mt-2 flex flex-wrap gap-2">{PAYMENT_OPTIONS.map(method => <button key={method} type="button" onClick={() => setForm(current => ({ ...current, payments: current.payments.includes(method) ? current.payments.filter(item => item !== method) : [...current.payments, method] }))} className="rounded-lg px-2.5 py-1.5 text-[11px]" style={{ background: form.payments.includes(method) ? 'rgba(0,255,136,.12)' : T.inputBg, color: form.payments.includes(method) ? T.emerald : T.textMuted }}>{method}</button>)}</div></div><div className="sm:col-span-2 rounded-2xl p-4" style={{ background: T.inputBg, border: `1px solid ${T.border}` }}><div className="flex flex-wrap gap-2"><input value={performer} onChange={event => setPerformer(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); if (performer.trim()) { setForm(current => ({ ...current, guestPerformers: [...current.guestPerformers, performer.trim()] })); setPerformer('') } } }} placeholder="Add guest performer (optional)" className="min-w-48 flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={{ background: T.bg2, border: `1px solid ${T.border}`, color: T.text }}/><button type="button" onClick={() => { if (performer.trim()) { setForm(current => ({ ...current, guestPerformers: [...current.guestPerformers, performer.trim()] })); setPerformer('') } }} className="rounded-xl px-3 py-2 text-xs" style={{ background: T.emerald, color: T.bg }}>Add performer</button></div>{form.guestPerformers.length > 0 && <div className="mt-3 space-y-2">{form.guestPerformers.map((name, index) => <div key={`${name}-${index}`} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm" style={{ background: T.bg2 }}><span className="flex-1">{name}</span><button type="button" disabled={index === 0} onClick={() => setForm(current => { const guests = [...current.guestPerformers]; [guests[index - 1], guests[index]] = [guests[index], guests[index - 1]]; return { ...current, guestPerformers: guests } })} className="text-xs disabled:opacity-30">↑</button><button type="button" disabled={index === form.guestPerformers.length - 1} onClick={() => setForm(current => { const guests = [...current.guestPerformers]; [guests[index + 1], guests[index]] = [guests[index], guests[index + 1]]; return { ...current, guestPerformers: guests } })} className="text-xs disabled:opacity-30">↓</button><button type="button" onClick={() => setForm(current => ({ ...current, guestPerformers: current.guestPerformers.filter((_item, itemIndex) => itemIndex !== index) }))} className="text-xs" style={{ color: T.red }}>Remove</button></div>)}</div>}</div><label className="sm:col-span-2"><span className="text-xs" style={{ color: T.textMuted }}>Hero images</span><input type="file" accept="image/*" multiple className="mt-2 block text-xs" onChange={async event => { const files = Array.from(event.target.files ?? []).slice(0, 5); const banners = await Promise.all(files.map(file => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file) }))); setForm(current => ({ ...current, banners })) }}/><span className="mt-2 block text-xs" style={{ color: T.textMuted }}>{form.banners.length}/5 selected</span></label></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm" style={{ background: T.inputBg, color: T.textSub }}>Cancel</button><button onClick={create} className="rounded-xl px-4 py-2.5 text-sm font-bold" style={{ background: T.emerald, color: T.bg }}>Continue to booking page</button></div></div></div>}</div>
}

function EventManagementPanel({ show }: { show: (message: string) => void }) {
  const [events, setEvents] = useState<ManagedEvent[]>(() => adminEventStore.list())
  const [selected, setSelected] = useState<string[]>([])
  const refresh = () => { setEvents(adminEventStore.list()); setSelected([]) }
  const save = (event: ManagedEvent, message: string) => { adminEventStore.save(event); refresh(); show(message) }
  const duplicate = (event: ManagedEvent) => { const copy = structuredClone(event); copy.id = crypto.randomUUID(); copy.title = `${event.title} (Copy)`; copy.status = 'draft'; copy.publication = { slug: `${event.publication?.slug ?? 'event'}-copy`, shortCode: `ABX${Math.random().toString(36).slice(2, 7).toUpperCase()}` }; copy.packages = copy.packages?.map(item => ({ ...item, id: crypto.randomUUID() })); const packageIds = new Map((event.packages ?? []).map((item, index) => [item.id, copy.packages?.[index]?.id])); copy.seats = copy.seats?.map(item => ({ ...item, id: crypto.randomUUID(), packageId: packageIds.get(item.packageId) ?? item.packageId, status: 'available' })); adminEventStore.save(copy); refresh(); show('Event duplicated as a draft') }
  const remove = (event: ManagedEvent) => { if (!window.confirm(`Delete “${event.title}”? This immediately removes public access and cannot be undone.`)) return; adminEventStore.remove(event.id); refresh(); show('Event deleted') }
  const bulk = (action: 'publish' | 'archive' | 'delete' | 'duplicate' | 'export') => { const chosen = events.filter(event => selected.includes(event.id)); if (!chosen.length) return show('Select one or more events first'); if ((action === 'archive' || action === 'delete') && !window.confirm(`Apply this action to ${chosen.length} event(s)?`)) return; if (action === 'export') { const data = new Blob([JSON.stringify(chosen, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(data); link.download = 'apex-event-export.json'; link.click(); URL.revokeObjectURL(link.href); return show('Event data exported') } chosen.forEach(event => { if (action === 'publish') adminEventStore.save({ ...event, status: 'published', publication: { ...event.publication!, publishedAt: new Date().toISOString() } }); if (action === 'archive') adminEventStore.save({ ...event, status: 'archived', publication: { ...event.publication!, archivedAt: new Date().toISOString() } }); if (action === 'delete' && event.status === 'draft') adminEventStore.remove(event.id); if (action === 'duplicate') duplicate(event) }); refresh(); show(`${chosen.length} event${chosen.length > 1 ? 's' : ''} updated`) }
  if (!events.length) return null
  return <section className="mt-8 rounded-2xl p-5" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-mono uppercase tracking-widest" style={{ color: T.emerald }}>Event operations</p><h2 className="mt-1 font-serif text-xl font-bold" style={{ color: T.text }}>Manage events at scale</h2></div><div className="flex flex-wrap gap-2"><button onClick={() => bulk('publish')} className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(0,255,136,.1)', color: T.emerald }}>Publish</button><button onClick={() => bulk('archive')} className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.textSub }}>Archive</button><button onClick={() => bulk('duplicate')} className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.textSub }}>Duplicate</button><button onClick={() => bulk('export')} className="rounded-xl px-3 py-2 text-xs" style={{ background: T.inputBg, color: T.textSub }}>Export</button><button onClick={() => bulk('delete')} className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,.1)', color: T.red }}>Delete drafts</button></div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead style={{ color: T.textMuted }}><tr><th className="p-2"><input type="checkbox" checked={selected.length === events.length} onChange={event => setSelected(event.target.checked ? events.map(item => item.id) : [])}/></th><th className="p-2">Event</th><th className="p-2">Status</th><th className="p-2">Bookings</th><th className="p-2">Revenue</th><th className="p-2">Created</th><th className="p-2"></th></tr></thead><tbody>{events.map(event => <tr key={event.id} className="border-t" style={{ borderColor: T.border, color: T.textSub }}><td className="p-2"><input type="checkbox" checked={selected.includes(event.id)} onChange={input => setSelected(current => input.target.checked ? [...current, event.id] : current.filter(id => id !== event.id))}/></td><td className="p-2"><div className="font-semibold" style={{ color: T.text }}>{event.title}</div><div className="mt-1" style={{ color: T.textMuted }}>{event.venue}</div></td><td className="p-2"><StatusBadge status={event.status}/></td><td className="p-2">{event.sold}</td><td className="p-2">${event.revenue.toLocaleString()}</td><td className="p-2">{event.publication?.publishedAt ? new Date(event.publication.publishedAt).toLocaleDateString() : 'Draft'}</td><td className="p-2"><div className="flex gap-2"><button onClick={() => void navigator.clipboard?.writeText(`${window.location.origin}/events/${event.publication?.slug}`)} style={{ color: T.cyan }}>Copy link</button>{event.status === 'archived' ? <button onClick={() => save({ ...event, status: 'draft', publication: { ...event.publication!, archivedAt: undefined } }, 'Archived event restored as draft')} style={{ color: T.emerald }}>Restore</button> : <button onClick={() => save({ ...event, status: event.status === 'published' ? 'draft' : 'published', publication: { ...event.publication!, publishedAt: event.status === 'published' ? undefined : new Date().toISOString() } }, event.status === 'published' ? 'Event unpublished' : 'Event published')} style={{ color: T.emerald }}>{event.status === 'published' ? 'Unpublish' : 'Publish'}</button>}<button onClick={() => duplicate(event)} style={{ color: T.textSub }}>Duplicate</button><button onClick={() => remove(event)} style={{ color: T.red }}>Delete</button></div></td></tr>)}</tbody></table></div></section>
}

function DataReadyPage({ title, description, actionLabel }: { title: string; description: string; actionLabel?: string }) {
  return <div className="max-w-4xl space-y-5" style={{ animation: 'fade-in-up .25s ease' }}>
    <div className="rounded-2xl p-6 sm:p-8" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(0,255,136,.1)', color: T.emerald }}><Icons.grid/></div>
      <h2 className="font-serif text-2xl font-bold" style={{ color: T.text }}>{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed" style={{ color: T.textMuted }}>{description}</p>
      {actionLabel && <button className="mt-5 px-4 py-2.5 rounded-xl text-xs font-semibold" style={{ background: 'rgba(0,255,136,.1)', color: T.emerald, border: '1px solid rgba(0,255,136,.2)' }}>{actionLabel}</button>}
    </div>
    <div className="rounded-2xl border border-dashed p-12 text-center" style={{ borderColor: T.cardBorder }}>
      <div className="text-sm font-medium" style={{ color: T.textSub }}>No records yet</div>
      <div className="mt-1 text-xs" style={{ color: T.textMuted }}>This area is ready for live data from your connected services.</div>
    </div>
  </div>
}

function TemplateLaunchPage() {
  return <div className="max-w-4xl rounded-2xl p-7" style={{ background: T.cardSolid, border: `1px solid ${T.cardBorder}` }}>
    <div className="text-xs font-mono uppercase tracking-wider" style={{ color: T.emerald }}>Read-only master template</div>
    <h2 className="mt-2 font-serif text-2xl font-bold" style={{ color: T.text }}>Build your booking page directly on the canvas</h2>
    <p className="mt-2 max-w-2xl text-sm" style={{ color: T.textMuted }}>The original booking layout is duplicated into an admin-only editor. Double-click text to edit it in place, or double-click an image to replace it.</p>
    <a href="/admin/template" className="inline-flex mt-5 px-4 py-2.5 rounded-xl text-sm font-bold" style={{ background: T.emerald, color: T.bg }}>View master template</a>
  </div>
}

export default function AdminDashboard({ onExitAdmin, initialPage = 'dashboard', onNavigate }: { onExitAdmin: () => void; initialPage?: Page; onNavigate?: (page: Page) => void }) {
  const [page, setPage] = useState<Page>(initialPage)
  const [collapsed, setCollapsed] = useAdminRecoveryState('dashboard.sidebarCollapsed', false, value => typeof value === 'boolean')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLg, setIsLg] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true)
  const { msg, show } = useToast()
  const [eventCreateRequest, setEventCreateRequest] = useState(0)
  const [settingsSetupIssueCount, setSettingsSetupIssueCount] = useState(() => Object.values(getSettingsReadiness()).filter(section => !section.complete).length)

  useEffect(() => {
    const fn = () => setIsLg(window.innerWidth >= 1024)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => setPage(initialPage), [initialPage])
  useEffect(() => { void adminEventStore.hydrate().catch(() => undefined) }, [])
  useEffect(() => {
    const refresh = () => setSettingsSetupIssueCount(Object.values(getSettingsReadiness()).filter(section => !section.complete).length)
    const unsubscribers = [adminSettingsStore.subscribe(refresh), platformPaymentStore.subscribe(refresh), emailService.subscribe(refresh), mediaLibraryStore.subscribe(refresh), socialProofStore.subscribe(refresh)]
    return () => unsubscribers.forEach(unsubscribe => unsubscribe())
  }, [])
  const navigatePage = (next: Page) => { setPage(next); onNavigate?.(next) }
  const contentLeft = collapsed ? 64 : 240

  const PAGES: Record<Page, React.ReactNode> = {
    dashboard: <DashboardPage show={show} onNavigate={navigatePage} />,
    bookings: <BookingsPage show={show} />,
    events: <SupabaseEventCatalogPage show={show} createSignal={eventCreateRequest}/>,
    payments: <PaymentDashboard show={show} />,
    media: <MediaLibraryPage show={show} />,
    chat: <SupportDashboard />,
    notifications: <NotificationCenter />,
    settings: <SettingsPage show={show}/>,
    documentation: <DocumentationPage />,
  }

  return (
    <div className="ios-stable-scroll" style={{ background: T.bg, minHeight: '100dvh', color: T.text, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, background: 'radial-gradient(ellipse 80% 50% at 50% -20%,rgba(0,255,136,0.03) 0%,transparent 60%)' }}/>

      <Sidebar page={page} setPage={navigatePage} collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} setupIssueCount={settingsSetupIssueCount}/>
      <TopNav page={page} onExitAdmin={onExitAdmin} collapsed={collapsed} show={show} onHamburger={() => setMobileOpen(true)} onCreateEvent={() => { navigatePage('events'); setEventCreateRequest(value => value + 1) }} onOpenNotifications={() => navigatePage('notifications')}/>

      <main className="transition-all duration-300" style={{ paddingTop: 56 }}>
        <div className="p-4 lg:p-6 transition-all duration-300" style={{ marginLeft: isLg ? contentLeft : 0 }}>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-mono mb-5" style={{ color: T.textMuted }}>
            <span>Apex Admin</span>
            <Icons.chevronRight/>
            <span className="capitalize" style={{ color: T.textSub }}>{page}</span>
          </div>
          {/* Page content */}
          <div key={page}>
            {PAGES[page]}
          </div>
          <AdminOnboardingFooter page={page}/>
        </div>
      </main>

      <Toast msg={msg}/>
    </div>
  )
}
