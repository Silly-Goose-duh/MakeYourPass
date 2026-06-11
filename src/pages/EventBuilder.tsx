import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Sparkles, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { DatePicker } from '@/components/ui/DatePicker'
import { cn } from '@/lib/utils'

interface StepProps {
  title: string
  subtitle: string
}

const steps: StepProps[] = [
  { title: 'Event Details', subtitle: 'Basic information about your event' },
  { title: 'Date & Venue', subtitle: 'When and where is your event?' },
  { title: 'Tickets', subtitle: 'Set up ticket types and pricing' },
  { title: 'Branding', subtitle: 'Customize your event page' },
  { title: 'Review & Publish', subtitle: 'Final checks before going live' },
]

const eventCategories = [
  'Conference', 'Workshop', 'Meetup', 'Festival',
  'Concert', 'Sports', 'Networking', 'College Fest',
  'Webinar', 'Other'
]

export function EventBuilderPage() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [eventData, setEventData] = useState({
    title: '',
    description: '',
    shortDescription: '',
    category: '',
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    venueName: '',
    venueAddress: '',
    city: '',
    state: '',
    maxAttendees: '',
    ticketing: {
      isFree: true,
      price: '',
      quantity: '',
    },
  })

  const handleNext = () => {
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1)
  }

  const handlePublish = () => {
    // In production this saves to Supabase
    alert('Event created successfully!')
    navigate('/dashboard/events')
  }

  const updateField = (field: string, value: string) => {
    setEventData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/dashboard/events')}
          className="inline-flex items-center gap-2 text-text-secondary hover:text-yellow-400 transition-colors mb-4 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to events
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Create New Event</h1>
      </div>

      {/* Steps progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.title} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all border-2',
                  index < currentStep && 'bg-yellow-400 border-yellow-400 text-black',
                  index === currentStep && 'bg-yellow-400/20 border-yellow-400 text-yellow-400',
                  index > currentStep && 'bg-surface border-border text-text-muted'
                )}>
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={cn(
                  'text-xs mt-2 hidden sm:block',
                  index <= currentStep ? 'text-yellow-400 font-medium' : 'text-text-muted'
                )}>
                  {step.title}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className={cn(
                  'flex-1 h-0.5 mx-2 mb-6',
                  index < currentStep ? 'bg-yellow-400' : 'bg-border'
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card variant="glass" padding="lg">
        <CardHeader>
          <CardTitle>{steps[currentStep].title}</CardTitle>
          <p className="text-text-secondary text-sm mt-1">{steps[currentStep].subtitle}</p>
        </CardHeader>

        <CardContent>
          {/* Step 1: Event Details */}
          {currentStep === 0 && (
            <div className="space-y-5">
              <Input
                label="Event Title"
                placeholder="e.g., Tech Conference 2026"
                value={eventData.title}
                onChange={(e) => updateField('title', e.target.value)}
                required
              />
              <Textarea
                label="Description"
                placeholder="Describe what your event is about..."
                value={eventData.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={4}
              />
              <Input
                label="Short Description"
                placeholder="A brief tagline for your event"
                value={eventData.shortDescription}
                onChange={(e) => updateField('shortDescription', e.target.value)}
                hint="Shown on cards and social sharing"
              />
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {eventCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => updateField('category', cat.toLowerCase())}
                      className={cn(
                        'px-4 py-2 rounded-full text-sm font-medium transition-all border',
                        eventData.category === cat.toLowerCase()
                          ? 'bg-yellow-400/20 border-yellow-400/50 text-yellow-400'
                          : 'bg-surface border-border text-text-secondary hover:text-white hover:border-white/30'
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Date & Venue */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <DatePicker
                  label="Start Date"
                  value={eventData.startDate}
                  onChange={(v) => updateField('startDate', v)}
                  required
                />
                <DatePicker
                  label="End Date"
                  value={eventData.endDate}
                  onChange={(v) => updateField('endDate', v)}
                  minDate={eventData.startDate ? new Date(eventData.startDate) : undefined}
                  required
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Start Time"
                  type="time"
                  value={eventData.startTime}
                  onChange={(e) => updateField('startTime', e.target.value)}
                  required
                />
                <Input
                  label="End Time"
                  type="time"
                  value={eventData.endTime}
                  onChange={(e) => updateField('endTime', e.target.value)}
                  required
                />
              </div>
              <hr className="border-border" />
              <Input
                label="Venue Name"
                placeholder="e.g., Bangalore International Centre"
                value={eventData.venueName}
                onChange={(e) => updateField('venueName', e.target.value)}
              />
              <Input
                label="Venue Address"
                placeholder="Full address"
                value={eventData.venueAddress}
                onChange={(e) => updateField('venueAddress', e.target.value)}
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="City"
                  placeholder="e.g., Bangalore"
                  value={eventData.city}
                  onChange={(e) => updateField('city', e.target.value)}
                />
                <Input
                  label="State"
                  placeholder="e.g., Karnataka"
                  value={eventData.state}
                  onChange={(e) => updateField('state', e.target.value)}
                />
              </div>
              <Input
                label="Max Attendees"
                type="number"
                placeholder="Leave blank for unlimited"
                value={eventData.maxAttendees}
                onChange={(e) => updateField('maxAttendees', e.target.value)}
                hint="Set a limit on how many people can register"
              />
            </div>
          )}

          {/* Step 3: Tickets */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, isFree: true } }))}
                  className={cn(
                    'px-6 py-3 rounded-xl border-2 text-sm font-semibold transition-all flex-1 text-center',
                    eventData.ticketing.isFree
                      ? 'bg-yellow-400/20 border-yellow-400 text-yellow-400'
                      : 'border-border text-text-secondary hover:border-white/30'
                  )}
                >
                  <Check className="h-4 w-4 mx-auto mb-1" />
                  Free Event
                </button>
                <button
                  type="button"
                  onClick={() => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, isFree: false } }))}
                  className={cn(
                    'px-6 py-3 rounded-xl border-2 text-sm font-semibold transition-all flex-1 text-center',
                    !eventData.ticketing.isFree
                      ? 'bg-yellow-400/20 border-yellow-400 text-yellow-400'
                      : 'border-border text-text-secondary hover:border-white/30'
                  )}
                >
                  Paid Event
                </button>
              </div>

              {!eventData.ticketing.isFree && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Input
                    label="Ticket Price (₹)"
                    type="number"
                    placeholder="e.g., 499"
                    value={eventData.ticketing.price}
                    onChange={(e) => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, price: e.target.value } }))}
                  />
                  <Input
                    label="Number of Tickets"
                    type="number"
                    placeholder="e.g., 100"
                    value={eventData.ticketing.quantity}
                    onChange={(e) => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, quantity: e.target.value } }))}
                  />
                </div>
              )}

              {eventData.ticketing.isFree && (
                <Input
                  label="Number of Tickets"
                  type="number"
                  placeholder="e.g., 100"
                  value={eventData.ticketing.quantity}
                  onChange={(e) => setEventData(prev => ({ ...prev, ticketing: { ...prev.ticketing, quantity: e.target.value } }))}
                  hint="How many free tickets are available?"
                />
              )}

              <div className="p-4 bg-yellow-400/10 border border-yellow-400/20 rounded-xl text-sm text-yellow-400">
                <p className="font-medium mb-1">💡 Payment Processing</p>
                <p className="text-yellow-400/80">
                  For paid events, tickets are processed securely via Razorpay. 
                  The payment gateway fee (2% + GST) is deducted from each transaction.
                  You can configure other payment methods in Settings.
                </p>
              </div>

              <p className="text-xs text-text-muted">
                Need multiple ticket types (e.g., VIP, Early Bird, Group)? You can add more after creating the event.
              </p>
            </div>
          )}

          {/* Step 4: Branding */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div className="p-8 border-2 border-dashed border-border rounded-2xl text-center">
                <div className="h-16 w-16 rounded-2xl bg-yellow-400/20 mx-auto mb-4 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-yellow-400" />
                </div>
                <p className="text-text-secondary mb-2">Upload Cover Image</p>
                <p className="text-text-muted text-sm mb-4">Recommended: 1920x1080px</p>
                <Button variant="secondary" size="sm">Choose Image</Button>
              </div>

              <Input
                label="Custom URL Slug"
                placeholder="your-event-name"
                value={eventData.title.toLowerCase().replace(/\s+/g, '-')}
                onChange={() => {}}
                hint="makeyourpass.app/e/your-event-name"
              />
            </div>
          )}

          {/* Step 5: Review */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-yellow-400/10 border border-yellow-400/20 rounded-xl">
                <div className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-green-400" />
                  <div>
                    <p className="text-white font-medium">All steps completed</p>
                    <p className="text-text-secondary text-sm">Review your event details before publishing</p>
                  </div>
                </div>
                <Badge variant="yellow">Ready</Badge>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted">Title</span>
                  <span className="text-white font-medium">{eventData.title || 'Not set'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted">Category</span>
                  <span className="text-white capitalize">{eventData.category || 'Not set'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted">Date</span>
                  <span className="text-white">{eventData.startDate || 'Not set'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted">Venue</span>
                  <span className="text-white">{eventData.venueName || 'Not set'}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-text-muted">Tickets</span>
                  <span className="text-white">
                    {eventData.ticketing.isFree ? 'Free' : `₹${eventData.ticketing.price}`}
                    {' — '}
                    {eventData.ticketing.quantity || 'Unlimited'} available
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <Button
              variant="ghost"
              onClick={currentStep === 0 ? () => navigate('/dashboard/events') : handleBack}
            >
              {currentStep === 0 ? 'Cancel' : (
                <>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </>
              )}
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button variant="primary" onClick={handleNext}>
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={handlePublish} className="bg-green-500 hover:bg-green-400 shadow-lg shadow-green-500/30">
                <Save className="h-4 w-4" />
                Publish Event
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}