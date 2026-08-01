import { createRoot } from 'react-dom/client'
import { TicketDocument, TICKET_EXPORT_HEIGHT, TICKET_EXPORT_WIDTH } from './TicketDocument'
import { safeTicketFilename, type TicketViewModel } from './ticketViewModel'

const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>('img[data-ticket-asset]'))
  await Promise.all(images.map(image => {
    if (image.complete) {
      if (image.naturalWidth > 0) return Promise.resolve()
      return Promise.reject(new Error(`Ticket asset failed to load: ${image.currentSrc || image.src}`))
    }
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.removeEventListener('load', onLoad)
        image.removeEventListener('error', onError)
      }
      const onLoad = () => { cleanup(); resolve() }
      const onError = () => { cleanup(); reject(new Error(`Ticket asset failed to load: ${image.currentSrc || image.src}`)) }
      image.addEventListener('load', onLoad, { once: true })
      image.addEventListener('error', onError, { once: true })
    })
  }))
}

async function waitForFonts(): Promise<void> {
  if ('fonts' in document) await document.fonts.ready
}

async function pngDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  return { width: image.naturalWidth, height: image.naturalHeight }
}

export async function downloadTicketPng(ticket: TicketViewModel): Promise<void> {
  const container = document.createElement('div')
  Object.assign(container.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${TICKET_EXPORT_WIDTH}px`,
    height: `${TICKET_EXPORT_HEIGHT}px`,
    margin: '0',
    padding: '0',
    overflow: 'visible',
    visibility: 'visible',
    pointerEvents: 'none',
    transform: 'none',
    zIndex: '-1',
  })
  document.body.appendChild(container)
  const reactRoot = createRoot(container)

  try {
    reactRoot.render(<TicketDocument ticket={ticket} />)
    await nextPaint()
    await waitForFonts()
    const ticketRoot = container.querySelector<HTMLElement>('[data-ticket-export-root="true"]')
    if (!ticketRoot) throw new Error('The ticket export document did not render.')
    await waitForImages(ticketRoot)
    await nextPaint()

    const { toPng } = await import('html-to-image')
    const image = await toPng(ticketRoot, {
      cacheBust: true,
      backgroundColor: '#101216',
      pixelRatio: 1,
      width: TICKET_EXPORT_WIDTH,
      height: TICKET_EXPORT_HEIGHT,
      canvasWidth: TICKET_EXPORT_WIDTH,
      canvasHeight: TICKET_EXPORT_HEIGHT,
    })
    const dimensions = await pngDimensions(image)
    if (dimensions.width !== TICKET_EXPORT_WIDTH || dimensions.height !== TICKET_EXPORT_HEIGHT) {
      throw new Error(`Ticket export dimensions were ${dimensions.width}×${dimensions.height}, expected ${TICKET_EXPORT_WIDTH}×${TICKET_EXPORT_HEIGHT}.`)
    }
    const link = document.createElement('a')
    link.download = safeTicketFilename(ticket.ticketCode)
    link.href = image
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    reactRoot.unmount()
    container.remove()
  }
}
