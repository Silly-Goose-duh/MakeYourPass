import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search, Download, Mail, Phone, Check, X, Users, Filter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'

const dummyAttendees = [
  { id: 1, name: 'Rahul Sharma', email: 'rahul@example.com', phone: '+91 98765 43210', ticket: 'VIP Pass', checkedIn: true, event: 'Tech Conference 2026' },
  { id: 2, name: 'Priya Patel', email: 'priya@example.com', phone: '+91 87654 32109', ticket: 'General', checkedIn: true, event: 'Tech Conference 2026' },
  { id: 3, name: 'Amit Singh', email: 'amit@example.com', phone: '+91 76543 21098', ticket: 'Workshop', checkedIn: false, event: 'Design Workshop' },
  { id: 4, name: 'Sneha Reddy', email: 'sneha@example.com', phone: '+91 65432 10987', ticket: 'Student', checkedIn: true, event: 'College Fest 2026' },
  { id: 5, name: 'Vikram Joshi', email: 'vikram@example.com', phone: '+91 54321 09876', ticket: 'General', checkedIn: false, event: 'Tech Conference 2026' },
  { id: 6, name: 'Ananya Gupta', email: 'ananya@example.com', phone: '+91 43210 98765', ticket: 'VIP Pass', checkedIn: false, event: 'Tech Conference 2026' },
  { id: 7, name: 'Rohit Kumar', email: 'rohit@example.com', phone: '+91 32109 87654', ticket: 'General', checkedIn: true, event: 'Design Workshop' },
  { id: 8, name: 'Divya Nair', email: 'divya@example.com', phone: '+91 21098 76543', ticket: 'Student', checkedIn: false, event: 'College Fest 2026' },
]

export function AttendeesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const filteredAttendees = dummyAttendees.filter(a => {
    const matchesSearch = a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          a.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filter === 'all' || 
                          (filter === 'checked-in' && a.checkedIn) ||
                          (filter === 'not-checked-in' && !a.checkedIn)
    return matchesSearch && matchesFilter
  })

  const checkedInCount = dummyAttendees.filter(a => a.checkedIn).length

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Attendees</h1>
          <p className="text-text-secondary text-sm">
            {dummyAttendees.length} total · {checkedInCount} checked in ({Math.round(checkedInCount / dummyAttendees.length * 100)}%)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm">
            <Mail className="h-4 w-4" />
            Email All
          </Button>
          <Button variant="secondary" size="sm">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search attendees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-yellow-400/50"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'checked-in', 'not-checked-in'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize',
                filter === f
                  ? 'bg-yellow-400 text-black'
                  : 'bg-surface border border-border text-text-secondary hover:text-white'
              )}
            >
              {f.replace('-', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Attendees List */}
      <Card variant="glass" padding="none">
        <div className="divide-y divide-border/50">
          {filteredAttendees.map((attendee) => (
            <div key={attendee.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/5 transition-colors">
              <Avatar name={attendee.name} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{attendee.name}</p>
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {attendee.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {attendee.phone}
                  </span>
                </div>
              </div>
              <div className="hidden sm:block">
                <Badge variant="outline" size="sm">{attendee.event}</Badge>
              </div>
              <div className="hidden sm:block">
                <span className="text-text-secondary text-sm">{attendee.ticket}</span>
              </div>
              <div>
                {attendee.checkedIn ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                    <Check className="h-3 w-3" />
                    Checked In
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-text-muted rounded-full text-xs font-medium">
                    <X className="h-3 w-3" />
                    Not Checked In
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredAttendees.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-text-muted mx-auto mb-3" />
            <p className="text-text-muted">No attendees found</p>
          </div>
        )}
      </Card>
    </motion.div>
  )
}