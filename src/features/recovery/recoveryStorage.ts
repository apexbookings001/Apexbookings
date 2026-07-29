export const RECOVERY_VERSION = 1
export const ADMIN_RESUME_WINDOW_MS = 5 * 60 * 1000
export const BOOKING_RESUME_WINDOW_MS = 10 * 60 * 1000

export type AdminRecoveryState = {
  recoveryVersion: 1
  userId?: string
  lastActiveAt: number
  updatedAt: number
  route: string
  scrollPositions: Record<string, number>
  ui: Record<string, unknown>
}

const ADMIN_PREFIX = 'apex.admin-recovery.v1'
const ADMIN_POINTER = `${ADMIN_PREFIX}:latest`

function storage() {
  try { return window.localStorage } catch { return null }
}

function validAdminState(value: unknown): value is AdminRecoveryState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<AdminRecoveryState>
  return state.recoveryVersion === RECOVERY_VERSION
    && typeof state.lastActiveAt === 'number'
    && typeof state.updatedAt === 'number'
    && typeof state.route === 'string'
    && Boolean(state.scrollPositions && typeof state.scrollPositions === 'object')
    && Boolean(state.ui && typeof state.ui === 'object')
}

function readKey(key: string) {
  const raw = storage()?.getItem(key)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return validAdminState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function createAdminRecoveryState(route = '/admin'): AdminRecoveryState {
  const now = Date.now()
  return { recoveryVersion: RECOVERY_VERSION, lastActiveAt: now, updatedAt: now, route, scrollPositions: {}, ui: {} }
}

export function readLatestAdminRecovery() {
  const pointer = storage()?.getItem(ADMIN_POINTER)
  return pointer ? readKey(pointer) : null
}

export function readAdminRecovery(userId?: string | null) {
  if (!userId) return readLatestAdminRecovery()
  return readKey(`${ADMIN_PREFIX}:${userId}`)
}

export function writeAdminRecovery(state: AdminRecoveryState) {
  const target = `${ADMIN_PREFIX}:${state.userId || 'anonymous'}`
  try {
    storage()?.setItem(target, JSON.stringify(state))
    storage()?.setItem(ADMIN_POINTER, target)
  } catch {
    // Recovery is best effort when storage is unavailable or full.
  }
}

export function clearAdminRecovery(userId?: string | null) {
  try {
    if (userId) storage()?.removeItem(`${ADMIN_PREFIX}:${userId}`)
    const pointer = storage()?.getItem(ADMIN_POINTER)
    if (!userId && pointer) storage()?.removeItem(pointer)
    storage()?.removeItem(ADMIN_POINTER)
  } catch {
    // Storage is optional recovery metadata, never the source of authority.
  }
}

export function getAdminResumeRoute(userId?: string | null) {
  const route = (userId ? readAdminRecovery(userId) : readLatestAdminRecovery())?.route
  return route?.startsWith('/admin') && route !== '/admin/login' ? route : null
}

export function isWithinWindow(lastActiveAt: number, windowMs: number) {
  return Number.isFinite(lastActiveAt) && Date.now() - lastActiveAt <= windowMs
}
