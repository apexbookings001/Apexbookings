export type BookingSectionId = 'hero' | 'about' | 'venue' | 'timeline' | 'tickets' | 'testimonials' | 'faq' | 'cta' | 'footer'

export type BookingPackage = {
  id: string
  name: string
  price: number
  desc: string
  badge: string | null
  accent: string
  glow: string
  seats: number
  icon: string
  sections: string[]
  benefits: string[]
}

export type BookingPageData = {
  hero: { eyebrow: string; title: string; tour: string; date: string; doors: string; show: string; venue: string; address: string; guests: string[]; images: string[]; primaryCta: string; primaryLink: string; secondaryCta: string; secondaryLink: string }
  about: { image: string; heading: string; accentHeading: string; body: string; detail: string; dateLabel: string; dateDetail: string; highlights: { icon: string; value: string; label: string }[]; inclusions: string[] }
  venue: { name: string; address: string; image: string; mapLink: string }
  timeline: { id: string; time: string; title: string; desc: string; icon: string; accent: string }[]
  packages: BookingPackage[]
  testimonials: { id: string; name: string; role: string; avatar: string; text: string; accent: string; rating: number }[]
  faq: { id: string; q: string; a: string }[]
  cta: { image: string; eyebrow: string; heading: string; accentHeading: string; detail: string; primaryLabel: string; primaryLink: string; secondaryLabel: string; secondaryLink: string }
  footer: { brand: string; description: string; copyright: string }
  visibility: Record<BookingSectionId, boolean>
  venueFacts: { id: string; label: string; value: string; visible: boolean }[]
  importantInfo: { id: string; title: string; icon: string; body: string; visible: boolean }[]
  sectionHeadings: Record<string, string>
}

