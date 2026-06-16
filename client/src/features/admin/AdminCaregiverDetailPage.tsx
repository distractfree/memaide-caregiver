import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Mail,
  Users,
  ShieldCheck,
} from 'lucide-react'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate } from '@/utils/formatting'
import { adminApi } from './adminApi'
import type { AdminCaregiverDetail, AdminPatient } from './types'
import { AdminPatientContextPanel } from './components/AdminPatientContextPanel'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

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
      <div className="admin-portal" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <LoadingState label="Loading caregiver details..." />
      </div>
    )
  }

  if (error || !caregiver) {
    return (
      <div className="admin-portal" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <ErrorState message={error || 'Caregiver not found.'} />
        <button className="adm-btn-navy" onClick={() => navigate('/admin')}>
          Back to Admin Dashboard
        </button>
      </div>
    )
  }

  const statusBadgeClass = caregiver.status === 'Enabled' ? 'adm-badge-enabled' : 'adm-badge-disabled'

  return (
    <div className="admin-portal">
      {/* Header */}
      <div className="adm-header">
        <div className="adm-header-top">
          <div>
            <h1 style={{ fontSize: 24 }}>Caregiver Details</h1>
            <p className="adm-header-subtitle">Account overview and assigned patients</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="adm-content">
        {/* Back button */}
        <button
          className="adm-back-btn"
          onClick={() => navigate('/admin')}
          style={{ marginBottom: 24 }}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="adm-card" style={{ marginBottom: 32 }}>
            <div className="adm-card-body">
              {/* Profile Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div className="adm-profile-avatar">
                    {getInitials(caregiver.name)}
                  </div>
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 600, color: 'var(--adm-text-primary)', margin: 0 }}>
                      {caregiver.name}
                    </h2>
                    <p style={{ fontSize: 14, color: 'var(--adm-text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Mail className="h-3.5 w-3.5" />
                      {caregiver.email}
                    </p>
                  </div>
                </div>
                <span className={`adm-badge ${statusBadgeClass}`}>
                  {caregiver.status}
                </span>
              </div>

              {/* Detail Fields Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: 16,
                paddingBottom: 24,
                borderBottom: '1px solid var(--adm-border)',
              }}>
                <div className="adm-detail-field">
                  <span className="adm-detail-field-label">Last Login</span>
                  <span className="adm-detail-field-value">
                    {caregiver.lastLoginAt ? formatDate(caregiver.lastLoginAt) : 'Not tracked yet'}
                  </span>
                </div>
                <div className="adm-detail-field">
                  <span className="adm-detail-field-label">Assigned Patients</span>
                  <span className="adm-detail-field-value">{caregiver.patients.length}</span>
                </div>
                <div className="adm-detail-field">
                  <span className="adm-detail-field-label">Account Created</span>
                  <span className="adm-detail-field-value">{formatDate(caregiver.createdAt)}</span>
                </div>
                <div className="adm-detail-field">
                  <span className="adm-detail-field-label">Last Updated</span>
                  <span className="adm-detail-field-value">{formatDate(caregiver.updatedAt)}</span>
                </div>
              </div>

              {/* Access Level */}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck className="h-4 w-4" style={{ color: 'var(--adm-teal)' }} />
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Read-only admin oversight</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Assigned Patients */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="adm-card">
            <div className="adm-card-header">
              <h2 className="adm-card-title">Assigned Patients</h2>
              <p className="adm-card-subtitle">
                {caregiver.patients.length} patient{caregiver.patients.length !== 1 ? 's' : ''} under this caregiver
              </p>
            </div>

            {caregiver.patients.length === 0 ? (
              <div className="adm-loading">
                <EmptyState
                  icon={Users}
                  title="No patients assigned"
                  message="This caregiver has not added any patients yet."
                />
              </div>
            ) : (
              <div className="adm-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {caregiver.patients.map((patient) => (
                  <div
                    key={patient.id}
                    className="adm-patient-row"
                    onClick={() => setSelectedPatient(patient)}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--adm-text-primary)', margin: 0 }}>
                        {patient.name}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--adm-text-secondary)', marginTop: 4 }}>
                        Device ID: {patient.deviceId}
                      </p>
                      {patient.phoneNumber && (
                        <p style={{ fontSize: 12, color: 'var(--adm-text-secondary)', marginTop: 2 }}>
                          {patient.phoneNumber}
                        </p>
                      )}
                    </div>
                    <button className="adm-table-action" onClick={(e) => { e.stopPropagation(); setSelectedPatient(patient) }}>
                      View Context
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Patient Context Panel */}
      <AdminPatientContextPanel
        patient={selectedPatient}
        onClose={() => setSelectedPatient(null)}
      />
    </div>
  )
}
