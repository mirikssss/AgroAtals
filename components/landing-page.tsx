'use client'

import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Satellite, TrendingUp, BarChart3, AlertTriangle } from 'lucide-react'

export function LandingPage() {
  const { setShowAuthModal, setAuthMode } = useAuth()

  const handleGetStarted = () => {
    setAuthMode('signup')
    setShowAuthModal(true)
  }

  const handleSignIn = () => {
    setAuthMode('signin')
    setShowAuthModal(true)
  }

  const handleSignUp = () => {
    setAuthMode('signup')
    setShowAuthModal(true)
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero block: same background image + overlay for header and hero */}
      <div className="relative flex flex-col min-h-screen overflow-hidden">
        {/* Background image — stretches over header + hero */}
        <div
          className="absolute inset-0 bg-cover bg-no-repeat"
          style={{ backgroundImage: 'url(/bg.jpg)', backgroundPosition: 'center calc(50% - 20px)' }}
        />
        {/* Black overlay 30% */}
        <div className="absolute inset-0 bg-black/30" aria-hidden />

        {/* Navigation — transparent, so hero image shows through */}
        <nav className="relative z-10 border-b border-white/20 bg-transparent backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Satellite className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg sm:text-xl font-semibold text-white">AgroRisk</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                onClick={handleSignIn}
                variant="ghost"
                className="text-white hover:bg-white/10 px-3 sm:px-4 py-2 text-sm sm:text-base"
              >
                Sign In
              </Button>
              <Button
                onClick={handleSignUp}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-3 sm:px-4 py-2 text-sm sm:text-base"
              >
                Sign Up
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero Section content */}
        <section className="relative z-10 flex-1 flex items-center justify-center px-4 py-20">
          <div className="max-w-3xl w-full text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white text-balance">
              AgroRisk
            </h1>
            <p className="text-lg sm:text-xl text-white/90 text-balance">
              Field-level insights for smarter credit and insurance decisions
            </p>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            <Button 
              onClick={handleGetStarted}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 sm:px-8 py-5 sm:py-6 text-base sm:text-lg rounded-lg shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 font-semibold"
            >
              Get Started
            </Button>
            <Button
              onClick={handleSignIn}
              variant="outline"
              className="border-white/80 text-white hover:bg-white/10 px-6 sm:px-8 py-5 sm:py-6 text-base sm:text-lg bg-transparent rounded-lg transition-all hover:-translate-y-0.5"
            >
              Sign In
            </Button>
          </div>
        </div>
        </section>
      </div>

      {/* Features Section */}
      <section className="bg-card py-20 border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-6">
            <Card className="p-6 bg-background border-border hover:border-primary/50 transition">
              <Satellite className="w-8 h-8 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Satellite Monitoring
              </h3>
              <p className="text-muted-foreground">
                Real-time imagery from Sentinel-1 and Sentinel-2 for continuous field monitoring
              </p>
            </Card>

            <Card className="p-6 bg-background border-border hover:border-primary/50 transition">
              <TrendingUp className="w-8 h-8 text-secondary mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                AI Risk Models
              </h3>
              <p className="text-muted-foreground">
                Advanced machine learning algorithms for accurate risk prediction and assessment
              </p>
            </Card>

            <Card className="p-6 bg-background border-border hover:border-primary/50 transition">
              <BarChart3 className="w-8 h-8 text-accent mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Field-Level Analytics
              </h3>
              <p className="text-muted-foreground">
                Granular insights by field location, crop type, and seasonal performance metrics
              </p>
            </Card>

            <Card className="p-6 bg-background border-border hover:border-primary/50 transition">
              <AlertTriangle className="w-8 h-8 text-accent mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Confidence Intervals
              </h3>
              <p className="text-muted-foreground">
                P10, P50, P90 uncertainty bands for data-driven decision making
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12 space-y-4">
            <h2 className="text-4xl font-bold text-foreground">Trusted By</h2>
            <p className="text-lg text-muted-foreground">
              Supporting financial institutions in agricultural risk management
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: 'Banks & Credit Institutions',
                description:
                  'Enhanced agricultural lending with data-driven risk assessment and monitoring',
              },
              {
                title: 'Insurance Companies',
                description:
                  'Improved underwriting accuracy through satellite-based field monitoring',
              },
              {
                title: 'Agri-Finance Analysts',
                description:
                  'Comprehensive market intelligence for investment and portfolio decisions',
              },
            ].map((item, idx) => (
              <Card
                key={idx}
                className="p-6 bg-background border-border hover:border-primary/50 transition"
              >
                <h3 className="text-lg font-semibold text-foreground mb-3">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-card py-20 border-t border-border px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-foreground mb-12 text-center">How It Works</h2>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: '1', title: 'Select Field', desc: 'Choose a field on our interactive map' },
              { step: '2', title: 'Choose Crop', desc: 'Specify crop type and growing season' },
              { step: '3', title: 'Run Analysis', desc: 'Our AI models process satellite data' },
              { step: '4', title: 'Get Insights', desc: 'Receive risk metrics and confidence bands' },
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-12 px-4 mt-auto">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    About
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    Privacy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    Terms
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Resources</h4>
              <ul className="space-y-2 text-muted-foreground text-sm">
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-foreground transition">
                    Docs
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-8 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              © 2024 AgroRisk. All rights reserved.
            </p>
            <div className="flex gap-4 text-muted-foreground text-sm">
              <a href="#" className="hover:text-foreground transition">
                Twitter
              </a>
              <a href="#" className="hover:text-foreground transition">
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
