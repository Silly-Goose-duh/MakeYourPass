import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from '@/components/layout/Layout'
import { HomePage } from '@/pages/Home'
import { LoginPage } from '@/pages/Login'
import { SignupPage } from '@/pages/Signup'
import { EventPage } from '@/pages/EventPage'
import { PublicEventsPage } from '@/pages/PublicEventsPage'
import { DashboardLayout, DashboardHome } from '@/pages/Dashboard'
import { EventsPage } from '@/pages/Events'
import { EventBuilderPage } from '@/pages/EventBuilder'
import { AnalyticsPage } from '@/pages/Analytics'
import { TicketsPage } from '@/pages/TicketsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { AttendeesPage } from '@/pages/AttendeesPage'

function App() {
  return (
    <BrowserRouter>
      <AnimatePresence mode="wait">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="events" element={<PublicEventsPage />} />
            <Route path="event/:eventSlug" element={<EventPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="signup" element={<SignupPage />} />
          </Route>

          {/* Dashboard routes */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="events/new" element={<EventBuilderPage />} />
            <Route path="events/:id/edit" element={<EventBuilderPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="attendees" element={<AttendeesPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </BrowserRouter>
  )
}

export default App