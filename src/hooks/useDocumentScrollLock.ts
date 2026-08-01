import { useEffect } from 'react'

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Locks the document behind a full-screen modal without changing its visual
 * position on iOS. Android keeps its existing overflow-only behaviour.
 */
export function useDocumentScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return
    const body = document.body
    const html = document.documentElement
    const scrollY = window.scrollY
    const useFixedBody = isIOSDevice()
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      htmlOverflow: html.style.overflow,
    }

    body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    if (useFixedBody) {
      body.style.position = 'fixed'
      body.style.top = `-${scrollY}px`
      body.style.left = '0'
      body.style.right = '0'
      body.style.width = '100%'
    }

    return () => {
      body.style.overflow = previous.bodyOverflow
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.left = previous.bodyLeft
      body.style.right = previous.bodyRight
      body.style.width = previous.bodyWidth
      html.style.overflow = previous.htmlOverflow
      if (useFixedBody) window.scrollTo({ top: scrollY, behavior: 'auto' })
    }
  }, [locked])
}
