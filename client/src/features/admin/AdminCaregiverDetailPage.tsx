import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, User, Mail, Calendar, Activity, Users, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/utils/formatting'
import { adminApi } from './adminApi'
import type { AdminCaregiverDetail, AdminPatient } from './types'
import { AdminPatientContextPanel } from './components/AdminPatientContextPanel'

export function AdminCaregiverDetailPage() {
  const { caregiverId } = useParams<{ caregiverId: string }>()
  const navigate = useNavigate()
  
  const [caregiver, setCaregiver] = useState<AdminCaregiverDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedPatient, setSelectedPatient] = useState<AdminPatient | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!caregiverId) return

    void (async () => {
      setLoading(true)
      try {
        const data = await adminApi.getCaregiver(caregiverId)
        if (!cancelled) {
          setCaregiver(data)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load caregiver details.')
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [caregiverId])

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8 flex items-center justify-center">
        <LoadingState label="Loading caregiver details..." />
      </div>
    )
  }

  if (error || !caregiver) {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center">
        <ErrorState message={error || 'Caregiver not found.'} />
        <Button variant="outline" className="mt-4" onClick={() => navigate('/admin')}>
          Back to Admin Dashboard
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-app-shell">
        {/* Header */}
        <div className="mb-8 flex flex-col items-start gap-4">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/admin')} className="-ml-2">
            Back to Dashboard
          </Button>
          
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-on-surface flex items-center gap-3">
              {caregiver.name}
              <Badge tone="success">{caregiver.status}</Badge>
            </h1>
            <p className="text-sm text-on-surface-variant flex items-center gap-2 mt-1">
              <Mail className="h-4 w-4" /> {caregiver.email}
            </p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-text-muted">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Total Patients</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{caregiver.patients.length}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-text-muted">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Status</span>
              </div>
              <p className="text-xl font-semibold text-on-surface mt-2">{caregiver.status}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-text-muted">
                <Calendar className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Last Login</span>
              </div>
              <p className="text-sm font-medium text-on-surface mt-2">
                {caregiver.lastLoginAt ? formatDate(caregiver.lastLoginAt) : 'Not tracked yet'}
              </p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
            <Card className="flex flex-col gap-2 h-full justify-center bg-surface-container-low">
              <div className="flex items-center gap-2 text-text-muted mb-1">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Admin View</span>
              </div>
              <p className="text-xs text-text-muted leading-tight">Read-only MVP details.</p>
            </Card>
          </motion.div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Detail Card */}
          <div className="lg:col-span-1">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-on-surface mb-6 border-b border-outline-variant/30 pb-4">Caregiver Details</h2>
                
                <div className="space-y-4">
                  <div>
                    <span className="block text-text-muted text-xs uppercase tracking-wider mb-1">Name</span>
                    <span className="text-on-surface font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-on-surface-variant" /> {caregiver.name}
                    </span>
                  </div>
                  
                  <div>
                    <span className="block text-text-muted text-xs uppercase tracking-wider mb-1">Email</span>
                    <span className="text-on-surface">{caregiver.email}</span>
                  </div>

                  <div>
                    <span className="block text-text-muted text-xs uppercase tracking-wider mb-1">Status</span>
                    <Badge tone="success">{caregiver.status}</Badge>
                    <p className="text-xs text-text-muted mt-2">Enable/Disable deferred to future schema update.</p>
                  </div>

                  <div className="border-t border-outline-variant/30 pt-4 mt-4">
                    <span className="block text-text-muted text-xs uppercase tracking-wider mb-1">Account Created</span>
                    <span className="text-on-surface text-sm">{formatDate(caregiver.createdAt)}</span>
                  </div>

                  <div>
                    <span className="block text-text-muted text-xs uppercase tracking-wider mb-1">Last Updated</span>
                    <span className="text-on-surface text-sm">{formatDate(caregiver.updatedAt)}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Patients List */}
          <div className="lg:col-span-2">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.25 }}>
              <Card className="p-0 overflow-hidden h-full flex flex-col">
                <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-section/30">
                  <h2 className="text-lg font-semibold text-on-surface">Assigned Patients</h2>
                </div>

                {caregiver.patients.length === 0 ? (
                  <div className="p-12 flex-1 flex flex-col items-center justify-center">
                    <EmptyState icon={Users} title="No patients assigned" message="This caregiver has not added any patients yet." />
                  </div>
                ) : (
                  <div className="divide-y divide-outline-variant/30">
                    {caregiver.patients.map((patient) => (
                      <div 
                        key={patient.id} 
                        className="p-6 hover:bg-surface-section/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedPatient(patient)}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <h3 className="text-base font-medium text-on-surface">{patient.name}</h3>
                            <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
                              <span>Device ID: {patient.deviceId}</span>
                              {patient.phoneNumber && (
                                <>
                                  <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                                  <span>{patient.phoneNumber}</span>
                                </>
                              )}
                            </div>
                            <div className="mt-3">
                              <Badge tone="accent" className="text-xs">Independent living support profile</Badge>
                            </div>
                          </div>
                          <Button variant="outline" size="sm">
                            View Context
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      <AdminPatientContextPanel 
        patient={selectedPatient} 
        onClose={() => setSelectedPatient(null)} 
      />
    </div>
  )
}
