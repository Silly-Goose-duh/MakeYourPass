import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  User, Bell, CreditCard, Key, Globe, Shield,
  Save
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

interface SettingSection {
  id: string
  title: string
  icon: typeof User
  content: React.ReactNode
}

export function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile')

  const sections: SettingSection[] = [
    {
      id: 'profile',
      title: 'Profile',
      icon: User,
      content: (
        <div className="space-y-5">
          <Input label="Full Name" placeholder="John Doe" defaultValue="" />
          <Input label="Email" type="email" placeholder="john@example.com" defaultValue="" hint="Verified email" />
          <Input label="Phone" type="tel" placeholder="+91 98765 43210" defaultValue="" />
          <Button variant="primary">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      ),
    },
    {
      id: 'organization',
      title: 'Organization',
      icon: Globe,
      content: (
        <div className="space-y-5">
          <Input label="Organization Name" placeholder="My Organization" defaultValue="" />
          <Input label="Website" type="url" placeholder="https://example.com" defaultValue="" />
          <Input label="Description" placeholder="Tell us about your organization..." defaultValue="" />
          <div className="p-4 bg-primary-muted border border-primary/20 rounded-xl text-sm text-primary">
            Your organization details appear on public event pages.
          </div>
          <Button variant="primary">
            <Save className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      ),
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      content: (
        <div className="space-y-5">
          {['Email ticket confirmations', 'Email check-in alerts', 'WhatsApp reminders', 'Weekly summary reports'].map((item) => (
            <label key={item} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" defaultChecked className="w-4 h-4 accent-primary" />
              <span className="text-white text-sm">{item}</span>
            </label>
          ))}
          <div className="pt-4">
            <p className="text-text-muted text-sm mb-2">Notification templates</p>
            <p className="text-text-secondary text-xs">
              Customize email and WhatsApp templates in the <span className="text-primary cursor-pointer">Templates</span> section.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'payments',
      title: 'Payments',
      icon: CreditCard,
      content: (
        <div className="space-y-5">
          <div className="p-4 bg-primary-muted border border-primary/20 rounded-xl">
            <div className="flex items-center gap-3 mb-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="font-medium text-text-primary">Razorpay</span>
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">Connected</span>
            </div>
            <p className="text-text-muted text-sm">
              Process payments via Razorpay. UPI, cards, and net banking supported.
            </p>
          </div>
          <div className="p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-text-muted" />
                <span className="font-medium text-white">Slice</span>
                <span className="px-2 py-0.5 bg-primary-muted text-primary text-xs rounded-full">Coming Soon</span>
              </div>
            </div>
            <p className="text-text-muted text-sm">
              Slice Pay integration is in development.
            </p>
          </div>
          <Button variant="secondary">
            Configure API Keys
          </Button>
        </div>
      ),
    },
    {
      id: 'api',
      title: 'API Keys',
      icon: Key,
      content: (
        <div className="space-y-5">
          <Input label="Razorpay Key ID" type="password" placeholder="rzp_live_..." />
          <Input label="Razorpay Secret" type="password" placeholder="Enter secret key" />
          <Input label="Supabase URL" value={import.meta.env.VITE_SUPABASE_URL || ''} disabled hint="Set in .env.local" />
          <div className="p-4 bg-primary-muted border border-primary/20 rounded-xl text-sm text-primary">
            API keys are stored securely. Never share your secret keys.
          </div>
          <Button variant="primary">
            <Save className="h-4 w-4" />
            Save Keys
          </Button>
        </div>
      ),
    },
    {
      id: 'security',
      title: 'Security',
      icon: Shield,
      content: (
        <div className="space-y-5">
          <Input label="Current Password" type="password" />
          <Input label="New Password" type="password" />
          <Input label="Confirm New Password" type="password" />
          <div className="flex items-center gap-3">
            <input type="checkbox" className="w-4 h-4 accent-primary" />
            <span className="text-sm text-text-secondary">Enable two-factor authentication</span>
          </div>
          <Button variant="primary">
            Update Password
          </Button>
        </div>
      ),
    },
  ]

  const currentSection = sections.find(s => s.id === activeSection)!

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-6xl px-6 sm:px-10"
    >
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Settings</h1>
        <p className="text-text-secondary text-sm">Manage your account and preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar */}
        <div className="lg:w-64 flex-shrink-0">
          <nav className="space-y-1">
            {sections.map((section) => {
              const isActive = activeSection === section.id
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left',
                    isActive
                      ? 'bg-primary-muted text-primary border border-primary/30'
                      : 'text-text-secondary hover:text-white hover:bg-white/5 border border-transparent'
                  )}
                >
                  <section.icon className="h-5 w-5" />
                  {section.title}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1">
          <Card variant="glass" padding="lg">
            <CardHeader>
              <CardTitle>{currentSection.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {currentSection.content}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  )
}