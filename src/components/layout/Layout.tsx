import { Outlet, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'

export function Layout() {
  const location = useLocation()
  const isDashboard = location.pathname.startsWith('/dashboard')
  const isAuth = location.pathname.startsWith('/login') || location.pathname.startsWith('/signup')

  // Dashboard has its own layout
  if (isDashboard) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    )
  }

  // Auth pages have minimal layout
  if (isAuth) {
    return (
      <div className="min-h-screen bg-background">
        <Outlet />
      </div>
    )
  }

  // Public pages
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}