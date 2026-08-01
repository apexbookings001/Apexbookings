import { requireSupabase } from '../../services/supabase/client'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

export type DbPackage = {
  id: string
  eventId: string
  name: string
  price: number
  capacity: number
  offer: string | null
  displayOrder: number
  seatSelectionEnabled: boolean
  enabled: boolean
  deletedAt: string | null
  updatedAt: string
}

export type PackageSeatStats = {
  total: number
  available: number
  reserved: number
  sold: number
  disabled: number
}

const mapRow = (row: Record<string, unknown>): DbPackage => ({
  id: String(row.id),
  eventId: String(row.event_id),
  name: String(row.name),
  price: Number(row.price),
  capacity: Number(row.capacity ?? 0),
  offer: row.offer ? String(row.offer) : null,
  displayOrder: Number(row.display_order ?? 0),
  seatSelectionEnabled: Boolean(row.seat_selection_enabled ?? true),
  enabled: Boolean(row.enabled ?? true),
  deletedAt: row.deleted_at ? String(row.deleted_at) : null,
  updatedAt: String(row.updated_at ?? ''),
})

export const packageService = {
  /** List active (non-deleted, enabled) packages for an event */
  async listActive(eventId: string): Promise<DbPackage[]> {
    const { data, error } = await requireSupabase()
      .from('packages')
      .select('*')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .eq('enabled', true)
      .order('display_order')
      .order('price')
    if (error) throw error
    return (data ?? []).map(row => mapRow(row as Record<string, unknown>))
  },

  /** List all non-deleted packages for an event (including disabled) */
  async listAll(eventId: string): Promise<DbPackage[]> {
    const { data, error } = await requireSupabase()
      .from('packages')
      .select('*')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .order('display_order')
      .order('price')
    if (error) throw error
    return (data ?? []).map(row => mapRow(row as Record<string, unknown>))
  },

  /** Upsert a package record */
  async upsert(pkg: {
    id: string
    eventId: string
    name: string
    price: number
    originalPrice?: number
    discountedPrice?: number | null
    discountEnabled?: boolean
    discountEndsAt?: string | null
    capacity: number
    displayOrder: number
    seatSelectionEnabled: boolean
    enabled: boolean
    description?: string
    benefits?: string[]
    color?: string
    icon?: string
    category?: string
    badge?: string | null
    accent?: string
    glow?: string
    sections?: string[]
  }): Promise<void> {
    const { error } = await requireSupabase().from('packages').upsert({
      id: pkg.id,
      event_id: pkg.eventId,
      name: pkg.name,
      price: pkg.price,
      original_price: pkg.originalPrice ?? pkg.price,
      discount_price: pkg.discountEnabled ? pkg.discountedPrice ?? null : null,
      discount_enabled: Boolean(pkg.discountEnabled),
      discount_ends_at: pkg.discountEnabled ? pkg.discountEndsAt ?? null : null,
      capacity: pkg.capacity,
      display_order: pkg.displayOrder,
      seat_selection_enabled: pkg.seatSelectionEnabled,
      enabled: pkg.enabled,
      deleted_at: null,
      offer: JSON.stringify({
        description: pkg.description ?? '',
        benefits: pkg.benefits ?? [],
        color: pkg.color ?? '',
        icon: pkg.icon ?? '',
        category: pkg.category ?? '',
        badge: pkg.badge ?? null,
        accent: pkg.accent ?? pkg.color ?? '',
        glow: pkg.glow ?? '',
        sections: pkg.sections ?? [],
      }),
    }, { onConflict: 'id' })
    if (error) throw error
  },

  /** Remove a package via the protected RPC (soft-delete or archive) */
  async remove(packageId: string): Promise<{ action: 'deleted' | 'archived'; reason?: string; soldCount?: number; reservedReleased?: number }> {
    const { data, error } = await requireSupabase().rpc('admin_remove_package', { p_package_id: packageId })
    if (error) throw error
    return data as { action: 'deleted' | 'archived'; reason?: string; soldCount?: number; reservedReleased?: number }
  },

  /** Get seat statistics for a package */
  async getSeatStats(packageId: string): Promise<PackageSeatStats> {
    if (!UUID_PATTERN.test(packageId)) {
      return { total: 0, available: 0, reserved: 0, sold: 0, disabled: 0 }
    }
    const { data, error } = await requireSupabase().rpc('admin_package_seat_stats', { p_package_id: packageId })
    if (error) throw error
    const d = data as Record<string, number>
    return {
      total: d?.total ?? 0,
      available: d?.available ?? 0,
      reserved: d?.reserved ?? 0,
      sold: d?.sold ?? 0,
      disabled: d?.disabled ?? 0,
    }
  },

  /** Adjust seat allocation via protected RPC */
  async adjustAllocation(packageId: string, newCount: number, prefix?: string): Promise<void> {
    const { error } = await requireSupabase().rpc('admin_adjust_seat_allocation', {
      p_package_id: packageId,
      p_new_count: newCount,
      p_prefix: prefix ?? null,
    })
    if (error) throw error
  },

  /** Soft-delete packages that are no longer in the active list */
  async pruneRemoved(eventId: string, activePackageIds: string[]): Promise<void> {
    if (!activePackageIds.length) return
    // Find packages in Supabase that are active but not in the current list
    const { data, error } = await requireSupabase()
      .from('packages')
      .select('id')
      .eq('event_id', eventId)
      .is('deleted_at', null)
      .not('id', 'in', `(${activePackageIds.join(',')})`)
    if (error) throw error
    const toRemove = (data ?? []).map((r: Record<string, unknown>) => String(r.id))
    for (const id of toRemove) {
      await packageService.remove(id).catch(() => undefined)
    }
  },
}
