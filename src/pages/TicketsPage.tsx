import { useState } from 'react'
import { motion } from 'framer-motion'
import { Ticket, Search, Download, QrCode, Filter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'

export function TicketsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Tickets</h1>
          <p className="text-text-secondary text-sm">View and manage all tickets</p>
        </div>
        <Button variant="secondary" size="sm">
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name, email, or ticket ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-yellow-400/50"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'active', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize',
                filterStatus === status
                  ? 'bg-yellow-400 text-black'
                  : 'bg-surface border border-border text-text-secondary hover:text-white'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      <Card variant="glass" padding="lg">
        <div className="text-center py-16">
          <div className="h-16 w-16 rounded-2xl bg-yellow-400/20 mx-auto mb-4 flex items-center justify-center">
            <Ticket className="h-8 w-8 text-yellow-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No tickets sold yet</h3>
          <p className="text-text-secondary text-sm max-w-md mx-auto">
            Tickets will appear here once attendees start purchasing them for your events.
          </p>
        </div>
      </Card>
    </motion.div>
  )
}
