import { HeroSection } from '@/components/sections/HeroSection'
import { FeaturesSection } from '@/components/sections/FeaturesSection'
import { FeaturedEventsSection } from '@/components/sections/FeaturedEventsSection'
import { HowItWorksSection } from '@/components/sections/HowItWorksSection'
import { CTASection } from '@/components/sections/CTASection'

export function HomePage() {
  return (
    <div>
      <HeroSection />
      <FeaturesSection />
      <FeaturedEventsSection />
      <HowItWorksSection />
      <CTASection />
    </div>
  )
}