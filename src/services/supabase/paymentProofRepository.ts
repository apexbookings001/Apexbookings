import { supabase } from '../../lib/supabase'

type SignedUpload = { path: string; token: string }

export async function uploadPaymentProofs(paymentId: string, files: File[], bankRequestId?: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!files.length) throw new Error('Select at least one payment proof file.')

  const fileMetadata = files.map(file => ({ name: file.name, mimeType: file.type, size: file.size }))

  // Path 1: Try Edge Function invocation
  try {
    const { data, error } = await supabase.functions.invoke('public-payment-proof', {
      body: { action: 'sign', paymentId, files: fileMetadata },
    })

    if (!error && data?.uploads && Array.isArray(data.uploads) && data.uploads.length === files.length) {
      const uploads = data.uploads as SignedUpload[]

      for (let index = 0; index < files.length; index += 1) {
        const upload = uploads[index]
        const { error: uploadError } = await supabase.storage
          .from('payment-proofs')
          .uploadToSignedUrl(upload.path, upload.token, files[index], { contentType: files[index].type })
        if (uploadError) throw uploadError
      }

      const completedFiles = fileMetadata.map((file, index) => ({ ...file, path: uploads[index].path }))
      const completion = await supabase.functions.invoke('public-payment-proof', {
        body: { action: 'complete', paymentId, bankRequestId, files: completedFiles },
      })

      if (!completion.error && completion.data?.ok) {
        return // Successfully submitted via Edge Function
      }
    }
  } catch (edgeFnError) {
    console.warn('[uploadPaymentProofs] Edge function failed or unavailable, executing direct fallback:', edgeFnError)
  }

  // Path 2: Resilient Direct Storage Upload + RPC Fallback
  const { data: infoData, error: infoError } = await supabase.rpc('public_get_payment_upload_info', { p_payment_id: paymentId })
  if (infoError || !infoData?.organizationId) {
    throw new Error(infoError?.message || 'Payment details could not be resolved for proof upload.')
  }

  const organizationId = infoData.organizationId as string
  const completedFiles: Array<{ name: string; mimeType: string; size: number; path: string }> = []

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
    const path = `${organizationId}/${paymentId}/${crypto.randomUUID()}-${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('payment-proofs')
      .upload(path, file, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('[uploadPaymentProofs] Direct storage upload failed:', uploadError)
      throw new Error(`Failed to upload ${file.name}: ${uploadError.message}`)
    }

    completedFiles.push({
      name: file.name,
      mimeType: file.type,
      size: file.size,
      path,
    })
  }

  const { error: rpcError } = await supabase.rpc('public_submit_payment_proof', {
    p_payment_id: paymentId,
    p_files: completedFiles,
    p_bank_request_id: bankRequestId || null,
  })

  if (rpcError) {
    console.error('[uploadPaymentProofs] RPC submission failed:', rpcError)
    throw new Error(`Failed to save payment proof details: ${rpcError.message}`)
  }
}
