import { useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, Users, DollarSign, Calendar, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

export function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('7d')

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl">
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
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
      </div>

      {/* Empty state */}
      <div className="text-center py-20">
        <div className="h-16 w-16 rounded-2xl bg-yellow-400/20 mx-auto mb-4 flex items-center justify-center">
          <BarChart3 className="h-8 w-8 text-yellow-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">No analytics data yet</h3>
        <p className="text-text-secondary text-sm max-w-md mx-auto">
          Analytics will show up here once you have published events with ticket sales and check-ins.
        </p>
      </div>

      {/* Placeholder for future chart — kept but shows empty */}
      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle>Sales Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center border border-dashed border-border rounded-xl">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">No sales data to show yet</p>
              <p className="text-text-muted text-xs mt-1">Data appears after your first ticket sale</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
