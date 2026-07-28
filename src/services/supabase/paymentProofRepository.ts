import { supabase } from '../../lib/supabase'

type SignedUpload = { path: string; token: string }

export async function uploadPaymentProofs(paymentId: string, files: File[], bankRequestId?: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!files.length) throw new Error('Select at least one payment proof file.')
  const fileMetadata = files.map(file => ({ name: file.name, mimeType: file.type, size: file.size }))
  const { data, error } = await supabase.functions.invoke('public-payment-proof', { body: { action: 'sign', paymentId, files: fileMetadata } })
  if (error) throw error
  const uploads = (data?.uploads ?? []) as SignedUpload[]
  if (uploads.length !== files.length) throw new Error('Payment proof upload could not be prepared.')

  for (let index = 0; index < files.length; index += 1) {
    const upload = uploads[index]
    const { error: uploadError } = await supabase.storage.from('payment-proofs').uploadToSignedUrl(upload.path, upload.token, files[index], { contentType: files[index].type })
    if (uploadError) throw uploadError
  }

  const completedFiles = fileMetadata.map((file, index) => ({ ...file, path: uploads[index].path }))
  const completion = await supabase.functions.invoke('public-payment-proof', { body: { action: 'complete', paymentId, bankRequestId, files: completedFiles } })
  if (completion.error) throw completion.error
}
