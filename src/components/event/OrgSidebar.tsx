import { motion } from 'framer-motion'
import { Building2, PanelLeftClose, PanelLeft, Sparkles, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Organization } from '@/types'
import { cn } from '@/lib/utils'

const ZINE_COLORS = ['#FF4D2E', '#2D5BFF', '#14B87A', '#E84AC4', '#FFD23F']
function zineColorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return ZINE_COLORS[h % ZINE_COLORS.length]
}

interface OrgSidebarProps {
  organizations: Organization[]
  selectedOrgId: string | null
  onSelectOrg: (id: string | null) => void
  eventCounts: Record<string, number>
  totalEvents: number
  sidebarOpen: boolean
  onToggleSidebar: (open: boolean) => void
}

export function OrgSidebar({
  organizations,
  selectedOrgId,
  onSelectOrg,
  eventCounts,
  totalEvents,
  sidebarOpen,
  onToggleSidebar,
}: OrgSidebarProps) {
  return (
    <motion.aside
      animate={{ width: sidebarOpen ? 300 : 0, opacity: sidebarOpen ? 1 : 0, marginRight: sidebarOpen ? 0 : -12 }}
      transition={{ duration: 0.35, ease: 'easeInOut' }}
      className={cn('hidden lg:block overflow-hidden flex-shrink-0', !sidebarOpen && 'pointer-events-none')}
    >
      <div className="sticky top-24 w-[300px]">
        <div className="zine-border" style={{ background: '#fff', boxShadow: '5px 5px 0 #14110E' }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '2.5px solid #14110E', background: '#2D5BFF' }}>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-white" strokeWidth={2.5} />
              <span className="text-sm font-extrabold uppercase tracking-wide text-white" style={{ fontFamily: 'Syne, sans-serif' }}>Organizations</span>
            </div>
            <button onClick={() => onToggleSidebar(false)} className="p-1 text-white" title="Collapse sidebar">
              <PanelLeftClose className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {/* Register CTA */}
          <div className="px-3 pt-3 pb-2">
            <Link to="/signup" className="group flex items-center gap-3 px-3 py-3" style={{ background: '#FFD23F', border: '2.5px solid #14110E', boxShadow: '3px 3px 0 #14110E' }}>
              <div className="flex h-9 w-9 items-center justify-center text-white" style={{ background: '#FF4D2E', border: '2px solid #14110E' }}>
                <Building2 className="h-4 w-4" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold" style={{ color: '#14110E', fontFamily: 'Syne, sans-serif' }}>Register Your Club</p>
                <p className="text-[11px] font-semibold truncate" style={{ color: '#4A4640' }}>Get on MakeYourPass</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" strokeWidth={2.5} style={{ color: '#14110E' }} />
            </Link>
          </div>

          {/* Org list */}
          <div className="space-y-1.5 overflow-y-auto px-3 pb-3" style={{ maxHeight: 'calc(100vh - 22rem)' }}>
            <motion.button
              variants={sidebarItemVariants} initial="hidden" animate="visible" custom={0}
              whileTap={{ scale: 0.97 }}
              onClick={() => onSelectOrg(null)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"
              style={{
                border: '2px solid #14110E',
                background: selectedOrgId === null ? '#FF4D2E' : '#fff',
                color: selectedOrgId === null ? '#fff' : '#14110E',
                boxShadow: selectedOrgId === null ? '3px 3px 0 #14110E' : 'none',
                fontFamily: 'Syne, sans-serif', fontWeight: 800,
              }}
            >
              <Sparkles className="h-4 w-4" strokeWidth={2.5} />
              <span className="flex-1">All Organizations</span>
              {totalEvents > 0 && (
                <span className="px-2 text-xs" style={{ border: '2px solid currentColor', fontWeight: 800 }}>{totalEvents}</span>
              )}
            </motion.button>

            {organizations.map((org, i) => {
              const count = eventCounts[org.id] ?? 0
              const active = selectedOrgId === org.id
              const c = zineColorFor(org.name)
              return (
                <motion.button
                  key={org.id}
                  variants={sidebarItemVariants} initial="hidden" animate="visible" custom={i + 1}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onSelectOrg(org.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"
                  style={{
                    border: '2px solid #14110E',
                    background: active ? c : '#fff',
                    color: active ? '#fff' : '#14110E',
                    boxShadow: active ? '3px 3px 0 #14110E' : 'none',
                    fontFamily: 'Syne, sans-serif', fontWeight: 700,
                  }}
                >
                  <span className="flex h-6 w-6 items-center justify-center text-[11px] font-extrabold" style={{ background: active ? '#fff' : c, color: active ? c : '#fff', border: '2px solid #14110E' }}>
                    {org.logo_url ? <img src={org.logo_url} alt="" className="h-full w-full object-cover" /> : org.name.charAt(0)}
                  </span>
                  <span className="flex-1 truncate">{org.name}</span>
                  {count > 0 && <span className="px-2 text-xs" style={{ border: '2px solid currentColor', fontWeight: 800 }}>{count}</span>}
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>
    </motion.aside>
  )
}

const sidebarItemVariants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: 'easeOut' as const },
  }),
}

export function SidebarReopen({ open, onOpen }: { open: boolean; onOpen: () => void }) {
  return (
    <motion.div
      animate={{ opacity: open ? 0 : 1, width: open ? 0 : 'auto' }}
      transition={{ duration: 0.3 }}
      className={cn('hidden lg:flex items-start pt-1 flex-shrink-0 overflow-hidden', open && 'pointer-events-none')}
    >
      <button onClick={onOpen} className="p-2.5" style={{ border: '2.5px solid #14110E', background: '#fff', boxShadow: '3px 3px 0 #14110E', color: '#14110E' }} title="Expand sidebar">
        <PanelLeft className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </motion.div>
  )
}
