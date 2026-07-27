import type { EventPackage, EventRecord, EventStatus } from '../../types/domain'
import { requireSupabase } from '../../services/supabase/client'

export type CreateEventInput = Pick<EventRecord, 'slug' | 'name' | 'venue' | 'address' | 'mapAddress' | 'startsAt' | 'bannerUrl'> & { organizationId: string; facts?: string; importantInformation?: string }
export type UpdateEventInput = Partial<Omit<CreateEventInput, 'organizationId'>>

const mapEvent = (row: Record<string, unknown>): EventRecord => ({
  id: String(row.id), slug: String(row.slug), name: String(row.name), venue: String(row.venue ?? ''), address: String(row.address ?? ''), mapAddress: row.google_map_address ? String(row.google_map_address) : undefined,
  status: row.status as EventStatus, startsAt: String(row.starts_at), totalSeats: Number(row.total_seats ?? 0), bannerUrl: row.banner_path ? String(row.banner_path) : undefined,
})

export const eventService = {
  async list(organizationId: string): Promise<EventRecord[]> { const { data, error } = await requireSupabase().from('events').select('*, seats(count)').eq('organization_id', organizationId).order('starts_at'); if (error) throw error; return (data ?? []).map(row => mapEvent(row as Record<string, unknown>)) },
  async get(id: string): Promise<EventRecord> { const { data, error } = await requireSupabase().from('events').select('*, seats(count)').eq('id', id).single(); if (error) throw error; return mapEvent(data as Record<string, unknown>) },
  async create(input: CreateEventInput): Promise<EventRecord> { const { data, error } = await requireSupabase().from('events').insert({ organization_id: input.organizationId, slug: input.slug, name: input.name, venue: input.venue, address: input.address, google_map_address: input.mapAddress, starts_at: input.startsAt, banner_path: input.bannerUrl, event_facts: input.facts, important_information: input.importantInformation }).select().single(); if (error) throw error; return mapEvent(data as Record<string, unknown>) },
  async update(id: string, input: UpdateEventInput): Promise<EventRecord> { const { data, error } = await requireSupabase().from('events').update({ slug: input.slug, name: input.name, venue: input.venue, address: input.address, google_map_address: input.mapAddress, starts_at: input.startsAt, banner_path: input.bannerUrl }).eq('id', id).select().single(); if (error) throw error; return mapEvent(data as Record<string, unknown>) },
  async setStatus(id: string, status: EventStatus): Promise<void> { const { error } = await requireSupabase().from('events').update({ status }).eq('id', id); if (error) throw error },
  async remove(id: string): Promise<void> { const { error } = await requireSupabase().from('events').delete().eq('id', id); if (error) throw error },
  async listPackages(eventId: string): Promise<EventPackage[]> { const { data, error } = await requireSupabase().from('packages').select('*').eq('event_id', eventId).order('price'); if (error) throw error; return (data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), eventId: String(row.event_id), name: String(row.name), price: Number(row.price), offer: row.offer ? String(row.offer) : undefined, capacity: Number(row.capacity) })) },
}