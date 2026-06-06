import { useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, User2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { usePatients } from '@/features/patients/PatientContext'
import { initialsFromName } from '@/utils/formatting'
import { cn } from '@/utils/cn'

export function PatientSelector() {
  const { patients, selectedPatient, setSelectedPatient, status } = usePatients()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const disabled = status === 'loading' || patients.length === 0
  const label =
    status === 'loading'
      ? 'Loading patients…'
      : selectedPatient
        ? selectedPatient.name
        : 'No patient selected'

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className={cn(
          'flex items-center gap-3 rounded-full bg-surface-container-low pl-1.5 pr-4 py-1.5 border border-outline-variant/40 transition-colors duration-200',
          'hover:bg-surface-container-high disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-[12px] font-semibold">
          {selectedPatient ? initialsFromName(selectedPatient.name) : <User2 className="h-4 w-4" />}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[11px] uppercase tracking-wider text-text-muted">Patient</span>
          <span className="text-sm font-semibold text-on-surface">{label}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 text-on-surface-variant" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-card-hover p-2 z-30"
          >
            {patients.length === 0 ? (
              <div className="px-3 py-4 text-sm text-text-muted">No patients yet.</div>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {patients.map((p) => {
                  const active = p.id === selectedPatient?.id
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPatient(p.id)
                          setOpen(false)
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                          active ? 'bg-surface-container-high' : 'hover:bg-surface-container-low',
                        )}
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-accent-dark text-[12px] font-semibold">
                          {initialsFromName(p.name)}
                        </span>
                        <span className="flex-1 leading-tight">
                          <span className="block text-sm font-semibold text-on-surface">{p.name}</span>
                          {p.deviceId && (
                            <span className="block text-[11px] text-text-muted font-mono">
                              {p.deviceId}
                            </span>
                          )}
                        </span>
                        {active && <Check className="h-4 w-4 text-accent" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
