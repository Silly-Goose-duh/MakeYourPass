import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Users, BarChart3, Download, Share2, ExternalLink, CheckCircle, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import { getEventById, getEventQuestions, getEventResponses, getResponseAnswers, getEventAnalytics } from '@/lib/supabase'
import type { CampusEvent, EventQuestion, EventResponse, ResponseAnswer } from '@/types'

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-4 rounded-full bg-surface-elevated animate-pulse', className)} />
  )
}

function SkeletonCard() {
  return (
    <Card>
      <div className="space-y-3">
        <SkeletonBar className="h-6 w-24" />
        <SkeletonBar className="h-8 w-32" />
      </div>
    </Card>
  )
}

export function EventAnalytics() {
  const { id } = useParams<{ id: string }>()

  const [event, setEvent] = useState<CampusEvent | null>(null)
  const [questions, setQuestions] = useState<EventQuestion[]>([])
  const [responses, setResponses] = useState<EventResponse[]>([])
  const [answers, setAnswers] = useState<ResponseAnswer[]>([])
  const [loading, setLoading] = useState(true)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null)
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const eid = id
    if (!eid) return
    async function load() {
      setLoading(true)
      setError('')

      const [eventRes, questionsRes, responsesRes, analyticsRes] = await Promise.all([
        getEventById(eid!),
        getEventQuestions(eid!),
        getEventResponses(eid!),
        getEventAnalytics(eid!),
      ])

      if (eventRes.error || !eventRes.data) {
        const msg = eventRes.error?.message || 'Failed to load event'
        if (msg.includes('RLS_RECURSION')) {
          setError('Analytics are unavailable while the database is being configured. Please apply the SQL fix in the Supabase dashboard SQL editor.')
        } else {
          setError(msg)
        }
        setLoading(false)
        return
      }

      setEvent(eventRes.data as CampusEvent)
      if (questionsRes.data) setQuestions(questionsRes.data as EventQuestion[])
      if (responsesRes.data) {
        setResponses(responsesRes.data as EventResponse[])
        const ids = (responsesRes.data as EventResponse[]).map(r => r.id)
        if (ids.length > 0) {
          const answersRes = await getResponseAnswers(ids)
          if (answersRes.data) setAnswers(answersRes.data as ResponseAnswer[])
        }
      }
      if (analyticsRes.data) setAnalytics(analyticsRes.data as Record<string, number>)

      setLoading(false)
    }
    load()
  }, [id])

  function getAnswersForResponse(responseId: string): ResponseAnswer[] {
    return answers.filter(a => a.response_id === responseId)
  }

  function getAnswersForQuestion(questionId: string): ResponseAnswer[] {
    return answers.filter(a => a.question_id === questionId)
  }

  function getQuestionResponseCount(questionId: string): number {
    return new Set(getAnswersForQuestion(questionId).map(a => a.response_id)).size
  }

  function getTextAnswers(questionId: string): string[] {
    return getAnswersForQuestion(questionId).map(a => a.value).filter(Boolean)
  }

  function getMultipleChoiceCounts(questionId: string, options: string[]): { option: string; count: number; pct: number }[] {
    const optionAnswers = getAnswersForQuestion(questionId).map(a => a.value)
    const total = optionAnswers.length || 1
    return options.map(option => {
      const count = optionAnswers.filter(v => v === option).length
      return { option, count, pct: Math.round((count / total) * 100) }
    })
  }

  function getLinearScaleDistribution(questionId: string): { value: number; count: number }[] {
    const values = getAnswersForQuestion(questionId).map(a => parseInt(a.value)).filter(v => !isNaN(v))
    const dist: Record<number, number> = {}
    values.forEach(v => { dist[v] = (dist[v] || 0) + 1 })
    const max = Math.max(...Object.keys(dist).map(Number), 5)
    const result: { value: number; count: number }[] = []
    for (let i = 1; i <= Math.max(max, 5); i++) {
      result.push({ value: i, count: dist[i] || 0 })
    }
    return result
  }

  function exportCsv() {
    if (!event || responses.length === 0) return

    const headers = ['Name', 'Email', 'Phone', 'Submitted At', ...questions.map(q => q.title)]
    const rows = responses.map(r => {
      const responseAnswers = getAnswersForResponse(r.id)
      const row = [
        `"${r.respondent_name}"`,
        `"${r.respondent_email}"`,
        `"${r.respondent_phone}"`,
        `"${new Date(r.submitted_at).toLocaleString()}"`,
        ...questions.map(q => {
          const a = responseAnswers.find(ans => ans.question_id === q.id)
          return a ? `"${a.value}"` : '""'
        }),
      ]
      return row.join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event.title.replace(/\s+/g, '-')}-responses.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyFormLink() {
    if (!event) return
    const link = `${window.location.origin}/event/${event.slug}`
    navigator.clipboard.writeText(link)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="px-4 sm:px-6 pt-24 pb-16">
          <div className="flex items-center gap-3 mb-8">
            <SkeletonBar className="h-5 w-32" />
          </div>
          <div className="mb-8">
            <SkeletonBar className="h-8 w-72 mb-2" />
            <SkeletonBar className="h-4 w-48" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
          </div>
          <Card>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <SkeletonBar className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <SkeletonBar className="h-4 w-48" />
                    <SkeletonBar className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-error/10 mx-auto mb-4 flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-error" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Event not found</h1>
          <p className="text-text-secondary text-sm mb-6">{error || 'This event does not exist'}</p>
          <Link to="/dashboard">
            <Button variant="primary">Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  const totalResponses = responses.length
  const uniqueRespondents = new Set(responses.map(r => r.respondent_email)).size
  const submissionDates = responses.map(r => new Date(r.submitted_at).toLocaleDateString())
  const dateCounts: Record<string, number> = {}
  submissionDates.forEach(d => { dateCounts[d] = (dateCounts[d] || 0) + 1 })
  const sortedDates = Object.entries(dateCounts).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
  const trend = sortedDates.length >= 2
    ? sortedDates[sortedDates.length - 1][1] - sortedDates[sortedDates.length - 2][1]
    : 0

  const statusConfig = {
    draft: { label: 'Draft', className: 'bg-warning/10 text-warning border-warning/20' },
    published: { label: 'Published', className: 'bg-success/10 text-success border-success/20' },
    cancelled: { label: 'Cancelled', className: 'bg-error/10 text-error border-error/20' },
  }

  const statusStyle = statusConfig[event.status] || statusConfig.draft

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 bg-surface/80 backdrop-blur-md border-b border-border">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-text-secondary hover:text-primary transition-colors text-sm font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center">
            <BarChart3 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold">
            <span className="text-text-primary">MakeYour</span>
            <span className="text-primary">Pass</span>
          </span>
        </div>
      </div>

      <div className="px-4 sm:px-6 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">{event.title}</h1>
                <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium border', statusStyle.className)}>
                  {statusStyle.label}
                </span>
              </div>
              <p className="text-text-secondary text-sm">Analytics and response data</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={copyFormLink}>
                <Share2 className="h-4 w-4" />
                Copy Form Link
              </Button>
              <a href={event.slug ? `/event/${event.slug}` : '#'} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-4 w-4" />
                  View Live
                </Button>
              </a>
              {responses.length > 0 && (
                <Button variant="primary" size="sm" onClick={exportCsv}>
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              )}
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{totalResponses}</p>
                    <p className="text-xs text-text-muted">Total Responses</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-accent-rose/10 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-accent-rose" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{uniqueRespondents}</p>
                    <p className="text-xs text-text-muted">Unique Respondents</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">
                      {trend > 0 ? '+' : ''}{trend}
                    </p>
                    <p className="text-xs text-text-muted">Submission Trend</p>
                  </div>
                </div>
              </Card>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-text-primary">{questions.length}</p>
                    <p className="text-xs text-text-muted">Form Questions</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Question Breakdown */}
          {questions.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <Card>
                <div className="flex items-center gap-2 mb-6">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">Question Breakdown</h2>
                </div>
                <div className="space-y-8">
                  {questions.map((q, i) => {
                    const responseCount = getQuestionResponseCount(q.id)
                    return (
                      <div key={q.id} className="pb-6 border-b border-border last:border-b-0 last:pb-0">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-primary w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                {i + 1}
                              </span>
                              <h3 className="text-sm font-semibold text-text-primary">{q.title}</h3>
                            </div>
                            <p className="text-xs text-text-muted mt-1 ml-7 capitalize">
                              {q.question_type.replace(/_/g, ' ')} &middot; {responseCount} {responseCount === 1 ? 'response' : 'responses'}
                            </p>
                          </div>
                        </div>

                        {/* Text answers */}
                        {(q.question_type === 'short_text' || q.question_type === 'paragraph') && (
                          <div className="ml-7 space-y-1.5">
                            {getTextAnswers(q.id).length > 0 ? (
                              getTextAnswers(q.id).map((val, vi) => (
                                <div key={vi} className="p-2.5 rounded-lg bg-surface-elevated border border-border text-sm text-text-primary">
                                  {val}
                                </div>
                              ))
                            ) : (
                              <p className="text-sm text-text-muted italic">No responses yet</p>
                            )}
                          </div>
                        )}

                        {/* Multiple choice, checkboxes, dropdown */}
                        {(q.question_type === 'multiple_choice' || q.question_type === 'checkboxes' || q.question_type === 'dropdown') && (
                          <div className="ml-7 space-y-2">
                            {getMultipleChoiceCounts(q.id, q.options).map((item, oi) => (
                              <div key={oi}>
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className="text-text-primary">{item.option}</span>
                                  <span className="text-text-muted text-xs">{item.count} ({item.pct}%)</span>
                                </div>
                                <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${item.pct}%` }}
                                    transition={{ duration: 0.6, delay: oi * 0.08 }}
                                    className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Linear scale */}
                        {q.question_type === 'linear_scale' && (
                          <div className="ml-7">
                            <div className="flex items-end gap-2 h-32">
                              {getLinearScaleDistribution(q.id).map((item) => {
                                const maxCount = Math.max(...getLinearScaleDistribution(q.id).map(d => d.count), 1)
                                const heightPct = (item.count / maxCount) * 100
                                return (
                                  <div key={item.value} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-xs text-text-muted">{item.count}</span>
                                    <motion.div
                                      initial={{ height: 0 }}
                                      animate={{ height: `${heightPct}%` }}
                                      transition={{ duration: 0.5, delay: item.value * 0.05 }}
                                      className="w-full rounded-t-md bg-gradient-to-t from-primary to-violet-500"
                                      style={{ minHeight: item.count > 0 ? '4px' : '0px' }}
                                    />
                                    <span className="text-xs text-text-muted">{item.value}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Card>
            </motion.div>
          )}

          {/* Response List */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">Responses</h2>
                  <span className="text-xs text-text-muted bg-surface-elevated px-2 py-0.5 rounded-full">
                    {totalResponses} total
                  </span>
                </div>
                {responses.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={exportCsv}>
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                )}
              </div>

              {responses.length > 0 ? (
                <div className="space-y-2">
                  {responses.map(r => {
                    const isExpanded = expandedResponse === r.id
                    const responseAnswers = getAnswersForResponse(r.id)
                    return (
                      <div key={r.id} className="border border-border rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedResponse(isExpanded ? null : r.id)}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-elevated/50 transition-colors"
                        >
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {r.respondent_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate">{r.respondent_name}</p>
                            <p className="text-xs text-text-muted truncate">{r.respondent_email}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-text-muted">
                              {new Date(r.submitted_at).toLocaleDateString()}
                            </p>
                            <p className="text-[10px] text-text-muted">
                              {new Date(r.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-text-muted" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-text-muted" />
                          )}
                        </button>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            transition={{ duration: 0.2 }}
                            className="border-t border-border px-4 py-3 bg-surface-elevated/30 space-y-2"
                          >
                            {questions.length > 0 ? (
                              questions.map(q => {
                                const a = responseAnswers.find(ans => ans.question_id === q.id)
                                return (
                                  <div key={q.id}>
                                    <p className="text-xs text-text-muted mb-0.5">{q.title}</p>
                                    <p className="text-sm text-text-primary">{a?.value || <span className="italic text-text-muted">No answer</span>}</p>
                                  </div>
                                )
                              })
                            ) : (
                              <p className="text-sm text-text-muted italic">No questions configured</p>
                            )}
                          </motion.div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="h-16 w-16 rounded-2xl bg-surface-elevated mx-auto mb-4 flex items-center justify-center">
                    <Users className="h-8 w-8 text-text-muted" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">No responses yet</h3>
                  <p className="text-text-muted text-sm max-w-md mx-auto">
                    Responses will appear here once attendees start submitting the form.
                  </p>
                </div>
              )}
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
