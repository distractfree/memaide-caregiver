import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Smartphone,
  Clock,
  Radio,
  Video,
  MessageCircle,
  Heart,
  Bell,
} from 'lucide-react'
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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 z-50"
            style={{
              width: '100%',
              maxWidth: 440,
              backgroundColor: 'var(--adm-card-bg, #FFFFFF)',
              borderLeft: '1px solid var(--adm-border, #E2E8F0)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--adm-border, #E2E8F0)',
                  padding: '20px 24px',
                }}
              >
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--adm-text-primary, #0F172A)', margin: 0 }}>
                    Patient Context
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--adm-text-secondary, #475569)', marginTop: 4 }}>
                    {patient.name}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 8,
                    color: 'var(--adm-text-secondary, #475569)',
                    borderRadius: 8,
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--adm-bg, #F8FAFC)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Content */}
              <div style={{ padding: 24, flex: 1 }}>
                {/* Patient Info */}
                <div style={{ marginBottom: 24 }}>
                  <h4 style={{ fontSize: 20, fontWeight: 600, color: 'var(--adm-text-primary)', marginBottom: 8 }}>
                    {patient.name}
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--adm-text-secondary)', fontSize: 14 }}>
                    <Smartphone className="h-4 w-4" />
                    <span>{patient.deviceId}</span>
                  </div>
                  {patient.phoneNumber && (
                    <div style={{ color: 'var(--adm-text-secondary)', fontSize: 14, marginTop: 4 }}>
                      {patient.phoneNumber}
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                  <div className="adm-detail-field">
                    <span className="adm-detail-field-label">Added</span>
                    <span className="adm-detail-field-value" style={{ fontSize: 13 }}>
                      {formatDate(patient.createdAt)}
                    </span>
                  </div>
                  <div className="adm-detail-field">
                    <span className="adm-detail-field-label">Updated</span>
                    <span className="adm-detail-field-value" style={{ fontSize: 13 }}>
                      {formatDate(patient.updatedAt)}
                    </span>
                  </div>
                </div>

                {/* Context rows */}
                <div style={{
                  borderTop: '1px solid var(--adm-border)',
                  paddingTop: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 20,
                  marginBottom: 24,
                }}>
                  <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--adm-text-primary)', margin: 0 }}>
                    Safe Context Overview
                  </h4>

                  <div className="adm-context-row">
                    <Clock className="h-4 w-4 adm-context-icon" />
                    <div>
                      <p className="adm-context-label">Reminder support</p>
                      <p className="adm-context-value">Context for scheduled daily tasks</p>
                    </div>
                  </div>

                  <div className="adm-context-row">
                    <Heart className="h-4 w-4 adm-context-icon" />
                    <div>
                      <p className="adm-context-label">Wellness / activity trends</p>
                      <p className="adm-context-value">Non-diagnostic wellness metrics</p>
                    </div>
                  </div>

                  <div className="adm-context-row">
                    <Radio className="h-4 w-4 adm-context-icon" />
                    <div>
                      <p className="adm-context-label">Approximate BLE proximity context</p>
                      <p className="adm-context-value">Beacon interactions in the home</p>
                    </div>
                  </div>

                  <div className="adm-context-row">
                    <Video className="h-4 w-4 adm-context-icon" />
                    <div>
                      <p className="adm-context-label">Stream status context</p>
                      <p className="adm-context-value">Current stream connection state</p>
                    </div>
                  </div>

                  <div className="adm-context-row">
                    <Bell className="h-4 w-4 adm-context-icon" />
                    <div>
                      <p className="adm-context-label">Reminder status</p>
                      <p className="adm-context-value">Tracked acknowledgments and misses</p>
                    </div>
                  </div>

                  <div className="adm-context-row">
                    <MessageCircle className="h-4 w-4 adm-context-icon" />
                    <div>
                      <p className="adm-context-label">AI support session history</p>
                      <p className="adm-context-value">Scripted support conversations</p>
                    </div>
                  </div>
                </div>

                {/* Safety Note */}
                <div className="adm-safety-note">
                  <p className="adm-safety-note-title">Safety Note</p>
                  <p className="adm-safety-note-text">
                    This panel shows safe, read-only context. MemAide is for caregiver coordination, not medical monitoring or emergency surveillance.
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
