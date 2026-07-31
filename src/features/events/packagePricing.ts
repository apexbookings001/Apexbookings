export type DiscountedPackage = {
  price: number
  originalPrice?: number
  discountedPrice?: number | null
  discountEnabled?: boolean
  discountEndsAt?: string | null
}

const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100

export const packageOriginalPrice = (pkg: DiscountedPackage) => money(pkg.originalPrice ?? pkg.price)

export const isDiscountActive = (pkg: DiscountedPackage, now = Date.now()) => {
  const original = packageOriginalPrice(pkg)
  const discount = money(pkg.discountedPrice)
  const endsAt = pkg.discountEndsAt ? Date.parse(pkg.discountEndsAt) : Number.NaN
  return Boolean(pkg.discountEnabled && original > 0 && discount > 0 && discount < original && Number.isFinite(endsAt) && now < endsAt)
}

export const packagePricing = (pkg: DiscountedPackage, quantity = 1, now = Date.now()) => {
  const originalUnitPrice = packageOriginalPrice(pkg)
  const discountIsActive = isDiscountActive(pkg, now)
  const chargedUnitPrice = discountIsActive ? money(pkg.discountedPrice) : originalUnitPrice
  const safeQuantity = Math.max(1, Math.floor(Number(quantity) || 1))
  const originalTicketTotal = money(originalUnitPrice * safeQuantity)
  const totalDue = money(chargedUnitPrice * safeQuantity)
  const savings = money(originalTicketTotal - totalDue)
  return {
    originalUnitPrice,
    chargedUnitPrice,
    quantity: safeQuantity,
    originalTicketTotal,
    totalDue,
    savings,
    discountAmount: money(originalUnitPrice - chargedUnitPrice),
    discountPercentage: originalUnitPrice > 0 ? Math.round(((originalUnitPrice - chargedUnitPrice) / originalUnitPrice) * 100) : 0,
    discountIsActive,
    discountEndsAt: pkg.discountEndsAt ?? null,
  }
}

export const validatePackageDiscount = (pkg: DiscountedPackage, now = Date.now()) => {
  const original = packageOriginalPrice(pkg)
  if (!(original > 0)) return 'Original price must be greater than zero.'
  if (!pkg.discountEnabled) return null
  const discount = money(pkg.discountedPrice)
  if (!(discount > 0)) return 'Discounted price must be greater than zero.'
  if (!(discount < original)) return 'Discounted price must be lower than the original price.'
  if (!pkg.discountEndsAt || !Number.isFinite(Date.parse(pkg.discountEndsAt)) || Date.parse(pkg.discountEndsAt) <= now) return 'Discount expiry must be in the future when discount is enabled.'
  return null
}

export const defaultDiscountEndsAt = () => new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
