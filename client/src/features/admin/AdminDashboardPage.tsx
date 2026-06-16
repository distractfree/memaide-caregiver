import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Users,
  Activity,
  LogOut,
  ShieldCheck,
  MessageCircle,
  Eye,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
} from 'lucide-react'
import { useAdminAuth } from './AdminAuthContext'
import { adminApi } from './adminApi'
import type { AdminCaregiver } from './types'
import { formatDate } from '@/utils/formatting'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { AdminAiSessionDetailModal } from './components/AdminAiSessionDetailModal'

/* ── Helpers ── */

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'enabled':
      return 'adm-badge-enabled'
    case 'disabled':
      return 'adm-badge-disabled'
    default:
      return 'adm-badge-enabled'
  }
}

function getSessionStatusBadge(status: string): string {
  switch (status) {
    case 'active':
      return 'adm-badge-active'
    case 'closed':
    case 'resolved':
      return 'adm-badge-closed'
    case 'caregiver_joined':
      return 'adm-badge-caregiver-joined'
    default:
      return 'adm-badge-active'
  }
}

function formatSessionStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/* ── Component ── */

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const { logout } = useAdminAuth()
  const [caregivers, setCaregivers] = useState<AdminCaregiver[]>([])
  const [aiSessions, setAiSessions] = useState<any[]>([])
  const [selectedAiSessionId, setSelectedAiSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [caregiversData, sessionsData] = await Promise.all([
          adminApi.getCaregivers(),
          adminApi.getAiSessions(),
        ])
        if (!cancelled) {
          setCaregivers(caregiversData)
          setAiSessions(sessionsData)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load dashboard data.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const totalCaregivers = caregivers.length
  const totalPatients = caregivers.reduce((acc, c) => acc + c.patientCount, 0)
  const enabledCaregivers = caregivers.filter((c) => c.status === 'Enabled').length
  const emergencySessions = aiSessions.filter((s) => s.emergencySuggestedAt).length
  const activeSessions = aiSessions.filter((s) => s.status === 'active').length

  return (
    <div className="admin-portal">
      {/* ── Header ── */}
      <div className="adm-header">
        <div className="adm-header-top">
          <div>
            <h1>Admin Oversight</h1>
            <p className="adm-header-subtitle">
              Caregiver coordination, patient context, and AI safety review
            </p>
          </div>
          <div className="adm-header-actions">
            <div className="adm-admin-pill">
              <div className="adm-admin-avatar">AD</div>
              <span className="adm-admin-text">Admin</span>
            </div>
            <button className="adm-logout-btn" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="adm-content">
        {/* Hero Panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="adm-hero">
            <div className="adm-hero-content">
              <div className="adm-hero-badge">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure oversight workspace
              </div>
              <h2>Care Coordination Command Center</h2>
              <p className="adm-hero-text">
                Monitor caregiver access, patient context, and AI-assisted safety sessions from one
                secure view.
              </p>
              <div className="adm-hero-kpis">
                <div className="adm-hero-kpi">
                  <div className="adm-hero-kpi-label">Active Patients</div>
                  <div className="adm-hero-kpi-value">{loading ? '…' : totalPatients}</div>
                </div>
                <div className="adm-hero-kpi">
                  <div className="adm-hero-kpi-label">High-Risk Reviews</div>
                  <div className="adm-hero-kpi-value">{loading ? '…' : emergencySessions}</div>
                </div>
                <div className="adm-hero-kpi">
                  <div className="adm-hero-kpi-label">Active Sessions</div>
                  <div className="adm-hero-kpi-value">{loading ? '…' : activeSessions}</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Metric Cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
        >
          <div className="adm-metrics-grid">
            {/* Total Caregivers */}
            <div className="adm-metric-card">
              <div className="adm-metric-card-header">
                <div className="adm-metric-icon-tile">
                  <Users />
                </div>
                <div className="adm-metric-trend">
                  <TrendingUp className="h-3 w-3" />
                  Active
                </div>
              </div>
              <p className="adm-metric-label">Total Caregivers</p>
              <p className="adm-metric-value">{loading ? '…' : totalCaregivers}</p>
              <div className="adm-metric-bottom-line" />
            </div>

            {/* Total Patients */}
            <div className="adm-metric-card">
              <div className="adm-metric-card-header">
                <div className="adm-metric-icon-tile">
                  <Activity />
                </div>
                <div className="adm-metric-trend">
                  <TrendingUp className="h-3 w-3" />
                  Tracked
                </div>
              </div>
              <p className="adm-metric-label">Total Patients</p>
              <p className="adm-metric-value">{loading ? '…' : totalPatients}</p>
              <div className="adm-metric-bottom-line" />
            </div>

            {/* Enabled Accounts */}
            <div className="adm-metric-card">
              <div className="adm-metric-card-header">
                <div className="adm-metric-icon-tile">
                  <CheckCircle />
                </div>
                <div className="adm-metric-trend">
                  <TrendingUp className="h-3 w-3" />
                  Verified
                </div>
              </div>
              <p className="adm-metric-label">Enabled Accounts</p>
              <p className="adm-metric-value">{loading ? '…' : enabledCaregivers}</p>
              <div className="adm-metric-bottom-line" />
            </div>

            {/* High-Risk Sessions */}
            <div className="adm-metric-card">
              <div className="adm-metric-card-header">
                <div className="adm-metric-icon-tile">
                  <AlertTriangle />
                </div>
                {emergencySessions > 0 ? (
                  <div className="adm-metric-trend warning">
                    <AlertTriangle className="h-3 w-3" />
                    {emergencySessions} flagged
                  </div>
                ) : (
                  <div className="adm-metric-trend">
                    <CheckCircle className="h-3 w-3" />
                    Clear
                  </div>
                )}
              </div>
              <p className="adm-metric-label">High-Risk Sessions</p>
              <p className="adm-metric-value">{loading ? '…' : emergencySessions}</p>
              <div className="adm-metric-bottom-line" />
            </div>
          </div>
        </motion.div>

        {/* Main Grid: Tables + Safety */}
        <div className="adm-main-grid">
          {/* Left column: tables */}
          <div className="adm-left-column">
            {/* Caregivers Table */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <div className="adm-card">
                <div className="adm-card-header">
                  <h2 className="adm-card-title">Caregiver Accounts</h2>
                  <p className="adm-card-subtitle">
                    Active and inactive caregiver access overview
                  </p>
                </div>

                {loading ? (
                  <div className="adm-loading">
                    <LoadingState label="Loading caregivers..." />
                  </div>
                ) : error ? (
                  <div className="adm-loading">
                    <ErrorState message={error} />
                  </div>
                ) : caregivers.length === 0 ? (
                  <div className="adm-loading">
                    <EmptyState
                      icon={Users}
                      title="No caregivers found"
                      message="There are no caregivers registered in the system yet."
                    />
                  </div>
                ) : (
                  <div className="adm-table-wrapper">
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>Caregiver</th>
                          <th>Status</th>
                          <th>Last Login</th>
                          <th>Patients</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {caregivers.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <div className="adm-table-name">
                                <div className="adm-table-avatar">
                                  {getInitials(c.name)}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 500 }}>{c.name}</div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: 'var(--adm-text-muted)',
                                    }}
                                  >
                                    {c.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className={`adm-badge ${getStatusBadgeClass(c.status)}`}
                              >
                                {c.status}
                              </span>
                            </td>
                            <td style={{ color: 'var(--adm-text-secondary)', fontSize: 14 }}>
                              {c.lastLoginAt
                                ? formatDate(c.lastLoginAt)
                                : 'Not tracked yet'}
                            </td>
                            <td style={{ fontWeight: 500 }}>{c.patientCount}</td>
                            <td>
                              <button
                                className="adm-table-action"
                                onClick={() =>
                                  navigate(`/admin/caregivers/${c.id}`)
                                }
                              >
                                Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>

            {/* AI Sessions Table */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <div className="adm-card">
                <div className="adm-card-header">
                  <h2 className="adm-card-title">AI Safety Sessions</h2>
                  <p className="adm-card-subtitle">
                    Active and closed AI-assisted safety review sessions
                  </p>
                </div>

                {loading ? (
                  <div className="adm-loading">
                    <LoadingState label="Loading AI sessions..." />
                  </div>
                ) : error ? (
                  <div className="adm-loading">
                    <ErrorState message={error} />
                  </div>
                ) : aiSessions.length === 0 ? (
                  <div className="adm-loading">
                    <EmptyState
                      icon={MessageCircle}
                      title="No AI sessions found"
                      message="There are no AI support sessions recorded yet."
                    />
                  </div>
                ) : (
                  <div className="adm-table-wrapper">
                    <table className="adm-table">
                      <thead>
                        <tr>
                          <th>Session</th>
                          <th>Patient</th>
                          <th>Caregiver</th>
                          <th>Status</th>
                          <th>Safety Flag</th>
                          <th>Messages</th>
                          <th>Started</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiSessions.slice(0, 10).map((s) => (
                          <tr key={s.id}>
                            <td>
                              <span
                                style={{
                                  fontFamily: 'monospace',
                                  fontSize: 12,
                                  color: 'var(--adm-text-secondary)',
                                }}
                              >
                                {s.id.slice(0, 8)}
                              </span>
                            </td>
                            <td style={{ fontWeight: 500 }}>{s.patientName}</td>
                            <td style={{ color: 'var(--adm-text-secondary)' }}>
                              {s.caregiverName}
                            </td>
                            <td>
                              <span
                                className={`adm-badge ${getSessionStatusBadge(s.status)}`}
                              >
                                {formatSessionStatus(s.status)}
                              </span>
                            </td>
                            <td>
                              {s.emergencySuggestedAt ? (
                                <span className="adm-badge adm-badge-emergency">
                                  <AlertTriangle className="h-3 w-3" />
                                  Emergency
                                </span>
                              ) : (
                                <span className="adm-badge adm-badge-no-emergency">
                                  <CheckCircle className="h-3 w-3" />
                                  No Emergency
                                </span>
                              )}
                            </td>
                            <td style={{ fontWeight: 500 }}>{s.messageCount}</td>
                            <td style={{ color: 'var(--adm-text-secondary)', fontSize: 13 }}>
                              {formatDate(s.startedAt)}
                            </td>
                            <td>
                              <button
                                className="adm-table-action"
                                onClick={() => setSelectedAiSessionId(s.id)}
                              >
                                <Eye className="h-3.5 w-3.5 inline mr-1" />
                                {s.status === 'active' ? 'Review' : 'View'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right column: Safety Intelligence */}
          <div className="adm-right-column">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
            >
              <div className="adm-card adm-safety-panel">
                <div className="adm-card-body">
                  <h3 className="adm-card-title">Safety Intelligence</h3>
                  <p className="adm-card-subtitle" style={{ marginBottom: 24 }}>
                    Today&apos;s review signals
                  </p>

                  {/* Safety Score */}
                  <div className="adm-safety-score">
                    <p className="adm-safety-score-label">Safety Score</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span className="adm-safety-score-number">
                        {loading
                          ? '…'
                          : emergencySessions > 0
                            ? Math.max(50, 100 - emergencySessions * 15)
                            : 95}
                      </span>
                      <span className="adm-safety-score-max">/ 100</span>
                    </div>
                    <div className="adm-safety-bar">
                      <div
                        className="adm-safety-bar-fill"
                        style={{
                          width: loading
                            ? '0%'
                            : `${emergencySessions > 0 ? Math.max(50, 100 - emergencySessions * 15) : 95}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Safety Items */}
                  <div className="adm-safety-items">
                    {emergencySessions > 0 && (
                      <div className="adm-safety-item high">
                        <p className="adm-safety-item-title">High-risk language detected</p>
                        <p className="adm-safety-item-detail">
                          {emergencySessions} active session{emergencySessions > 1 ? 's' : ''}
                        </p>
                      </div>
                    )}
                    <div className="adm-safety-item low">
                      <p className="adm-safety-item-title">System operational</p>
                      <p className="adm-safety-item-detail">
                        {loading ? '…' : aiSessions.length} total sessions tracked
                      </p>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="adm-safety-recommendation">
                    <p className="adm-safety-recommendation-title">Recommended</p>
                    <p className="adm-safety-recommendation-text">
                      {emergencySessions > 0
                        ? 'Review active high-risk sessions first, then check missed reminder patterns.'
                        : 'All sessions are within normal safety parameters. Continue monitoring.'}
                    </p>
                  </div>

                  {emergencySessions > 0 && (
                    <button
                      className="adm-btn-navy full-width"
                      onClick={() => {
                        const emergency = aiSessions.find((s) => s.emergencySuggestedAt)
                        if (emergency) setSelectedAiSessionId(emergency.id)
                      }}
                    >
                      Review Now
                    </button>
                  )}
                </div>
              </div>
            </motion.div>

            {/* AI session summary cards */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <div className="adm-card">
                <div className="adm-card-header">
                  <h3 className="adm-card-title">Session Summary</h3>
                  <p className="adm-card-subtitle">AI support overview</p>
                </div>
                <div className="adm-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="adm-metric-icon-tile" style={{ width: 32, height: 32, borderRadius: 8 }}>
                        <MessageCircle className="h-4 w-4" />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Total Sessions</span>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{loading ? '…' : aiSessions.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="adm-metric-icon-tile" style={{ width: 32, height: 32, borderRadius: 8 }}>
                        <Activity className="h-4 w-4" />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Active</span>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 600 }}>{loading ? '…' : activeSessions}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="adm-metric-icon-tile" style={{ width: 32, height: 32, borderRadius: 8 }}>
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Emergency Flagged</span>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 600, color: emergencySessions > 0 ? 'var(--adm-danger)' : undefined }}>
                      {loading ? '…' : emergencySessions}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* AI Session Detail Modal */}
      <AdminAiSessionDetailModal
        sessionId={selectedAiSessionId}
        onClose={() => setSelectedAiSessionId(null)}
      />
    </div>
  )
}
