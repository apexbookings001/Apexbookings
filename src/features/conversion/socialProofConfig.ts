/**
 * Public social-proof behaviour is intentionally product-owned rather than an
 * event-by-event timing surface. Administrators only choose whether it is on.
 */
export const SOCIAL_PROOF_DEFAULTS = {
  initialDelayMs: 8_000,
  displayDurationMs: 5_000,
  rotationIntervalMs: 8_000,
  // One toast is rendered at a time; this bounds the eligible rotation pool.
  maxCards: 20,
  desktopPosition: 'bottom-left' as const,
  mobilePosition: 'top-center' as const,
  returnSessionAfterMs: 30 * 60 * 1_000,
}

export const SOCIAL_PROOF_DEMO_DISCLOSURE = 'Sample Data · Investor Demo'
