export type EventStatus = 'draft' | 'scheduled' | 'published' | 'archived' | 'live' | 'sold_out' | 'completed' | 'cancelled'
export type SeatStatus = 'available' | 'reserved' | 'sold' | 'disabled'
export type PaymentMethod = 'apple_gift_card' | 'paypal' | 'cryptocurrency' | 'cash_app' | 'bank_transfer'
// Note: 'bitcoin' was removed in Phase 13. All crypto payments use the 'cryptocurrency' method.
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'needs_more_information' | 'expired'

export interface EventPackage { id: string; eventId: string; name: string; price: number; offer?: string; capacity: number }
export interface Seat { id: string; eventId: string; packageId: string | null; label: string; status: SeatStatus }
export interface EventRecord { id: string; slug: string; name: string; venue: string; address: string; mapAddress?: string; status: EventStatus; startsAt: string; totalSeats: number; bannerUrl?: string }
export interface PaymentProof { id: string; paymentId: string; path: string; createdAt: string; status: PaymentStatus }

export interface CryptoCoinConfig { enabled: boolean; address: string; network: string; label?: string; instructions?: string; }
