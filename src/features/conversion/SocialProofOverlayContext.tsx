import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type SocialProofOverlayContextValue = {
  isOverlayActive: boolean
  setOverlayActive: (active: boolean) => void
  isChatActive: boolean
  setChatActive: (active: boolean) => void
}

const SocialProofOverlayCtx = createContext<SocialProofOverlayContextValue>({
  isOverlayActive: false,
  setOverlayActive: () => {},
  isChatActive: false,
  setChatActive: () => {},
})

export function SocialProofOverlayProvider({ children }: { children: ReactNode }) {
  const [isOverlayActive, setIsOverlayActive] = useState(false)
  const [isChatActive, setIsChatActive] = useState(false)
  const setOverlayActive = useCallback((active: boolean) => {
    setIsOverlayActive(active)
  }, [])
  return (
    <SocialProofOverlayCtx.Provider value={{ isOverlayActive, setOverlayActive, isChatActive, setChatActive: setIsChatActive }}>
      {children}
    </SocialProofOverlayCtx.Provider>
  )
}

export function useSocialProofOverlay() {
  return useContext(SocialProofOverlayCtx)
}
