import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './features/auth/AuthContext'
import { AppErrorBoundary } from './components/feedback/AppErrorBoundary'
import { WorkspaceSyncProvider } from './services/supabase/WorkspaceSyncProvider'
import { AdminSessionRecoveryProvider } from './features/recovery/AdminSessionRecoveryProvider'
import { BookingSessionRecoveryProvider } from './features/recovery/BookingSessionRecoveryProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AppErrorBoundary><BrowserRouter><AuthProvider><WorkspaceSyncProvider><AdminSessionRecoveryProvider><BookingSessionRecoveryProvider><App /></BookingSessionRecoveryProvider></AdminSessionRecoveryProvider></WorkspaceSyncProvider></AuthProvider></BrowserRouter></AppErrorBoundary></React.StrictMode>,
)
