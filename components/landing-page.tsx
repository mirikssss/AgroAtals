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
      {/* Navigation */}
      <nav className="border-b border-border/30 bg-card/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Satellite className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold text-foreground">AgroAtlas</span>
          </div>

          <div className="flex items-center gap-4">
            <Button
              onClick={handleSignIn}
              variant="ghost"
              className="text-foreground hover:bg-muted px-4 py-2"
            >
              Sign In
            </Button>
            <Button
              onClick={handleSignUp}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2"
            >
              Sign Up
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="max-w-3xl w-full text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold text-foreground text-balance">
              AgroAtlas
            </h1>
            <p className="text-xl text-muted-foreground text-balance">
              Field-level insights for smarter credit and insurance decisions
            </p>
          </div>

          <div className="flex gap-4 justify-center flex-wrap">
            <Button 
              onClick={handleGetStarted}
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-lg rounded-lg shadow-sm hover:shadow-md transition-all font-semibold"
            >
              Get Started
            </Button>
            <Button
              onClick={handleSignIn}
              variant="outline"
              className="border-border text-foreground hover:bg-muted px-8 py-6 text-lg bg-transparent rounded-lg"
            >
              Sign In
            </Button>
          </div>
        </div>
      </section>

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
