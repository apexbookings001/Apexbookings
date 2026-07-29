import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from '../../features/auth/AuthContext'
import { adminEventStore } from '../../features/events/adminEventStore'
import { masterBookingTemplateStore } from '../../features/events/bookingTemplate'
import { ticketStore } from '../../features/bookings/ticketStore'
import { paymentReviewStore } from '../../features/payments/paymentReviewStore'
import { bankTransferStore } from '../../features/payments/bankTransferStore'
import { platformPaymentStore } from '../../features/payments/platformPaymentStore'
import { supportStore } from '../../features/support/supportStore'
import { mediaLibraryStore } from '../../features/media/mediaLibraryStore'
import { socialProofStore } from '../../features/conversion/socialProofStore'
import { analyticsStore } from '../../features/analytics/analyticsStore'
import { emailService } from '../../features/email/emailService'
import { notificationStore } from '../../features/notifications/notificationStore'
import { adminSettingsStore } from '../../features/settings/adminSettingsStore'
import { subscribeToTable, unsubscribe, type RealtimeTable } from './realtime'
import { DataSyncStatus } from '../../components/feedback/DataSyncStatus'

type WorkspaceSyncValue = { ready: boolean; refetch: () => Promise<void> }
const WorkspaceSyncContext = createContext<WorkspaceSyncValue>({ ready: true, refetch: async () => undefined })

const hydrateAll = () => Promise.allSettled([
  adminEventStore.hydrate(),
  masterBookingTemplateStore.hydrate(),
  ticketStore.hydrate(),
  paymentReviewStore.hydrate(),
  bankTransferStore.hydrate(),
  platformPaymentStore.hydrate(),
  supportStore.hydrate(),
  mediaLibraryStore.hydrate(),
  socialProofStore.hydrate(),
  analyticsStore.hydrate(),
  emailService.hydrate(),
  notificationStore.hydrate(),
  adminSettingsStore.hydrate(),
])

export function WorkspaceSyncProvider({ children }: PropsWithChildren) {
  const { membership, session } = useAuth()
  const [ready, setReady] = useState(!membership)

  const refetch = useCallback(async () => {
    if (!membership) return
    await hydrateAll()
    setReady(true)
  }, [membership])

  useEffect(() => {
    if (!membership) {
      setReady(true)
      return
    }
    setReady(false)
    void refetch()
  }, [membership?.organizationId, session?.access_token, refetch])

  useEffect(() => {
    if (!membership) return
    const organizationFilter = `organization_id=eq.${membership.organizationId}`
    const timers = new Map<string, number>()
    const schedule = (key: string, callback: () => Promise<unknown>) => {
      const current = timers.get(key)
      if (current) window.clearTimeout(current)
      timers.set(key, window.setTimeout(() => void callback(), 150))
    }
    const subscribe = (table: RealtimeTable, filter: string | undefined, key: string, callback: () => Promise<unknown>) => subscribeToTable(table, filter, () => schedule(key, callback))
    const channels: RealtimeChannel[] = [
      subscribe('events', organizationFilter, 'events', adminEventStore.hydrate),
      subscribe('packages', undefined, 'events', adminEventStore.hydrate),
      subscribe('seats', undefined, 'events', adminEventStore.hydrate),
      subscribe('bookings', undefined, 'commerce', async () => Promise.all([ticketStore.hydrate(), paymentReviewStore.hydrate(), bankTransferStore.hydrate()])),
      subscribe('payments', undefined, 'commerce', async () => Promise.all([ticketStore.hydrate(), paymentReviewStore.hydrate(), bankTransferStore.hydrate()])),
      subscribe('notifications', organizationFilter, 'notifications', notificationStore.hydrate),
      subscribe('support_conversations', organizationFilter, 'support', supportStore.hydrate),
      subscribe('chat_messages', undefined, 'support', supportStore.hydrate),
      subscribe('settings', organizationFilter, 'settings', async () => Promise.all([masterBookingTemplateStore.hydrate(), platformPaymentStore.hydrate(), socialProofStore.hydrate(), emailService.hydrate(), adminSettingsStore.hydrate()])),
      subscribe('payment_methods', organizationFilter, 'payments-settings', platformPaymentStore.hydrate),
      subscribe('crypto_wallets', organizationFilter, 'payments-settings', platformPaymentStore.hydrate),
      subscribe('social_proof_items', organizationFilter, 'social-proof', socialProofStore.hydrate),
      subscribe('media', organizationFilter, 'media', mediaLibraryStore.hydrate),
    ]
    return () => {
      timers.forEach(timer => window.clearTimeout(timer))
      channels.forEach(unsubscribe)
    }
  }, [membership?.organizationId])

  useEffect(() => {
    if (!membership) return
    const handleVisible = () => { if (document.visibilityState === 'visible') void refetch() }
    const handleOnline = () => void refetch()
    document.addEventListener('visibilitychange', handleVisible)
    window.addEventListener('online', handleOnline)
    return () => {
      document.removeEventListener('visibilitychange', handleVisible)
      window.removeEventListener('online', handleOnline)
    }
  }, [membership, refetch])

  const value = useMemo(() => ({ ready, refetch }), [ready, refetch])
  return <WorkspaceSyncContext.Provider value={value}><DataSyncStatus onRetry={() => void refetch()} />{children}</WorkspaceSyncContext.Provider>
}

export function useWorkspaceSync() {
  return useContext(WorkspaceSyncContext)
}
