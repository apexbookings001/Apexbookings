import type { SeatStatus } from '../../types/domain'
import type { ManagedEvent, TicketPackage } from './adminEventStore'
import type { BookingPackage, BookingPageData } from './bookingTemplate'
import type { SeatRecord } from './seatService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WHOLE_NUMBER = /^(?:0|[1-9]\d*)$/
const MONEY = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/

export type PackageSeatsDraft = {
  eventId: string
  capacityText: string
  packages: TicketPackage[]
  priceTextByPackageId: Record<string, string>
  allocationTextByPackageId: Record<string, string>
  seatStatusBySeatId: Record<string, SeatStatus>
}

export type ValidatedPackageSeatsDraft = {
  capacity: number
  packages: TicketPackage[]
}

const activePackages = (packages: TicketPackage[]) => packages
  .filter(item => item.enabled !== false && !item.deletedAt)

export function createPackageSeatsDraft(event: ManagedEvent, seats: SeatRecord[]): PackageSeatsDraft {
  const packages = structuredClone(activePackages(event.packages ?? []))
  return {
    eventId: event.id,
    capacityText: String(event.capacity ?? 0),
    packages,
    priceTextByPackageId: Object.fromEntries(packages.map(item => [item.id, String(item.originalPrice ?? item.price ?? 0)])),
    allocationTextByPackageId: Object.fromEntries(packages.map(item => [item.id, String(item.capacity ?? 0)])),
    seatStatusBySeatId: Object.fromEntries(seats.map(item => [item.id, item.status])),
  }
}

export function draftNumber(value: string): number {
  return WHOLE_NUMBER.test(value.trim()) ? Number(value.trim()) : 0
}

export function draftPrice(value: string): number {
  return MONEY.test(value.trim()) ? Number(value.trim()) : 0
}

export function validatePackageSeatsDraft(draft: PackageSeatsDraft):
  | { ok: true; value: ValidatedPackageSeatsDraft }
  | { ok: false; error: string } {
  const capacityValue = draft.capacityText.trim()
  if (!WHOLE_NUMBER.test(capacityValue) || Number(capacityValue) <= 0) {
    return { ok: false, error: 'Total venue capacity must be a whole number greater than zero.' }
  }

  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  let packages: TicketPackage[]
  try {
    packages = activePackages(draft.packages).map((item, displayOrder) => {
      const name = item.name.trim()
      const priceText = draft.priceTextByPackageId[item.id] ?? String(item.originalPrice ?? item.price ?? 0)
      const allocationText = draft.allocationTextByPackageId[item.id] ?? String(item.capacity ?? 0)
      if (!UUID_PATTERN.test(item.id)) throw new Error('Every package needs a valid ID before it can be saved.')
      if (!name) throw new Error('Every package needs a name.')
      if (seenIds.has(item.id)) throw new Error('Each package must be unique.')
      if (seenNames.has(name.toLocaleLowerCase())) throw new Error('Package names must be unique.')
      if (!MONEY.test(priceText.trim())) throw new Error(`${name}: price must be a valid amount.`)
      if (!WHOLE_NUMBER.test(allocationText.trim())) throw new Error(`${name}: seat allocation must be a whole number.`)

      const price = Number(priceText)
      const allocation = Number(allocationText)
      if (allocation > 0 && price <= 0) throw new Error(`${name}: set a price greater than zero before allocating seats.`)

      seenIds.add(item.id)
      seenNames.add(name.toLocaleLowerCase())
      return {
        ...item,
        name,
        price,
        originalPrice: price,
        capacity: allocation,
        displayOrder,
        seatSelectionEnabled: item.seatSelectionEnabled !== false,
        enabled: true,
        deletedAt: null,
      } satisfies TicketPackage
    })
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : 'Complete every package before saving.' }
  }

  if (!packages.length) return { ok: false, error: 'Add at least one package before saving.' }
  const capacity = Number(capacityValue)
  const allocated = packages.reduce((sum, item) => sum + item.capacity, 0)
  if (allocated !== capacity) {
    return {
      ok: false,
      error: allocated > capacity
        ? `Package allocations exceed the venue capacity by ${allocated - capacity} seats.`
        : `Allocate the remaining ${capacity - allocated} seats before saving.`,
    }
  }
  return { ok: true, value: { capacity, packages } }
}

function packageCardFromPackage(pkg: TicketPackage): BookingPackage {
  const accent = pkg.accent ?? pkg.color ?? '#71717A'
  return {
    id: pkg.id,
    name: pkg.name,
    price: pkg.price,
    originalPrice: pkg.originalPrice ?? pkg.price,
    discountedPrice: pkg.discountedPrice ?? null,
    discountEnabled: pkg.discountEnabled ?? false,
    discountEndsAt: pkg.discountEndsAt ?? null,
    desc: pkg.description ?? '',
    badge: pkg.badge ?? null,
    accent,
    glow: pkg.glow ?? `${accent}30`,
    seats: pkg.capacity,
    seatSelectionEnabled: pkg.seatSelectionEnabled !== false,
    icon: pkg.icon ?? '🎫',
    category: pkg.category,
    sections: pkg.sections ?? [],
    benefits: pkg.benefits ?? [],
  }
}

/** Keep the public card projection in sync with the single package draft. */
export function bookingPageWithPackages(page: BookingPageData, packages: TicketPackage[]): BookingPageData {
  const existing = new Map(page.packages.map(item => [item.id, item]))
  return {
    ...page,
    packages: activePackages(packages).map(pkg => {
      const previous = existing.get(pkg.id)
      return {
        ...(previous ?? packageCardFromPackage(pkg)),
        ...packageCardFromPackage(pkg),
      }
    }),
  }
}
