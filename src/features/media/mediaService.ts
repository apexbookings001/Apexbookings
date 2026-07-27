import { requireSupabase } from '../../services/supabase/client'

export type MediaBucket = 'payment-proofs' | 'event-images' | 'ticket-assets' | 'chat-files'
export type MediaAsset = { id: string; bucket: MediaBucket; path: string; mimeType?: string; sizeBytes?: number; createdAt: string }

export const mediaService = {
  async upload(organizationId: string, bucket: MediaBucket, file: File): Promise<MediaAsset> {
    const client = requireSupabase(); const path = `${organizationId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
    const { error: uploadError } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false }); if (uploadError) throw uploadError
    const { data, error } = await client.from('media').insert({ organization_id: organizationId, bucket, path, mime_type: file.type, size_bytes: file.size }).select().single(); if (error) { await client.storage.from(bucket).remove([path]); throw error }
    return { id: String(data.id), bucket: data.bucket as MediaBucket, path: String(data.path), mimeType: data.mime_type ?? undefined, sizeBytes: data.size_bytes ?? undefined, createdAt: String(data.created_at) }
  },
  async list(organizationId: string, bucket?: MediaBucket): Promise<MediaAsset[]> { let query = requireSupabase().from('media').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }); if (bucket) query = query.eq('bucket', bucket); const { data, error } = await query; if (error) throw error; return (data ?? []).map(row => ({ id: String(row.id), bucket: row.bucket as MediaBucket, path: String(row.path), mimeType: row.mime_type ?? undefined, sizeBytes: row.size_bytes ?? undefined, createdAt: String(row.created_at) })) },
  async signedUrl(asset: MediaAsset, expiresIn = 300): Promise<string> { const { data, error } = await requireSupabase().storage.from(asset.bucket).createSignedUrl(asset.path, expiresIn); if (error) throw error; return data.signedUrl },
  async remove(asset: MediaAsset): Promise<void> { const client = requireSupabase(); const { error } = await client.storage.from(asset.bucket).remove([asset.path]); if (error) throw error; const { error: databaseError } = await client.from('media').delete().eq('id', asset.id); if (databaseError) throw databaseError },
}