export type BookingSetupValues = {
  name?: string
  host?: string
  venue?: string
  date?: string
  start?: string
  end?: string
  map?: string
  capacity?: number
  showType?: string
  guestPerformers?: string[]
  banners?: string[]
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const id = () => crypto.randomUUID()

export const DEFAULT_BOOKING_TEMPLATE: BookingPageData = {
  hero: {
    eyebrow: 'Live in New York · September 20', title: 'DRAKE', tour: "It's All A Blur Tour", date: 'Saturday, September 20, 2025', doors: '6:00 PM', show: '8:00 PM EDT', venue: 'Madison Square Garden', address: '4 Pennsylvania Plaza, New York, NY 10001', guests: ['21 Savage'], primaryCta: 'Book tickets', primaryLink: '#tickets', secondaryCta: 'Event details', secondaryLink: '#about',
    images: [
      'https://images.unsplash.com/photo-1546707012-c46675f12716?w=1600&h=900&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1577648884063-1d3d1477b8a7?w=1600&h=900&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1600&h=900&fit=crop&auto=format',
      'https://images.unsplash.com/photo-1501962679900-bea61483313b?w=1600&h=900&fit=crop&auto=format',
    ],
  },
  about: {
    image: 'https://images.unsplash.com/photo-1501962679900-bea61483313b?w=900&h=600&fit=crop&auto=format', heading: 'The Biggest Night', accentHeading: 'in New York', dateLabel: 'Sep 20', dateDetail: 'Saturday, 2025 · 8:00 PM',
    body: "Aubrey Drake Graham — globally known simply as Drake — brings his record-shattering It's All A Blur Tour to the most legendary arena in the world: Madison Square Garden. One night only. An experience you will never forget.",
    detail: 'From his Toronto roots to becoming one of the best-selling music artists of all time with over 170 million records sold worldwide, Drake delivers a performance that blends bars, energy, and pure spectacle. Joined by special guest 21 Savage, this is the hip-hop event of the decade.',
    highlights: [{ icon: '🏆', value: '6', label: 'Grammy Awards' }, { icon: '🎵', value: '50+', label: 'Billboard #1 Hits' }, { icon: '🌍', value: '2.8B+', label: 'Global Streams' }, { icon: '🎤', value: '12', label: 'World Tours' }],
    inclusions: ['HD LED stage production', 'Surround sound system', 'Live merchandise booth', 'Multi-camera livestream', 'VIP lounge access (VIP+)', 'Meet & greet (VVIP only)'],
  },
  venue: { name: 'Madison Square Garden', address: '4 Pennsylvania Plaza, New York, NY 10001 — Midtown Manhattan', image: 'https://images.unsplash.com/photo-1512352036558-e6fb1f0c8340?w=1200&h=800&fit=crop&auto=format', mapLink: 'https://maps.google.com/?q=Madison+Square+Garden,+4+Pennsylvania+Plaza,+New+York,+NY+10001' },
  timeline: [
    { id: id(), time: '6:00 PM', title: 'Doors Open', desc: 'Gates open. Security check and wristband collection begins.', icon: '🚪', accent: '#52525B' },
    { id: id(), time: '6:30 PM', title: 'VIP Check-In', desc: 'Dedicated VIP lane opens. Collect lounge passes and meet-and-greet confirmation.', icon: '✅', accent: '#22D3EE' },
    { id: id(), time: '7:00 PM', title: 'Pre-Show DJ Set', desc: 'Resident DJ warms up the crowd with an exclusive 60-minute mix.', icon: '🎧', accent: '#8B5CF6' },
    { id: id(), time: '8:00 PM', title: 'Drake Takes the Stage', desc: 'The moment the city has been waiting for. 150 minutes of pure Drake — hits spanning his entire career.', icon: '⭐', accent: '#00FF88' },
    { id: id(), time: '9:45 PM', title: '21 Savage — Special Set', desc: 'Surprise joint set. Two icons, one stage, one night.', icon: '🔥', accent: '#F59E0B' },
    { id: id(), time: '10:30 PM', title: 'Grand Finale & Encore', desc: 'Closing ceremony with pyrotechnics and a setlist deep cut you will never forget.', icon: '🎆', accent: '#F59E0B' },
  ],
  packages: [
    { id: 'general-admission', name: 'General Admission', price: 189, desc: 'Upper level seating', badge: null, accent: '#71717A', glow: 'rgba(113,113,122,0.18)', seats: 312, icon: '🎟', sections: ['301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312'], benefits: ['Standard entry', 'Upper level seating', 'Mobile ticket delivery', 'Event program'] },
    { id: 'vip-floor', name: 'VIP Floor', price: 450, desc: 'Premium lower bowl', badge: 'Best Seller', accent: '#00FF88', glow: 'rgba(0,255,136,0.22)', seats: 86, icon: '⭐', sections: ['101', '102', '103', '104', '105', '106', '107', '108', '109', '110'], benefits: ['Priority fast-lane entry', 'Premium floor seating', 'Complimentary drinks (2)', 'Exclusive VIP lounge', 'Meet & greet opportunity'] },
    { id: 'vvip-platinum', name: 'VVIP Platinum', price: 850, desc: 'Floor level & private lounge', badge: 'Recommended', accent: '#F59E0B', glow: 'rgba(245,158,11,0.22)', seats: 12, icon: '👑', sections: ['GA Floor', 'Platinum Suite A', 'Platinum Suite B'], benefits: ['Private escort entrance', 'Front-row floor seating', 'Unlimited premium bar', 'Backstage access pass', 'Personal meet & greet', 'Signed collectible gift', 'Professional photo session'] },
  ],
  testimonials: [
    { id: id(), name: 'Sophia Chen', role: 'Concert Enthusiast', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&auto=format', text: "VIP experience was absolutely flawless. Private lounge, priority entry, complimentary drinks. Apex is the only platform I'll ever use.", accent: '#00FF88', rating: 5 },
    { id: id(), name: 'Marcus Reid', role: 'Hip-Hop Fan', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&auto=format', text: 'Booked Drake VVIP and got a personal meet & greet plus signed merch. The booking experience was seamless. Worth every penny.', accent: '#8B5CF6', rating: 5 },
    { id: id(), name: 'Amelia Torres', role: 'Event Lover', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=80&h=80&fit=crop&auto=format', text: "MSG floor seats through Apex — the seat map was the most intuitive I've ever used. Got exactly where I wanted within 2 minutes.", accent: '#F59E0B', rating: 5 },
    { id: id(), name: 'James Park', role: 'Music Producer', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=80&h=80&fit=crop&auto=format', text: 'Corporate block booking for 40 seats, handled perfectly. The platform is enterprise-grade. Invoicing and management tools are excellent.', accent: '#22D3EE', rating: 5 },
    { id: id(), name: 'Naomi Wells', role: 'Superfan', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=80&h=80&fit=crop&auto=format', text: 'Saw Drake from the Platinum Suite. The view, the production, the exclusivity — nothing else compares. Already booked the next show.', accent: '#F472B6', rating: 5 },
  ],
  faq: [
    { id: id(), q: 'How do I receive my tickets after booking?', a: 'Tickets are delivered instantly to your email as a QR code. They are also accessible anytime in the Apex app under “My Tickets”.' },
    { id: id(), q: 'Can I transfer or gift my tickets to someone else?', a: 'Yes. Apex supports secure peer-to-peer transfers at face value. Transfers are blockchain-verified to eliminate fraud.' },
    { id: id(), q: 'What is the refund policy for this event?', a: 'All sales for this event are final once confirmed. In the event of a cancellation by the organiser, a full refund including fees will be issued within 5 business days.' },
    { id: id(), q: 'Are VIP and VVIP meet & greet times guaranteed?', a: 'VVIP Platinum includes a confirmed meet & greet slot with Drake. Details and timings will be sent 48 hours before the event.' },
    { id: id(), q: 'What is the bag policy at MSG?', a: 'Madison Square Garden enforces a clear bag policy. Only small clear plastic, vinyl or PVC bags (12×6×12) are permitted.' },
    { id: id(), q: 'Is this event all ages?', a: 'Yes, this event is all ages. However, VIP Lounge access is restricted to guests 21 and older with valid ID.' },
  ],
  cta: { image: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1400&h=600&fit=crop&auto=format', eyebrow: 'Limited Availability', heading: 'Ready to See', accentHeading: 'Drake Live?', detail: 'September 20, 2025 · Madison Square Garden, NYC. Tickets selling fast.', primaryLabel: 'Book Tickets Now', primaryLink: '#tickets', secondaryLabel: 'Contact Support', secondaryLink: '#support' },
  footer: { brand: 'Apex', description: 'Premium event ticketing for unforgettable live experiences worldwide.', copyright: '© 2025 Apex Events Inc. All rights reserved.' },
  visibility: { hero: true, about: true, venue: true, timeline: true, tickets: true, testimonials: true, faq: true, cta: true, footer: true },
  venueFacts: [
    { id: id(), label: 'Capacity', value: '20,789 seats', visible: true },
    { id: id(), label: 'Opened', value: 'February 11, 1968', visible: true },
    { id: id(), label: 'Surface', value: 'Parquet (Oak)', visible: true },
    { id: id(), label: 'Parking', value: 'Nearby garages on 31st St', visible: true },
  ],
  importantInfo: [
    { id: id(), title: 'Important Info', icon: '📌', body: '• Doors open at 6:00 PM\n• No re-entry after 9:00 PM\n• Clear bag policy in effect\n• Professional cameras prohibited\n• Arrive 30 min early for best experience', visible: true }
  ],
  sectionHeadings: { hero: '', about: 'About the Show', venue: 'Venue', venueFacts: 'Venue Facts', timeline: 'The Evening', tickets: 'Select Packages', testimonials: 'Customer Reviews', faq: 'Common Questions', cta: 'Limited Availability', footer: '' },
}

export const createBookingPageData = (setup: BookingSetupValues = {}, source: BookingPageData = DEFAULT_BOOKING_TEMPLATE): BookingPageData => {
  const page = clone(source)
  const guests = (setup.guestPerformers ?? []).map(item => item.trim()).filter(Boolean)
  if (setup.name?.trim()) {
    page.hero.title = setup.name.trim()
    page.about.heading = `Experience ${setup.name.trim()}`
    page.cta.accentHeading = `${setup.name.trim()} Live?`
  }
  if (setup.host?.trim()) page.hero.tour = `Hosted by ${setup.host.trim()}`
  if (setup.date?.trim()) { page.hero.date = setup.date; page.about.dateLabel = setup.date; page.cta.detail = `${setup.date} · ${setup.venue?.trim() || page.hero.venue}. Tickets selling fast.` }
  if (setup.start?.trim()) { page.hero.show = setup.start; page.about.dateDetail = `${setup.date?.trim() || 'Event date'} · ${setup.start}` }
  if (setup.venue?.trim()) { page.hero.venue = setup.venue.trim(); page.venue.name = setup.venue.trim() }
  if (setup.map?.trim()) page.venue.mapLink = setup.map.trim()
  if (setup.banners?.length) page.hero.images = [...setup.banners]
  if (guests.length) {
    page.hero.guests = guests
    page.about.detail = `${page.about.detail.split(' Joined by special guest')[0]} Joined by special guest${guests.length > 1 ? 's' : ''} ${guests.join(', ')}, this is the event of the season.`
  }
  if (setup.capacity && setup.capacity > 0) {
    const base = page.packages.reduce((sum, item) => sum + item.seats, 0)
    page.packages = page.packages.map((item, index) => ({ ...item, seats: index === page.packages.length - 1 ? setup.capacity! - page.packages.slice(0, index).reduce((sum, current) => sum + current.seats, 0) : Math.round(setup.capacity! * item.seats / base) }))
  }
  return page
}

const masterKey = 'apex.master-booking-template'
export const masterBookingTemplateStore = {
  load: (): BookingPageData => { try { const saved = localStorage.getItem(masterKey); if (!saved) return createBookingPageData(); const parsed = JSON.parse(saved) as BookingPageData; return { ...createBookingPageData(), ...parsed, venueFacts: parsed.venueFacts ?? clone(DEFAULT_BOOKING_TEMPLATE.venueFacts), importantInfo: parsed.importantInfo ?? clone(DEFAULT_BOOKING_TEMPLATE.importantInfo), sectionHeadings: parsed.sectionHeadings ?? clone(DEFAULT_BOOKING_TEMPLATE.sectionHeadings) } } catch { return createBookingPageData() } },
  save: (data: BookingPageData) => localStorage.setItem(masterKey, JSON.stringify(data)),
  reset: () => localStorage.removeItem(masterKey),
}
