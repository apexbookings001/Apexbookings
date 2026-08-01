import type { SeatStatus } from '../../types/domain'
import { requireSupabase } from '../../services/supabase/client'
import { generateSeatLabel, packageSeatCode, seatLabelForPackage } from './seatLabels'

export type SeatRecord = {
  id: string
  eventId: string
  packageId: string | null
  label: string
  status: SeatStatus
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const VALID_STATUSES: SeatStatus[] = ['available', 'reserved', 'sold', 'disabled']

export function isDatabaseSeatRecord(seat: SeatRecord, eventId: string, packageId: string): boolean {
  return UUID_PATTERN.test(seat.id)
    && seat.eventId === eventId
    && seat.packageId === packageId
    && VALID_STATUSES.includes(seat.status)
}

/** Build a seat label prefix from a package name.
 * Regular → R, VIP → V, VVIP → VV, Custom → C */
export function seatPrefix(packageName: string): string {
  return packageSeatCode(packageName)
}

/** Build a seat label: e.g. "VIP-V01" */
export function buildLabel(packageName: string, index: number): string {
  return seatLabelForPackage(packageName, index)
}

const mapRow = (row: Record<string, unknown>): SeatRecord => ({
  id: String(row.id),
  eventId: String(row.event_id),
  packageId: row.package_id ? String(row.package_id) : null,
  label: String(row.label),
  status: row.status as SeatStatus,
})

type SeatAvailabilityRpcResult = { updated?: number; requested?: number }

function isMissingSeatAvailabilityRpc(error: { code?: string; message?: string; details?: string | null }): boolean {
  const detail = `${error.message ?? ''} ${error.details ?? ''}`
  return error.code === 'PGRST202'
    || /(?:could not find|function).*admin_apply_seat_availability/i.test(detail)
}

function assertEverySeatWasUpdated(result: unknown, expectedCount: number): void {
  const value = (result ?? {}) as SeatAvailabilityRpcResult
  if (value.updated !== expectedCount || value.requested !== expectedCount) {
    throw new Error('Seat availability was not committed for every selected seat.')
  }
}

export const seatService = {
  /** Generate seats for a package from scratch */
  async generate(eventId: string, totalSeats: number): Promise<void> {
    const seats = Array.from({ length: totalSeats }, (_, index) => ({
      event_id: eventId,
      label: generateSeatLabel('R', index + 1),
      status: 'available',
    }))
    const { error } = await requireSupabase().from('seats').insert(seats)
    if (error) throw error
  },

  /** Generate labeled seats for a specific package */
  async generateForPackage(
    eventId: string,
    packageId: string,
    packageName: string,
    count: number,
  ): Promise<SeatRecord[]> {
    if (count <= 0) return []
    const seats = Array.from({ length: count }, (_, i) => ({
      event_id: eventId,
      package_id: packageId,
      label: seatLabelForPackage(packageName, i + 1),
      status: 'available' as const,
    }))
    const { data, error } = await requireSupabase()
      .from('seats')
      .insert(seats)
      .select('*')
    if (error) throw error
    return (data ?? []).map(row => mapRow(row as Record<string, unknown>))
  },

  /** List all non-deleted seats for an event */
  async list(eventId: string): Promise<SeatRecord[]> {
    const { data, error } = await requireSupabase()
      .from('seats')
      .select('*')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('label')
    if (error) throw error
    return (data ?? []).map(row => mapRow(row as Record<string, unknown>))
  },

  /** List non-deleted seats for a specific package (admin) */
  async listByPackage(eventId: string, packageId: string): Promise<SeatRecord[]> {
    const { data, error } = await requireSupabase()
      .from('seats')
      .select('*')
      .eq('event_id', eventId)
      .eq('package_id', packageId)
      .is('deleted_at', null)
      .order('label')
    if (error) throw error
    return (data ?? []).map(row => mapRow(row as Record<string, unknown>))
  },

  /** List seats for public seat selector via secure RPC */
  async listPublic(eventId: string, packageId: string): Promise<SeatRecord[]> {
    const { data, error } = await requireSupabase().rpc('public_event_seats', {
      p_event_id: eventId,
      p_package_id: packageId,
    })
    if (error) throw error
    const rows = Array.isArray(data) ? data : []
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      eventId: String(row.eventId ?? row.event_id ?? eventId),
      packageId: String(row.packageId ?? row.package_id),
      label: String(row.label),
      status: (row.status ?? 'available') as SeatStatus,
    }))
  },

  /** List seats for admin seat manager via secure RPC */
  async listAdmin(eventId: string, packageId: string): Promise<SeatRecord[]> {
    const { data, error } = await requireSupabase().rpc('admin_event_seats', {
      p_event_id: eventId,
      p_package_id: packageId,
    })
    if (error) throw error
    const rows = Array.isArray(data) ? data : []
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      eventId: String(row.eventId ?? row.event_id ?? eventId),
      packageId: String(row.packageId ?? row.package_id),
      label: String(row.label),
      status: (row.status ?? 'available') as SeatStatus,
    }))
  },

  /**
   * Apply one explicit, all-or-nothing availability decision to generated
   * seats. The RPC rejects protected (reserved/sold), stale, and cross-package
   * selections before it writes anything.
   */
  async setAvailability(
    changes: Array<{ id: string; status: 'available' | 'disabled' }>,
    eventId: string,
    packageId: string,
  ): Promise<void> {
    if (!changes.length) throw new Error('Select at least one seat before saving availability.')
    const supabase = requireSupabase()
    const { data, error } = await supabase.rpc('admin_apply_seat_availability', {
      p_event_id: eventId,
      p_package_id: packageId,
      p_changes: changes,
    })
    if (!error) {
      assertEverySeatWasUpdated(data, changes.length)
      return
    }

    if (!isMissingSeatAvailabilityRpc(error)) throw new Error(error.message)

    // Compatibility for existing deployments that have not yet applied the
    // atomic availability migration. The older RPC is still org-scoped and
    // status-guarded: it can only move available <-> disabled seats.
    const groupedChanges = new Map<'available' | 'disabled', string[]>()
    for (const change of changes) {
      const ids = groupedChanges.get(change.status) ?? []
      ids.push(change.id)
      groupedChanges.set(change.status, ids)
    }

    for (const [status, seatIds] of groupedChanges) {
      const { data: fallbackData, error: fallbackError } = await supabase.rpc('admin_bulk_set_seat_status', {
        p_event_id: eventId,
        p_package_id: packageId,
        p_seat_ids: seatIds,
        p_new_status: status,
        p_source_status: status === 'disabled' ? 'available' : 'disabled',
      })
      if (fallbackError) {
        throw new Error(
          'Seat availability could not be saved because its database operation is not deployed. Apply the Packages & Seats Supabase migrations.',
        )
      }
      assertEverySeatWasUpdated(fallbackData, seatIds.length)
    }
  },

  /**
   * Bulk set seats to 'disabled' (admin Mark Unavailable).
   * Only touches seats that are currently 'available' — never reserved or sold.
   * Requires eventId + packageId so RLS can be verified through the chain:
   *   seats.event_id → events.organization_id → organization_members → auth.uid()
   * Returns the updated SeatRecord rows so the caller can apply them locally
   * without an extra round-trip. Throws if Supabase returns an error OR if
   * zero rows were updated (silent RLS denial or stale IDs).
   */
  async bulkDisable(
    ids: string[],
    eventId: string,
    packageId: string,
  ): Promise<SeatRecord[]> {
    if (!ids.length) return []
    const { data, error } = await requireSupabase()
      .from('seats')
      .update({ status: 'disabled' as const, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('event_id', eventId)
      .eq('package_id', packageId)
      .eq('status', 'available')   // only disable currently-available seats
      .is('deleted_at', null)
      .select('id, event_id, package_id, label, status')
    if (error) {
      console.error('[seatService.bulkDisable] Supabase error', { code: error.code, message: error.message })
      throw new Error(error.message)
    }
    const rows = data ?? []
    if (rows.length === 0) {
      throw new Error(
        `No seats were updated. The selected seats may already be disabled, reserved, or sold — or access was denied. (Tried to disable ${ids.length} seat(s))`
      )
    }
    return rows.map(row => mapRow(row as Record<string, unknown>))
  },

  /**
   * Bulk restore seats to 'available' (admin Mark Available).
   * Only touches seats that are currently 'disabled' — never reserved or sold.
   * Returns the updated SeatRecord rows for immediate local state update.
   * Throws if Supabase returns an error OR if zero rows were updated.
   */
  async bulkEnable(
    ids: string[],
    eventId: string,
    packageId: string,
  ): Promise<SeatRecord[]> {
    if (!ids.length) return []
    const { data, error } = await requireSupabase()
      .from('seats')
      .update({ status: 'available' as const, updated_at: new Date().toISOString() })
      .in('id', ids)
      .eq('event_id', eventId)
      .eq('package_id', packageId)
      .eq('status', 'disabled')   // only restore currently-disabled seats
      .is('deleted_at', null)
      .select('id, event_id, package_id, label, status')
    if (error) {
      console.error('[seatService.bulkEnable] Supabase error', { code: error.code, message: error.message })
      throw new Error(error.message)
    }
    const rows = data ?? []
    if (rows.length === 0) {
      throw new Error(
        `No seats were updated. The selected seats may already be available, reserved, or sold — or access was denied. (Tried to enable ${ids.length} seat(s))`
      )
    }
    return rows.map(row => mapRow(row as Record<string, unknown>))
  },

  /** Bulk update seat status (legacy — kept for compatibility, prefer bulkDisable / bulkEnable) */
  async bulkUpdate(ids: string[], status: SeatStatus, packageId?: string): Promise<void> {
    const update = packageId ? { status, package_id: packageId } : { status }
    const { error } = await requireSupabase().from('seats').update(update).in('id', ids)
    if (error) throw error
  },

  /** Atomically reserve a seat (prevents double-booking via RPC) */
  async reserve(seatId: string, eventId: string, packageId: string): Promise<boolean> {
    const { data, error } = await requireSupabase().rpc('reserve_seat_safe', {
      target_seat_id: seatId,
      target_event_id: eventId,
      target_package_id: packageId,
    })
    if (error) throw error
    return Boolean(data)
  },

  /** Release a reserved seat back to available */
  async release(seatId: string): Promise<void> {
    const { error } = await requireSupabase().rpc('release_seat', {
      target_seat_id: seatId,
    })
    if (error) throw error
  },

  /** Release expired reservations (call on seat load) */
  async releaseExpired(): Promise<number> {
    const { data, error } = await requireSupabase().rpc('release_expired_reservations')
    if (error) throw error
    return Number(data ?? 0)
  },

  /** Adjust seat allocation for a package via protected RPC */
  async adjustAllocation(packageId: string, newCount: number, prefix?: string): Promise<void> {
    const { error } = await requireSupabase().rpc('admin_adjust_seat_allocation', {
      p_package_id: packageId,
      p_new_count: newCount,
      p_prefix: prefix ?? null,
    })
    if (error) throw error
  },

  /**
   * Idempotently create missing seat rows for a package.
   * Safe to call repeatedly — only inserts the difference between
   * existing seat rows and the target count.
   * Returns the number of seats created.
   */
  async ensureSeats(
    eventId: string,
    packageId: string,
    targetCount: number,
    prefix?: string,
  ): Promise<{ created: number; existing: number; total: number }> {
    const { data, error } = await requireSupabase().rpc('admin_ensure_seats', {
      p_event_id: eventId,
      p_package_id: packageId,
      p_target_count: targetCount,
      p_prefix: prefix ?? null,
    })
    if (error) throw error
    const d = data as Record<string, number>
    return { created: d?.created ?? 0, existing: d?.existing ?? 0, total: d?.total ?? 0 }
  },
}
