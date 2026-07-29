import { supabase } from '../../lib/supabase'

export type DeletableRecordType =
  | 'notification'
  | 'payment'
  | 'booking'
  | 'conversation'
  | 'message'
  | 'customer'
  | 'ticket'
  | 'payment_proof'
  | 'bank_transfer'
  | 'analytics'

type DeleteResult = { ok: boolean; recordType: DeletableRecordType; identifier: string }
type CleanupPreview = Record<string, number>
export type TestCleanupCategory = 'notifications' | 'conversations' | 'payments' | 'bookings' | 'analytics'

export async function softDeleteAdminRecord(recordType: DeletableRecordType, identifier: string, strongConfirmation = false): Promise<DeleteResult> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('admin_soft_delete_record', {
    target_type: recordType,
    target_identifier: identifier,
    strong_confirmation: strongConfirmation,
  })
  if (error) throw error
  const result = (data ?? {}) as Partial<DeleteResult>
  if (!result.ok) throw new Error('The record could not be deleted.')
  return { ok: true, recordType, identifier }
}

export async function cleanupTestData(categories: TestCleanupCategory[], previewOnly = true): Promise<CleanupPreview> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('admin_cleanup_test_data', {
    target_categories: categories,
    preview_only: previewOnly,
  })
  if (error) throw error
  return (data ?? {}) as CleanupPreview
}
