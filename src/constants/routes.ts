export const ROUTES = {
  home: '/', events: '/events', booking: '/booking', payment: '/payment', confirmation: '/confirmation', support: '/support', adminLogin: '/admin/login',
  admin: { dashboard: '/admin', template: '/admin/template', events: '/admin/events', bookings: '/admin/bookings', payments: '/admin/payments', media: '/admin/media', chat: '/admin/chat', notifications: '/admin/notifications', socialProof: '/admin/social-proof', settings: '/admin/settings', documentation: '/admin/documentation' },
  ticket: '/ticket/:ticketId',
} as const
