import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Layout } from '@/components/layout/Layout'
import HomePage from '@/pages/Home'
import { LoginPage } from '@/pages/Login'
import { SignupPage } from '@/pages/Signup'
import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute, OrgAdminRoute, SuperAdminRoute } from '@/components/auth/RouteGuards'

const PublicEventForm = lazy(() => import('@/pages/PublicEventForm').then(m => ({ default: m.PublicEventForm })))
const OrgDashboard = lazy(() => import('@/pages/OrgDashboard').then(m => ({ default: m.OrgDashboard })))
const CreateEvent = lazy(() => import('@/pages/CreateEvent').then(m => ({ default: m.CreateEvent })))
const EditEvent = lazy(() => import('@/pages/EditEvent').then(m => ({ default: m.EditEvent })))
const EventAnalytics = lazy(() => import('@/pages/EventAnalytics').then(m => ({ default: m.EventAnalytics })))
const MCPanel = lazy(() => import('@/pages/MCPanel').then(m => ({ default: m.MCPanel })) )
const NotFoundPage = lazy(() => import('@/pages/NotFound'))
const EventsPage = lazy(() => import('@/pages/EventsPage').then(m => ({ default: m.default })))
const ScanPage = lazy(() => import('@/pages/ScanPage').then(m => ({ default: m.ScanPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))

function PageSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Loading...</p>
        </div>
      </div>
    }>
      {children}
    </Suspense>
  )
}

function AppRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public routes */}
        <Route path="/" element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="events" element={<PageSuspense><EventsPage /></PageSuspense>} />
          <Route path="event/:eventSlug" element={<PageSuspense><PublicEventForm /></PageSuspense>} />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="*" element={<PageSuspense><NotFoundPage /></PageSuspense>} />
        </Route>

        {/* Organization Dashboard */}
        <Route path="/dashboard" element={<ProtectedRoute><PageSuspense><OrgDashboard /></PageSuspense></ProtectedRoute>} />
        <Route path="/dashboard/events/new" element={<OrgAdminRoute><PageSuspense><CreateEvent /></PageSuspense></OrgAdminRoute>} />
        <Route path="/dashboard/events/:id/edit" element={<OrgAdminRoute><PageSuspense><EditEvent /></PageSuspense></OrgAdminRoute>} />
        <Route path="/dashboard/events/:id/analytics" element={<OrgAdminRoute><PageSuspense><EventAnalytics /></PageSuspense></OrgAdminRoute>} />
        <Route path="/host/:eventId/scan" element={<PageSuspense><ScanPage /></PageSuspense>} />
        <Route path="/host/:eventId/dashboard" element={<PageSuspense><DashboardPage /></PageSuspense>} />

        {/* Superadmin Master Control */}
        <Route path="/mc" element={<SuperAdminRoute><PageSuspense><MCPanel /></PageSuspense></SuperAdminRoute>} />
        <Route path="/mc/*" element={<SuperAdminRoute><PageSuspense><MCPanel /></PageSuspense></SuperAdminRoute>} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        {/* SEO / OG meta tags */}
        <HeadTags />
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

function HeadTags() {
  useEffect(() => {
    const tags: { property?: string; name?: string; content: string }[] = [
      { property: 'og:title', content: 'MakeYourPass — Marian Engineering College' },
      { property: 'og:description', content: 'Discover and register for events hosted by clubs and departments across Marian Engineering College.' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: 'https://makeyourpass.vercel.app' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'MakeYourPass — Marian Engineering College' },
      { name: 'twitter:description', content: 'Discover and register for events hosted by clubs and departments across Marian Engineering College.' },
      { name: 'description', content: 'MakeYourPass — Marian Engineering College\'s event platform. Register, organize, and attend campus events seamlessly.' },
    ]
    const els = tags.map(t => {
      const el = document.createElement('meta')
      if (t.property) el.setAttribute('property', t.property)
      if (t.name) el.setAttribute('name', t.name)
      el.setAttribute('content', t.content)
      document.head.appendChild(el)
      return el
    })
    // Set title
    const titleEl = document.querySelector('title')
    if (titleEl) titleEl.textContent = 'MakeYourPass — Marian Engineering College'
    return () => {
      els.forEach(el => document.head.removeChild(el))
    }
  }, [])
  return null
}
