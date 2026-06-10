import { HeroSection } from '@/components/sections/HeroSection'
import { FeaturesSection } from '@/components/sections/FeaturesSection'
import { HowItWorksSection } from '@/components/sections/HowItWorksSection'
import { CTASection } from '@/components/sections/CTASection'

export function HomePage() {
  return (
    <div>
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
    </div>
  )
}