import { registerProtectedStateReset } from './workspace'

export type StoreSnapshot<T> = {
  data: T
  error: string | null
  loading: boolean
}

export function createProtectedMemoryStore<T>(initialValue: () => T) {
  let snapshot: StoreSnapshot<T> = { data: initialValue(), error: null, loading: false }
  const listeners = new Set<() => void>()

  const emit = () => listeners.forEach(listener => listener())
  const set = (data: T) => {
    snapshot = { data, error: null, loading: false }
    emit()
  }
  const fail = (error: unknown) => {
    snapshot = {
      ...snapshot,
      loading: false,
      error: error instanceof Error ? error.message : 'Data synchronization failed.',
    }
    emit()
    window.dispatchEvent(new CustomEvent('apex:data-sync-error', { detail: snapshot.error }))
  }
  const reset = () => {
    snapshot = { data: initialValue(), error: null, loading: false }
    emit()
  }

  registerProtectedStateReset(reset)

  return {
    get: () => snapshot.data,
    snapshot: () => snapshot,
    set,
    fail,
    loading: () => {
      snapshot = { ...snapshot, loading: true, error: null }
      emit()
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    optimistic: async (next: T, operation: () => Promise<void>) => {
      const previous = snapshot.data
      set(next)
      try {
        await operation()
      } catch (error) {
        snapshot = { data: previous, error: error instanceof Error ? error.message : 'The change could not be saved.', loading: false }
        emit()
        window.dispatchEvent(new CustomEvent('apex:data-sync-error', { detail: snapshot.error }))
        throw error
      }
    },
    reset,
  }
}
