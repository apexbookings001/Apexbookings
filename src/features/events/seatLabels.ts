/**
 * Seat labels are presentation-only, but must be generated consistently in
 * every client-side creation path. Database RPCs use the equivalent helper in
 * the seat integrity migration.
 */
export function packageSeatCode(packageName: string): string {
  const normalized = packageName.trim().toUpperCase()
  if (normalized === 'VVIP') return 'VV'
  if (normalized === 'VIP') return 'V'
  if (normalized === 'REGULAR') return 'R'

  return normalized.replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'C'
}

export function generateSeatLabel(packageCode: string, position: number): string {
  return `${packageCode}${String(Math.max(1, position)).padStart(3, '0')}`
}

export function seatLabelForPackage(packageName: string, position: number): string {
  return generateSeatLabel(packageSeatCode(packageName), position)
}
