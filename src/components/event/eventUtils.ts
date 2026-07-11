import type { CampusEvent, Organization } from '@/types'

export type EventWithOrg = CampusEvent & {
  organizations: Pick<Organization, 'name' | 'slug' | 'logo_url'>
}

const ZINE_COLORS = ['#FF4D2E', '#2D5BFF', '#14B87A', '#E84AC4', '#FFD23F']
export function zineColorFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return ZINE_COLORS[h % ZINE_COLORS.length]
}

export function getDaysAway(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const eventDate = new Date(dateStr); eventDate.setHours(0, 0, 0, 0)
  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / 86400000)
  if (diffDays < 0) return 'Past'
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  return `${diffDays} days`
}

export function isSoldOut(e: EventWithOrg): boolean {
  return (e.capacity ?? 0) > 0 && (e.response_count ?? 0) >= e.capacity
}

export function isPast(e: EventWithOrg): boolean {
  if (!e.date) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(e.date + 'T00:00:00') < today
}
