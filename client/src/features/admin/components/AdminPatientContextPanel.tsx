import { motion, AnimatePresence } from 'framer-motion'
import { X, Activity, Smartphone, Clock, Radio, Video, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/utils/formatting'
import type { AdminPatient } from '../types'

interface AdminPatientContextPanelProps {
  patient: AdminPatient | null
  onClose: () => void
}

export function AdminPatientContextPanel({ patient, onClose }: AdminPatientContextPanelProps) {
  if (!patient) return null

  return (
    <AnimatePresence>
      {patient && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-outline-variant/30 bg-surface shadow-2xl overflow-y-auto"
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
                <h2 className="text-lg font-semibold text-on-surface">Patient Context</h2>
                <Button variant="ghost" size="sm" onClick={onClose} className="px-2">
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="p-6 flex-1 space-y-6">
                <div>
                  <h3 className="text-xl font-semibold text-on-surface mb-1">{patient.name}</h3>
                  <div className="flex items-center gap-2 text-text-muted text-sm">
                    <Smartphone className="h-4 w-4" />
                    <span>{patient.deviceId}</span>
                  </div>
                  {patient.phoneNumber && (
                    <div className="text-text-muted text-sm mt-1">{patient.phoneNumber}</div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <Badge tone="accent">Independent living support profile</Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="block text-text-muted text-xs uppercase tracking-wider mb-1">Added</span>
                    <span className="text-on-surface">{formatDate(patient.createdAt)}</span>
                  </div>
                  <div>
                    <span className="block text-text-muted text-xs uppercase tracking-wider mb-1">Updated</span>
                    <span className="text-on-surface">{formatDate(patient.updatedAt)}</span>
                  </div>
                </div>

                <div className="border-t border-outline-variant/30 pt-6 space-y-4">
                  <h4 className="font-medium text-on-surface">Safe Context Overview</h4>
                  
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent-dark">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface">Reminder support</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">Context for scheduled daily tasks.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                      <Activity className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface">Wellness/activity trends</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">Non-diagnostic wellness metrics.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600">
                      <Radio className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface">Approximate BLE proximity context</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">Beacon interactions in the home.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning-dark">
                      <Video className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface">Stream status context</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">Current stream connection state.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600">
                      <MessageCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-on-surface">AI support session history</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">Scripted support conversations.</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-warning/30 bg-warning-container/30 p-4 mt-6">
                  <p className="text-xs text-warning-dark">
                    <strong>Admin Notice:</strong> This panel shows safe, read-only context. MemAide is for caregiver coordination, not medical monitoring or emergency surveillance.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
