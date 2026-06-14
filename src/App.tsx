import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from '@/components/layout/Layout'
import { HomePage } from '@/pages/Home'
import { LoginPage } from '@/pages/Login'
import { SignupPage } from '@/pages/Signup'
import { EventPage } from '@/pages/EventPage'
import { PublicEventsPage } from '@/pages/PublicEventsPage'
import { ScanPage } from '@/pages/ScanPage'
import { DashboardLayout } from '@/pages/Dashboard'
import { EventsPage } from '@/pages/Events'
import { EventBuilderPage } from '@/pages/EventBuilder'
import { EventDashboard } from '@/pages/EventDashboard'
import { SettingsPage } from '@/pages/SettingsPage'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/auth/RouteGuards'
import { AuthProvider } from '@/hooks/useAuth'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AnimatePresence mode="wait">
          <Routes>
          {/* Public routes */}
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="events" element={<PublicEventsPage />} />
            <Route path="event/:eventSlug" element={<EventPage />} />
            <Route path="scan/:qrCode" element={<ScanPage />} />
            <Route path="login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
            <Route path="signup" element={<PublicOnlyRoute><SignupPage /></PublicOnlyRoute>} />
          </Route>

          {/* Dashboard routes (protected) */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="events" replace />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/new" element={<EventBuilderPage />} />
            <Route path="events/:id" element={<EventDashboard />} />
            <Route path="events/:id/edit" element={<EventBuilderPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </AuthProvider>
  </BrowserRouter>
  )
}

export default App