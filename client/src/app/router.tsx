import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ProtectedRoute } from '@/components/layout/ProtectedRoute'
import { LoginPage } from '@/features/auth/LoginPage'
import { DashboardOverviewPage } from '@/features/dashboard/DashboardOverviewPage'
import { PatientsPage } from '@/features/patients/PatientsPage'
import { RemindersPage } from '@/features/reminders/RemindersPage'
import { ReminderReportsPage } from '@/features/reports/reminders/ReminderReportsPage'
import { HelpPage } from '@/features/help/HelpPage'
import { BeaconsPage } from '@/features/beacons/BeaconsPage'
import { BeaconReportsPage } from '@/features/reports/beacons/BeaconReportsPage'
import { WellnessTrendsPage } from '@/features/reports/vitals/WellnessTrendsPage'
import { StreamStatusPage } from '@/features/stream/StreamStatusPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AdminAuthProvider } from '@/features/admin/AdminAuthContext'
import { AdminPage } from '@/features/admin/AdminPage'
import { AdminCaregiverDetailPage } from '@/features/admin/AdminCaregiverDetailPage'
import { AdminProtectedRoute } from '@/features/admin/AdminProtectedRoute'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin/*"
        element={
          <AdminAuthProvider>
            <Routes>
              <Route index element={<AdminPage />} />
              <Route 
                path="caregivers/:caregiverId" 
                element={
                  <AdminProtectedRoute>
                    <AdminCaregiverDetailPage />
                  </AdminProtectedRoute>
                } 
              />
            </Routes>
          </AdminAuthProvider>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardOverviewPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="reminders" element={<RemindersPage />} />
        <Route path="reports/reminders" element={<ReminderReportsPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="beacons" element={<BeaconsPage />} />
        <Route path="reports/beacons" element={<BeaconReportsPage />} />
        <Route path="reports/vitals" element={<WellnessTrendsPage />} />
        <Route path="stream" element={<StreamStatusPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

