import type { BookingPackage } from './bookingTemplate'

export type PackageTypeDefinition = {
  key: string
  category: 'Essential' | 'Value' | 'Premium' | 'Hospitality' | 'Exclusive'
  name: string
  description: string
  badge: string | null
  accent: string
  glow: string
  seats: number
  icon: string
  sections: string[]
  benefits: string[]
  price: number
}

export const PACKAGE_TYPE_LIBRARY: PackageTypeDefinition[] = [
  { key: 'regular', category: 'Essential', name: 'Regular', description: 'Reliable standard entry for every fan', badge: 'Great Value', accent: '#64748B', glow: 'rgba(100,116,139,0.2)', seats: 500, icon: '🎫', sections: ['Regular'], benefits: ['Standard event entry', 'Reserved or general seating', 'Mobile ticket delivery'], price: 75 },
  { key: 'early-bird', category: 'Value', name: 'Early Bird', description: 'Limited advance-release tickets', badge: 'Limited', accent: '#06B6D4', glow: 'rgba(6,182,212,0.22)', seats: 150, icon: '⚡', sections: ['Early Bird'], benefits: ['Discounted advance price', 'Standard event entry', 'Mobile ticket delivery'], price: 55 },
  { key: 'student', category: 'Value', name: 'Student Pass', description: 'Reduced entry with valid student identification', badge: 'Student Offer', accent: '#3B82F6', glow: 'rgba(59,130,246,0.22)', seats: 100, icon: '🎓', sections: ['Student'], benefits: ['Discounted student entry', 'Standard seating', 'Valid student ID required'], price: 45 },
  { key: 'group', category: 'Value', name: 'Group Pass', description: 'A better-value package for friends and groups', badge: 'Save Together', accent: '#14B8A6', glow: 'rgba(20,184,166,0.22)', seats: 120, icon: '👥', sections: ['Group Seating'], benefits: ['Entry for a configured group size', 'Seats placed together', 'One booking reference'], price: 240 },
  { key: 'family', category: 'Value', name: 'Family Pass', description: 'Comfortable admission designed for families', badge: 'Family Pick', accent: '#22C55E', glow: 'rgba(34,197,94,0.22)', seats: 100, icon: '🏡', sections: ['Family Zone'], benefits: ['Family-zone access', 'Grouped seating', 'Priority family entrance'], price: 190 },
  { key: 'reserved', category: 'Essential', name: 'Reserved Seating', description: 'Choose a specific numbered seat', badge: 'Choose Your Seat', accent: '#8B5CF6', glow: 'rgba(139,92,246,0.22)', seats: 300, icon: '💺', sections: ['Reserved Seating'], benefits: ['Numbered reserved seat', 'Standard event entry', 'Mobile ticket delivery'], price: 110 },
  { key: 'premium', category: 'Premium', name: 'Premium', description: 'Upgraded views and faster entry', badge: 'Popular', accent: '#0EA5E9', glow: 'rgba(14,165,233,0.24)', seats: 120, icon: '✨', sections: ['Premium'], benefits: ['Premium viewing area', 'Priority entrance', 'Dedicated support'], price: 185 },
  { key: 'vip', category: 'Premium', name: 'VIP', description: 'Premium access with elevated guest benefits', badge: 'Best Seller', accent: '#00D982', glow: 'rgba(0,217,130,0.24)', seats: 80, icon: '💎', sections: ['VIP'], benefits: ['VIP viewing area', 'Fast-lane entry', 'VIP lounge access', 'Exclusive event merchandise'], price: 350 },
  { key: 'vvip', category: 'Exclusive', name: 'VVIP', description: 'The most complete premium event experience', badge: 'Ultimate Access', accent: '#F59E0B', glow: 'rgba(245,158,11,0.25)', seats: 24, icon: '👑', sections: ['VVIP'], benefits: ['Best available viewing area', 'Private entrance', 'Premium lounge and refreshments', 'Exclusive collectible gift'], price: 650 },
  { key: 'front-row', category: 'Exclusive', name: 'Front Row', description: 'Closest available view of the performance', badge: 'Closest View', accent: '#F43F5E', glow: 'rgba(244,63,94,0.24)', seats: 30, icon: '🎤', sections: ['Front Row'], benefits: ['Front-row reserved seat', 'Priority entrance', 'Commemorative event credential'], price: 425 },
  { key: 'meet-greet', category: 'Exclusive', name: 'Meet & Greet', description: 'Premium admission with an artist or speaker experience', badge: 'Exclusive', accent: '#D946EF', glow: 'rgba(217,70,239,0.24)', seats: 20, icon: '🤝', sections: ['Meet & Greet'], benefits: ['Premium event admission', 'Scheduled meet and greet', 'Professional photo opportunity', 'Signed keepsake where available'], price: 725 },
  { key: 'backstage', category: 'Exclusive', name: 'Backstage Experience', description: 'Controlled behind-the-scenes event access', badge: 'Rare Access', accent: '#A855F7', glow: 'rgba(168,85,247,0.25)', seats: 12, icon: '🎬', sections: ['Backstage'], benefits: ['Premium event admission', 'Guided backstage experience', 'Dedicated event host', 'Exclusive backstage credential'], price: 900 },
  { key: 'lounge', category: 'Hospitality', name: 'Lounge Access', description: 'Comfortable hospitality before and during the show', badge: 'Hospitality', accent: '#EAB308', glow: 'rgba(234,179,8,0.24)', seats: 60, icon: '🥂', sections: ['Private Lounge'], benefits: ['Private lounge access', 'Premium refreshments', 'Dedicated entrance', 'Comfort seating'], price: 475 },
  { key: 'table', category: 'Hospitality', name: 'Table Package', description: 'Reserved table service for groups', badge: 'Group Premium', accent: '#F97316', glow: 'rgba(249,115,22,0.24)', seats: 40, icon: '🍾', sections: ['Table Service'], benefits: ['Reserved table', 'Entry for configured guests', 'Dedicated table service', 'Premium viewing area'], price: 1200 },
  { key: 'suite', category: 'Hospitality', name: 'Private Suite', description: 'Private hospitality and premium group viewing', badge: 'Private', accent: '#C084FC', glow: 'rgba(192,132,252,0.25)', seats: 16, icon: '🏛️', sections: ['Private Suite'], benefits: ['Private suite access', 'Premium group seating', 'Dedicated suite host', 'Food and beverage service'], price: 2500 },
  { key: 'corporate', category: 'Hospitality', name: 'Corporate Package', description: 'Professional group access for teams and clients', badge: 'Business', accent: '#2563EB', glow: 'rgba(37,99,235,0.24)', seats: 40, icon: '💼', sections: ['Corporate Hospitality'], benefits: ['Grouped premium seating', 'Priority check-in', 'Company booking reference', 'Hospitality support'], price: 1800 },
]

export function createPackageFromType(type: PackageTypeDefinition): BookingPackage {
  return {
    id: crypto.randomUUID(),
    name: type.name,
    price: type.price,
    desc: type.description,
    badge: type.badge,
    accent: type.accent,
    glow: type.glow,
    seats: type.seats,
    icon: type.icon,
    sections: [...type.sections],
    benefits: [...type.benefits],
  }
}
