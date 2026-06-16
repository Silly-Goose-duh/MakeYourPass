import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from '@/components/layout/Layout'
import HomePage from '@/pages/Home'
import { LoginPage } from '@/pages/Login'
import { SignupPage } from '@/pages/Signup'
import { PublicEventForm } from '@/pages/PublicEventForm'
import { OrgDashboard } from '@/pages/OrgDashboard'
import { CreateEvent } from '@/pages/CreateEvent'
import { EditEvent } from '@/pages/EditEvent'
import { EventAnalytics } from '@/pages/EventAnalytics'
import { MCPanel } from '@/pages/MCPanel'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute, OrgAdminRoute, SuperAdminRoute } from '@/components/auth/RouteGuards'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* Ambient background overlay */}
        <div
          className="fixed inset-0 pointer-events-none z-[-1]"
          style={{
            backgroundImage: `
              radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 100%),
              radial-gradient(ellipse 50% 30% at 20% 60%, rgba(99,102,241,0.04) 0%, transparent 100%),
              radial-gradient(ellipse 40% 30% at 80% 70%, rgba(245,158,11,0.03) 0%, transparent 100%)
            `,
            backgroundAttachment: 'fixed',
          }}
        />
        <AnimatePresence mode="wait">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="event/:eventSlug" element={<PublicEventForm />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="signup" element={<SignupPage />} />
            </Route>

            {/* Organization Dashboard */}
            <Route path="/dashboard" element={<ProtectedRoute><OrgDashboard /></ProtectedRoute>} />
            <Route path="/dashboard/events/new" element={<OrgAdminRoute><CreateEvent /></OrgAdminRoute>} />
            <Route path="/dashboard/events/:id/edit" element={<OrgAdminRoute><EditEvent /></OrgAdminRoute>} />
            <Route path="/dashboard/events/:id/analytics" element={<OrgAdminRoute><EventAnalytics /></OrgAdminRoute>} />

            {/* Superadmin Master Control */}
            <Route path="/mc" element={<SuperAdminRoute><MCPanel /></SuperAdminRoute>} />
            <Route path="/mc/*" element={<SuperAdminRoute><MCPanel /></SuperAdminRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </AuthProvider>
    </BrowserRouter>
  )
}
