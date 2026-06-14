import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Search, Download, Ticket, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'


interface TicketWithEvent {
  id: string
  qr_code: string
  status: string
  attendee_name?: string
  attendee_email?: string
  checked_in_at?: string
  created_at: string
  event_title: string
}

export function TicketsPage() {
  const [tickets, setTickets] = useState<TicketWithEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  async function loadTickets() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)

    if (!orgs || orgs.length === 0) { setLoading(false); return }

    const { data: events } = await supabase
      .from('events')
      .select('id, title')
      .in('org_id', orgs.map(o => o.id))

    if (!events || events.length === 0) { setLoading(false); return }

    const { data: ticketsData } = await supabase
      .from('tickets')
      .select('*')
      .in('event_id', events.map(e => e.id))
      .order('created_at', { ascending: false })

    if (ticketsData) {
      const enriched: TicketWithEvent[] = ticketsData.map((t) => {
        const ev = events.find(e => e.id === t.event_id)
        return {
          id: t.id,
          qr_code: t.qr_code,
          status: t.status,
          attendee_name: t.attendee_name,
          attendee_email: t.attendee_email,
          checked_in_at: t.checked_in_at,
          created_at: t.created_at,
          event_title: ev?.title || 'Unknown Event',
        }
      })
      setTickets(enriched)
    }
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTickets()
  }, [])

  const filtered = tickets.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return t.attendee_name?.toLowerCase().includes(q) ||
             t.attendee_email?.toLowerCase().includes(q) ||
             t.qr_code.toLowerCase().includes(q) ||
             t.event_title.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Tickets</h1>
          <p className="text-text-secondary text-sm">
            {tickets.length > 0 ? `${tickets.length} total tickets` : 'View and manage all tickets'}
          </p>
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
            placeholder="Search by name, email, or event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/[0.04] border border-white/10 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-yellow-400/50"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'active', 'used', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all capitalize',
                filterStatus === status
                  ? 'bg-yellow-400 text-black'
                  : 'bg-white/[0.04] border border-white/10 text-text-secondary hover:text-white'
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((ticket) => (
            <Card key={ticket.id} variant="glass" padding="md" className="group">
              <CardContent>
                <div className="flex items-center gap-4">
                  <Avatar name={ticket.attendee_name || '?'} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white truncate">
                        {ticket.attendee_name || 'Anonymous'}
                      </p>
                      <Badge
                        variant={ticket.status === 'active' ? 'success' : ticket.status === 'used' ? 'info' : 'error'}
                        size="sm"
                        dot
                      >
                        {ticket.status}
                      </Badge>
                    </div>
                    <p className="text-text-secondary text-xs truncate">{ticket.attendee_email || 'No email'}</p>
                    <div className="flex items-center gap-3 mt-1 text-text-muted text-xs">
                      <span>{ticket.event_title}</span>
                      <span>•</span>
                      <span>ID: {ticket.qr_code.slice(0, 8)}...</span>
                      {ticket.checked_in_at && (
                        <>
                          <span>•</span>
                          <span className="text-green-400">
                            Checked in {new Date(ticket.checked_in_at).toLocaleTimeString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <a
                    href={`/scan/${ticket.qr_code}`}
                    target="_blank"
                    rel="noopener"
                    className="shrink-0 p-2 text-text-muted hover:text-yellow-400 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="glass" padding="lg">
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-yellow-400/20 mx-auto mb-4 flex items-center justify-center">
              <Ticket className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {tickets.length > 0 ? 'No matches' : 'No tickets sold yet'}
            </h3>
            <p className="text-text-secondary text-sm max-w-md mx-auto">
              {tickets.length > 0 ? 'Try a different search' : 'Tickets will appear here once attendees start purchasing.'}
            </p>
          </div>
        </Card>
      )}
    </motion.div>
  )
}
