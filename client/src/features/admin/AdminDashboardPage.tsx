import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, ShieldCheck, Users, Activity, LogOut, MessageCircle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAdminAuth } from './AdminAuthContext'
import { adminApi } from './adminApi'
import type { AdminCaregiver } from './types'
import { formatDate } from '@/utils/formatting'
import { LoadingState } from '@/components/ui/LoadingState'
import { ErrorState } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { AdminAiSessionDetailModal } from './components/AdminAiSessionDetailModal'

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
          adminApi.getAiSessions()
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

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-app-shell">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-6 w-6 text-accent" />
              <h1 className="text-2xl font-semibold tracking-tight text-on-surface">
                MemAide / GuardiaNova Admin
              </h1>
            </div>
            <p className="text-sm text-on-surface-variant">
              Caregiver coordination dashboard
            </p>
          </div>
          <Button variant="outline" size="sm" leftIcon={<LogOut className="h-4 w-4" />} onClick={logout}>
            Sign out
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-text-muted">
                <Users className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Total Caregivers</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{loading ? '...' : totalCaregivers}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.05 }}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-text-muted">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Total Patients</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{loading ? '...' : totalPatients}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.1 }}>
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-text-muted">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Enabled</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{loading ? '...' : enabledCaregivers}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.15 }}>
            <Card className="flex flex-col gap-2 h-full justify-center">
              <Badge tone="accent" className="self-start mb-2">Read-Only MVP</Badge>
              <p className="text-xs text-text-muted leading-tight">Admin mode for the student MVP.</p>
            </Card>
          </motion.div>
        </div>

        {/* AI Support Session Summary Cards */}
        <div className="grid gap-gutter sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.2 }}>
            <Card className="flex flex-col gap-2 border-l-4 border-l-blue-500">
              <div className="flex items-center gap-2 text-text-muted">
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Total AI Sessions</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{loading ? '...' : aiSessions.length}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.25 }}>
            <Card className="flex flex-col gap-2 border-l-4 border-l-accent">
              <div className="flex items-center gap-2 text-text-muted">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Active</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{loading ? '...' : aiSessions.filter(s => s.status === 'active').length}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.3 }}>
            <Card className="flex flex-col gap-2 border-l-4 border-l-error">
              <div className="flex items-center gap-2 text-text-muted">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Emergency Suggestion</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{loading ? '...' : aiSessions.filter(s => s.emergencySuggestedAt).length}</p>
            </Card>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: 0.35 }}>
            <Card className="flex flex-col gap-2 border-l-4 border-l-success">
              <div className="flex items-center gap-2 text-text-muted">
                <Eye className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">Resolved</span>
              </div>
              <p className="text-3xl font-semibold text-on-surface">{loading ? '...' : aiSessions.filter(s => s.status === 'resolved').length}</p>
            </Card>
          </motion.div>
        </div>

        {/* Caregivers Table */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-section/30">
              <h2 className="text-lg font-semibold text-on-surface">Caregivers</h2>
            </div>
            
            {loading ? (
              <div className="p-12"><LoadingState label="Loading caregivers..." /></div>
            ) : error ? (
              <div className="p-12"><ErrorState message={error} /></div>
            ) : caregivers.length === 0 ? (
              <div className="p-12">
                <EmptyState icon={Users} title="No caregivers found" message="There are no caregivers registered in the system yet." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-surface-section/50 text-text-muted">
                    <tr>
                      <th className="px-6 py-3 font-medium">Name & Email</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Last Login</th>
                      <th className="px-6 py-3 font-medium">Patients</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {caregivers.map((c) => (
                      <tr key={c.id} className="hover:bg-surface-section/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-on-surface">{c.name}</div>
                          <div className="text-text-muted text-xs">{c.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone="success">{c.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-text-muted">
                          {c.lastLoginAt ? formatDate(c.lastLoginAt) : 'Not tracked yet'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-on-surface-variant">
                            <Users className="h-3.5 w-3.5" />
                            <span>{c.patientCount}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            leftIcon={<Eye className="h-4 w-4" />}
                            onClick={() => navigate(`/admin/caregivers/${c.id}`)}
                          >
                            View details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>

        {/* AI Sessions Table */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="mt-8">
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-variant/30 bg-surface-section/30">
              <h2 className="text-lg font-semibold text-on-surface">AI Support Sessions</h2>
            </div>
            
            {loading ? (
              <div className="p-12"><LoadingState label="Loading AI sessions..." /></div>
            ) : error ? (
              <div className="p-12"><ErrorState message={error} /></div>
            ) : aiSessions.length === 0 ? (
              <div className="p-12">
                <EmptyState icon={MessageCircle} title="No AI sessions found" message="There are no AI support sessions recorded yet." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-surface-section/50 text-text-muted">
                    <tr>
                      <th className="px-6 py-3 font-medium">Session ID</th>
                      <th className="px-6 py-3 font-medium">Patient</th>
                      <th className="px-6 py-3 font-medium">Caregiver</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Started At</th>
                      <th className="px-6 py-3 font-medium text-right">Messages</th>
                      <th className="px-6 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {aiSessions.slice(0, 10).map((s) => (
                      <tr key={s.id} className="hover:bg-surface-section/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-mono text-xs text-on-surface-variant">{s.id}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-on-surface">{s.patientName}</div>
                        </td>
                        <td className="px-6 py-4 text-text-muted">
                          {s.caregiverName}
                        </td>
                        <td className="px-6 py-4">
                          <Badge tone={s.status === 'active' ? 'accent' : s.status === 'caregiver_joined' ? 'success' : 'muted'}>{s.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-text-muted">
                          {formatDate(s.startedAt)}
                        </td>
                        <td className="px-6 py-4 text-right font-medium">
                          {s.messageCount}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            leftIcon={<Eye className="h-4 w-4" />}
                            onClick={() => setSelectedAiSessionId(s.id)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </motion.div>

        <AdminAiSessionDetailModal 
          sessionId={selectedAiSessionId} 
          onClose={() => setSelectedAiSessionId(null)} 
        />
      </div>
    </div>
  )
}
