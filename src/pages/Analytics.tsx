import { useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Users, DollarSign, Calendar, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

const analyticsData = {
  overview: [
    { label: 'Total Revenue', value: '₹12,45,000', change: '+23%', icon: DollarSign, up: true },
    { label: 'Tickets Sold', value: '1,234', change: '+18%', icon: TrendingUp, up: true },
    { label: 'Check-ins', value: '892', change: '72% rate', icon: Users, up: true },
    { label: 'Active Events', value: '3', change: '+1', icon: Calendar, up: true },
  ],
  recentSales: [
    { name: 'Tech Conf 2026', tickets: 45, revenue: 22500, checkIns: 38 },
    { name: 'Design Workshop', tickets: 12, revenue: 3600, checkIns: 10 },
    { name: 'College Fest', tickets: 230, revenue: 0, checkIns: 180 },
  ],
}

export function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('7d')

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Analytics</h1>
          <p className="text-text-secondary text-sm">Track your event performance</p>
        </div>
        <div className="flex items-center gap-2">
          {['7d', '30d', '90d', 'All'].map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                selectedPeriod === period
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white/5 text-text-secondary hover:text-white'
              )}
            >
              {period}
            </button>
          ))}
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {analyticsData.overview.map((item) => (
          <Card key={item.label} variant="glass" padding="md">
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 rounded-xl bg-yellow-400/20">
                  <item.icon className="h-5 w-5 text-yellow-400" />
                </div>
                <Badge variant={item.up ? 'success' : 'error'} size="sm">
                  {item.change}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-white mb-1">{item.value}</p>
              <p className="text-text-muted text-sm">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart placeholder */}
      <Card variant="glass" padding="lg" className="mb-8">
        <CardHeader>
          <CardTitle>Sales Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">Chart visualization coming soon</p>
              <p className="text-text-muted text-xs mt-1">Connect to Supabase for real data</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Event Performance Table */}
      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle>Event Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 text-text-muted font-medium">Event</th>
                  <th className="text-right py-3 text-text-muted font-medium">Tickets Sold</th>
                  <th className="text-right py-3 text-text-muted font-medium">Revenue</th>
                  <th className="text-right py-3 text-text-muted font-medium">Check-ins</th>
                  <th className="text-right py-3 text-text-muted font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {analyticsData.recentSales.map((sale, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                    <td className="py-4 text-white font-medium">{sale.name}</td>
                    <td className="py-4 text-right text-white">{sale.tickets}</td>
                    <td className="py-4 text-right text-white">₹{sale.revenue.toLocaleString()}</td>
                    <td className="py-4 text-right text-white">{sale.checkIns}</td>
                    <td className="py-4 text-right">
                      <span className="text-green-400">{Math.round((sale.checkIns / sale.tickets) * 100)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}