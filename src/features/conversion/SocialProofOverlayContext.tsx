import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type SocialProofOverlayContextValue = {
  isOverlayActive: boolean
  setOverlayActive: (active: boolean) => void
}

const SocialProofOverlayCtx = createContext<SocialProofOverlayContextValue>({
  isOverlayActive: false,
  setOverlayActive: () => {},
})

export function SocialProofOverlayProvider({ children }: { children: ReactNode }) {
  const [isOverlayActive, setIsOverlayActive] = useState(false)
  const setOverlayActive = useCallback((active: boolean) => {
    setIsOverlayActive(active)
  }, [])
  return (
    <SocialProofOverlayCtx.Provider value={{ isOverlayActive, setOverlayActive }}>
      {children}
    </SocialProofOverlayCtx.Provider>
  )
}

export function useSocialProofOverlay() {
  return useContext(SocialProofOverlayCtx)
}