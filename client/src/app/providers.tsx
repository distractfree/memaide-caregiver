import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthContext'
import { PatientProvider } from '@/features/patients/PatientContext'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PatientProvider>{children}</PatientProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
