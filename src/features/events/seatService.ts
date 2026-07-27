import type { Seat, SeatStatus } from '../../types/domain'
import { requireSupabase } from '../../services/supabase/client'

export const seatService = {
  async generate(eventId: string, totalSeats: number): Promise<void> { const seats = Array.from({ length: totalSeats }, (_, index) => ({ event_id: eventId, label: String(index + 1).padStart(3, '0'), status: 'available' })); const { error } = await requireSupabase().from('seats').insert(seats); if (error) throw error },
  async list(eventId: string): Promise<Seat[]> { const { data, error } = await requireSupabase().from('seats').select('*').eq('event_id', eventId).order('label'); if (error) throw error; return (data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), eventId: String(row.event_id), packageId: row.package_id ? String(row.package_id) : null, label: String(row.label), status: row.status as SeatStatus })) },
  async bulkUpdate(ids: string[], status: SeatStatus, packageId?: string): Promise<void> { const update = packageId ? { status, package_id: packageId } : { status }; const { error } = await requireSupabase().from('seats').update(update).in('id', ids); if (error) throw error },
  async reserve(id: string): Promise<boolean> { const { data, error } = await requireSupabase().from('seats').update({ status: 'reserved' }).eq('id', id).eq('status', 'available').select('id'); if (error) throw error; return (data?.length ?? 0) === 1 },
}