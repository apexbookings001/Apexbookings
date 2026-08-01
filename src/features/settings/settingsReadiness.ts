import { emailService } from '../email/emailService'
import { mediaLibraryStore } from '../media/mediaLibraryStore'
import { platformPaymentStore } from '../payments/platformPaymentStore'
import { adminSettingsStore } from './adminSettingsStore'

export type SetupSection = 'organization' | 'email' | 'branding' | 'payments' | 'media' | 'notifications' | 'social proof' | 'localization'
export type SetupReadiness = { complete: boolean; issues: string[] }

const result = (issues: string[]): SetupReadiness => ({ complete: issues.length === 0, issues })

export function getSettingsReadiness(): Record<SetupSection, SetupReadiness> {
  const admin = adminSettingsStore.get()
  const payments = platformPaymentStore.get()
  const email = emailService.configuration()

  const organizationIssues: string[] = []
  if (!admin.organization.name.trim()) organizationIssues.push('Add the organization name')
  if (!/^\S+@\S+\.\S+$/.test(admin.organization.supportEmail.trim())) organizationIssues.push('Add a support email')
  if (!admin.organization.website.trim()) organizationIssues.push('Add the public website')
  if (!admin.organization.phone.trim()) organizationIssues.push('Add a support phone number')

  const paymentIssues: string[] = []
  const enabledMethods = payments.methods.filter(method => method.enabled)
  if (!enabledMethods.length) paymentIssues.push('Enable at least one payment method')
  if (!enabledMethods.some(method => method.isDefault)) paymentIssues.push('Choose a default payment method')
  const paypal = enabledMethods.find(method => method.id === 'paypal')
  const cashApp = enabledMethods.find(method => method.id === 'cash_app')
  const giftCard = enabledMethods.find(method => method.id === 'apple_gift_card')
  const bankTransfer = enabledMethods.find(method => method.id === 'bank_transfer')
  const cryptocurrency = enabledMethods.find(method => method.id === 'cryptocurrency')
  if (paypal && !/^\S+@\S+\.\S+$/.test(paypal.destination.trim())) paymentIssues.push('Add the PayPal receiving email')
  if (cashApp && !/^\$[A-Za-z0-9_]{1,20}$/.test(cashApp.destination.trim())) paymentIssues.push('Add a valid Cash App $Cashtag')
  if (giftCard && !giftCard.instructions.trim()) paymentIssues.push('Add Apple Gift Card instructions')
  if (bankTransfer && !bankTransfer.instructions.trim()) paymentIssues.push('Add bank-transfer instructions')
  if (cryptocurrency) {
    const readyWallets = Object.values(payments.cryptocurrencies).filter(wallet => wallet.enabled && wallet.address.trim() && wallet.network.trim())
    if (!readyWallets.length) paymentIssues.push('Configure at least one enabled crypto wallet')
    const defaultWallet = payments.cryptocurrencies[payments.defaultCrypto]
    if (!defaultWallet?.enabled || !defaultWallet.address.trim() || !defaultWallet.network.trim()) paymentIssues.push('Complete the default cryptocurrency wallet')
  }

  const emailIssues: string[] = []
  if (!/^\S+@\S+\.\S+$/.test(email.senderEmail.trim())) emailIssues.push('Add the sender email')
  if (!email.senderName.trim()) emailIssues.push('Add the sender name')
  if (!/^\S+@\S+\.\S+$/.test(email.replyTo.trim())) emailIssues.push('Add the reply-to email')
  if (email.status !== 'connected') emailIssues.push('Validate the email connection')

  const brandingIssues: string[] = []
  if (!admin.branding.name.trim()) brandingIssues.push('Add the public brand name')
  if (!admin.branding.tagline.trim()) brandingIssues.push('Add the public tagline')
  if (!/^#[0-9a-f]{6}$/i.test(admin.branding.accent)) brandingIssues.push('Choose a valid accent color')

  const notificationIssues = Object.values(admin.notifications).some(Boolean) ? [] : ['Enable at least one admin notification']
  return {
    organization: result(organizationIssues),
    email: result(emailIssues),
    branding: result(brandingIssues),
    payments: result(paymentIssues),
    media: result(mediaLibraryStore.listEventAssets().length ? [] : ['Upload at least one reusable event asset']),
    notifications: result(notificationIssues),
    'social proof': result([]),
    localization: result([]),
  }
}
