import type { AttachmentMeta, SupportConversation } from '../../features/support/supportStore'
import { supabase } from '../../lib/supabase'
import { getWorkspaceMembership, requireOrganizationId } from './workspace'

export async function uploadChatAttachment(conversation: SupportConversation, attachment: AttachmentMeta): Promise<AttachmentMeta> {
  if (!attachment.file) return attachment
  if (!supabase) throw new Error('Supabase is not configured.')
  const file = attachment.file
  const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)

  if (getWorkspaceMembership()) {
    const organizationId = requireOrganizationId()
    const path = `${organizationId}/${conversation.id}/${crypto.randomUUID()}-${safeName}`
    const upload = await supabase.storage.from('chat-files').upload(path, file, { contentType: attachment.mimeType })
    if (upload.error) throw upload.error
    const signed = await supabase.storage.from('chat-files').createSignedUrl(path, 7 * 24 * 60 * 60)
    if (signed.error) throw signed.error
    const mediaId = crypto.randomUUID()
    const insert = await supabase.from('media').insert({ id: mediaId, organization_id: organizationId, bucket: 'chat-files', path, mime_type: attachment.mimeType, size_bytes: attachment.size, is_chat_media: true, metadata: { name: attachment.name, conversationId: conversation.id, width: attachment.width, height: attachment.height, duration: attachment.duration } })
    if (insert.error) throw insert.error
    return { ...attachment, file: undefined, url: signed.data.signedUrl }
  }

  if (!conversation.accessToken) throw new Error('This chat upload is not authorized.')
  const signed = await supabase.functions.invoke('public-chat-media', { body: { action: 'sign', conversationToken: conversation.accessToken, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size } })
  if (signed.error) throw signed.error
  const upload = await supabase.storage.from('chat-files').uploadToSignedUrl(signed.data.path, signed.data.token, file, { contentType: attachment.mimeType })
  if (upload.error) throw upload.error
  const completed = await supabase.functions.invoke('public-chat-media', { body: { action: 'complete', conversationToken: conversation.accessToken, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, path: signed.data.path, metadata: { width: attachment.width, height: attachment.height, duration: attachment.duration } } })
  if (completed.error) throw completed.error
  return { ...attachment, file: undefined, url: completed.data.url }
}
