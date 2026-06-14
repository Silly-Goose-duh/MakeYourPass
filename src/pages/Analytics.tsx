import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Calendar, TrendingUp, Users, DollarSign, Ticket } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface AnalyticsData {
  totalEvents: number
  totalOrders: number
  totalTickets: number
  totalRevenue: number
  totalCheckedIn: number
  events: {
    id: string
    title: string
    orders: number
    tickets: number
    revenue: number
    checkedIn: number
    checkInRate: number
  }[]
}

export function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'all' | 'month' | 'week'>('all')

  async function loadAnalytics() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Get orgs
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)

    if (!orgs || orgs.length === 0) { setLoading(false); return }

    // Get events
    const { data: events } = await supabase
      .from('events')
      .select('id, title')
      .in('org_id', orgs.map(o => o.id))

    if (!events || events.length === 0) { setLoading(false); return }

    const eventIds = events.map(e => e.id)

    // Get orders
    const { data: orders } = await supabase
      .from('orders')
      .select('*')
      .in('event_id', eventIds)

    // Get tickets
    const { data: tickets } = await supabase
      .from('tickets')
      .select('*')
      .in('event_id', eventIds)

    const allOrders = orders || []
    const allTickets = tickets || []
    
    const totalRevenue = allOrders
      .filter(o => o.status === 'confirmed')
      .reduce((sum, o) => sum + o.total_amount, 0)

    const totalCheckedIn = allTickets.filter(t => t.status === 'used').length

    const eventAnalytics = events.map(ev => {
      const evOrders = allOrders.filter(o => o.event_id === ev.id)
      const evTickets = allTickets.filter(t => t.event_id === ev.id)
      const evRevenue = evOrders
        .filter(o => o.status === 'confirmed')
        .reduce((sum, o) => sum + o.total_amount, 0)
      const evCheckedIn = evTickets.filter(t => t.status === 'used').length
      return {
        id: ev.id,
        title: ev.title,
        orders: evOrders.length,
        tickets: evTickets.length,
        revenue: evRevenue,
        checkedIn: evCheckedIn,
        checkInRate: evTickets.length > 0 ? Math.round((evCheckedIn / evTickets.length) * 100) : 0,
      }
    })

    setData({
      totalEvents: events.length,
      totalOrders: allOrders.length,
      totalTickets: allTickets.length,
      totalRevenue,
      totalCheckedIn,
      events: eventAnalytics,
    })
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const statCards = [
    { label: 'Total Events', value: String(data?.totalEvents || 0), icon: Calendar, glow: 'primary' as const },
    { label: 'Orders', value: String(data?.totalOrders || 0), icon: Ticket, glow: 'accent' as const },
    { label: 'Tickets Sold', value: String(data?.totalTickets || 0), icon: TrendingUp, glow: 'primary' as const },
    { label: 'Revenue', value: data?.totalRevenue ? `₹${data.totalRevenue.toLocaleString('en-IN')}` : '₹0', icon: DollarSign, glow: 'primary' as const },
    { label: 'Checked In', value: String(data?.totalCheckedIn || 0), icon: Users, glow: 'accent' as const },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-7xl px-6 sm:px-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Analytics</h1>
          <p className="text-text-secondary text-sm">Track your event performance</p>
        </div>
        <div className="flex gap-2">
          {(['all', 'month', 'week'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-all',
                period === p ? 'bg-primary text-white' : 'bg-white/5 text-text-secondary hover:text-white'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.label} variant="glass" padding="md" glow={stat.glow}>
            <CardContent>
              <p className="text-xl sm:text-2xl font-bold text-white mb-0.5">{stat.value}</p>
              <p className="text-xs text-text-muted">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-event breakdown */}
      {data && data.events.length > 0 ? (
        <Card variant="glass" padding="lg">
          <CardContent>
            <h2 className="text-lg font-semibold text-white mb-4">Per-Event Breakdown</h2>
            <div className="space-y-3">
              {data.events.map(ev => (
                <div key={ev.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-white font-medium truncate">{ev.title}</p>
                    <Badge variant={ev.checkInRate > 50 ? 'success' : 'warning'} size="sm">
                      {ev.checkInRate}% checked in
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div>
                      <p className="text-text-muted">Orders</p>
                      <p className="text-white font-semibold">{ev.orders}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Tickets</p>
                      <p className="text-white font-semibold">{ev.tickets}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Checked In</p>
                      <p className="text-green-400 font-semibold">{ev.checkedIn}</p>
                    </div>
                    <div>
                      <p className="text-text-muted">Revenue</p>
                      <p className="text-primary font-semibold">₹{ev.revenue.toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  {/* Progress bar for check-in rate */}
                  <div className="mt-2 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-green-400 rounded-full transition-all"
                      style={{ width: `${ev.checkInRate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card variant="glass" padding="lg">
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-primary-muted mx-auto mb-4 flex items-center justify-center">
              <BarChart3 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No data yet</h3>
            <p className="text-text-secondary text-sm max-w-md mx-auto">
              Analytics will appear once you have events with registrations.
            </p>
          </div>
        </Card>
      )}
    </motion.div>
  )
}
