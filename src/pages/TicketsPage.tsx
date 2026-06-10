import { useState } from 'react'
import { motion } from 'framer-motion'
import { Ticket, Search, Download, QrCode, Check, X, Filter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { cn, formatDateTime } from '@/lib/utils'

const dummyTickets = [
  { id: 'TKT-001', event: 'Tech Conference 2026', attendee: 'Rahul Sharma', email: 'rahul@example.com', status: 'active', checkedIn: false, type: 'VIP Pass', price: 999 },
  { id: 'TKT-002', event: 'Tech Conference 2026', attendee: 'Priya Patel', email: 'priya@example.com', status: 'active', checkedIn: true, type: 'General', price: 0 },
  { id: 'TKT-003', event: 'Design Workshop', attendee: 'Amit Singh', email: 'amit@example.com', status: 'active', checkedIn: false, type: 'Workshop', price: 299 },
  { id: 'TKT-004', event: 'College Fest 2026', attendee: 'Sneha Reddy', email: 'sneha@example.com', status: 'cancelled', checkedIn: false, type: 'Student', price: 0 },
  { id: 'TKT-005', event: 'Tech Conference 2026', attendee: 'Vikram Joshi', email: 'vikram@example.com', status: 'active', checkedIn: false, type: 'General', price: 0 },
]

export function TicketsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filteredTickets = dummyTickets.filter(ticket => {
    const matchesSearch = ticket.attendee.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ticket.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ticket.id.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterStatus === 'all' || ticket.status === filterStatus
    return matchesSearch && matchesFilter
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Tickets</h1>
          <p className="text-text-secondary text-sm">View and manage all tickets</p>
        </div>
        <Button variant="secondary" size="sm">
          <Download className="h-4 w-4" />
          Export CSV
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

      {/* Tickets Table */}
      <Card variant="glass" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-6 text-text-muted font-medium">Ticket ID</th>
                <th className="text-left py-4 px-6 text-text-muted font-medium">Event</th>
                <th className="text-left py-4 px-6 text-text-muted font-medium">Attendee</th>
                <th className="text-left py-4 px-6 text-text-muted font-medium">Type</th>
                <th className="text-right py-4 px-6 text-text-muted font-medium">Price</th>
                <th className="text-center py-4 px-6 text-text-muted font-medium">Status</th>
                <th className="text-center py-4 px-6 text-text-muted font-medium">Check-in</th>
                <th className="text-right py-4 px-6 text-text-muted font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((ticket) => (
                <tr key={ticket.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-6">
                    <span className="font-mono text-xs text-yellow-400">{ticket.id}</span>
                  </td>
                  <td className="py-4 px-6 text-white font-medium">{ticket.event}</td>
                  <td className="py-4 px-6">
                    <div>
                      <p className="text-white">{ticket.attendee}</p>
                      <p className="text-text-muted text-xs">{ticket.email}</p>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-text-secondary">{ticket.type}</td>
                  <td className="py-4 px-6 text-right">
                    <span className={ticket.price === 0 ? 'text-green-400' : 'text-white'}>
                      {ticket.price === 0 ? 'Free' : `₹${ticket.price}`}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-center">
                    <Badge
                      variant={ticket.status === 'active' ? 'success' : 'error'}
                      size="sm"
                      dot
                    >
                      {ticket.status}
                    </Badge>
                  </td>
                  <td className="py-4 px-6 text-center">
                    {ticket.checkedIn ? (
                      <span className="inline-flex items-center gap-1 text-green-400 text-xs">
                        <Check className="h-3 w-3" />
                        Checked in
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-text-muted text-xs">
                        <X className="h-3 w-3" />
                        Not checked in
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 text-text-muted hover:text-yellow-400 transition-colors" title="View QR Code">
                        <QrCode className="h-4 w-4" />
                      </button>
                      <button className="p-1.5 text-text-muted hover:text-yellow-400 transition-colors" title="Download Ticket">
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredTickets.length === 0 && (
          <div className="text-center py-12">
            <Ticket className="h-12 w-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No tickets found</p>
          </div>
        )}
      </Card>
    </motion.div>
  )
}