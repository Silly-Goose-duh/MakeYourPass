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
        {/* Ambient background gradients — fixed behind all pages */}
        <div className="fixed inset-0 pointer-events-none z-[-1]"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 100%),
              radial-gradient(ellipse 50% 30% at 20% 60%, rgba(99,102,241,0.04) 0%, transparent 100%),
              radial-gradient(ellipse 40% 30% at 80% 70%, rgba(245,158,11,0.03) 0%, transparent 100%)
            `,
            backgroundAttachment: 'fixed'
          }}
        />
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

          {/* Dashboard routes (protected) — has sidebar */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="events" replace />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/:id" element={<EventDashboard />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Event builder — full-screen, no sidebar distractions */}
          <Route path="/dashboard/events/new" element={<ProtectedRoute><EventBuilderPage /></ProtectedRoute>} />
          <Route path="/dashboard/events/:id/edit" element={<ProtectedRoute><EventBuilderPage /></ProtectedRoute>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </AuthProvider>
  </BrowserRouter>
  )
}

export default App