export type OrganizationRole = 'owner' | 'admin' | 'support'

export type WorkspaceMembership = {
  userId: string
  organizationId: string
  role: OrganizationRole
}

type ProtectedStateReset = () => void

let membership: WorkspaceMembership | null = null
const resetters = new Set<ProtectedStateReset>()

export function setWorkspaceMembership(nextMembership: WorkspaceMembership | null) {
  membership = nextMembership
}

export function getWorkspaceMembership() {
  return membership
}

export function requireOrganizationId() {
  if (!membership) throw new Error('No authorized Apex Bookings workspace is active.')
  return membership.organizationId
}

export function registerProtectedStateReset(reset: ProtectedStateReset) {
  resetters.add(reset)
  return () => { resetters.delete(reset) }
}

export function clearProtectedApplicationState() {
  membership = null
  resetters.forEach(reset => reset())
}
