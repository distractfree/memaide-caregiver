import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, ApiClientError } from '@/services/apiClient'
import { useAuth } from '@/features/auth/AuthContext'
import type { Patient } from '@/types/domain'

const SELECTED_KEY = 'memaide_selected_patient_id'

type PatientStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PatientContextValue {
  patients: Patient[]
  selectedPatientId: string | null
  selectedPatient: Patient | null
  status: PatientStatus
  error: string | null
  setSelectedPatient: (id: string) => void
  refresh: () => Promise<void>
}

const PatientContext = createContext<PatientContextValue | null>(null)

function readPersistedId(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

function writePersistedId(id: string | null): void {
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id)
    else localStorage.removeItem(SELECTED_KEY)
  } catch {
    /* ignore */
  }
}

export function PatientProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatientId, setSelectedPatientIdState] = useState<string | null>(readPersistedId)
  const [status, setStatus] = useState<PatientStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const { data } = await api.listPatients({ limit: 100 })
      setPatients(data)
      setStatus('ready')
      setSelectedPatientIdState((current) => {
        const stillValid = current && data.some((p) => p.id === current)
        const next = stillValid ? current : (data[0]?.id ?? null)
        writePersistedId(next)
        return next
      })
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('Unable to load patients.')
      }
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) {
      setPatients([])
      setStatus('idle')
      setError(null)
      return
    }
    void load()
  }, [isAuthenticated, load])

  const setSelectedPatient = useCallback((id: string) => {
    setSelectedPatientIdState(id)
    writePersistedId(id)
  }, [])

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId],
  )

  const value = useMemo<PatientContextValue>(
    () => ({
      patients,
      selectedPatientId,
      selectedPatient,
      status,
      error,
      setSelectedPatient,
      refresh: load,
    }),
    [patients, selectedPatientId, selectedPatient, status, error, setSelectedPatient, load],
  )

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
}

export function usePatients(): PatientContextValue {
  const ctx = useContext(PatientContext)
  if (!ctx) throw new Error('usePatients must be used inside <PatientProvider>')
  return ctx
}
