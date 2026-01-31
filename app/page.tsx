'use client'

import { AuthProvider, useAuth } from '@/lib/auth-context'
import { LanguageProvider } from '@/lib/language-context'
import { AuthModal } from '@/components/auth-modal'
import { LandingPage } from '@/components/landing-page'
import { Dashboard } from '@/components/dashboard'

function PageContent() {
  const { isAuthenticated, logout } = useAuth()

  const handleLogout = () => {
    logout()
  }

  return (
    <>
      {isAuthenticated ? (
        <Dashboard onNavigateToLanding={handleLogout} />
      ) : (
        <LandingPage />
      )}
      <AuthModal />
    </>
  )
}

export default function Page() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <PageContent />
      </LanguageProvider>
    </AuthProvider>
  )
}
