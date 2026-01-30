'use client'

import React from "react"

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
// X icon removed - using built-in DialogContent close button

export function AuthModal() {
  const { showAuthModal, setShowAuthModal, login, signup, authMode, setAuthMode } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      if (authMode === 'signin') {
        if (!email || !password) {
          setError('Please fill in all fields')
          return
        }
        await login(email, password)
      } else {
        if (!email || !password || !name) {
          setError('Please fill in all fields')
          return
        }
        await signup(email, password, name)
      }
    } catch (err) {
      setError('Authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleModeSwitch = (mode: 'signin' | 'signup') => {
    setAuthMode(mode)
    setEmail('')
    setPassword('')
    setName('')
    setError('')
  }

  return (
    <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
      <DialogContent className="sm:max-w-[400px] bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-foreground">
            {authMode === 'signin' ? 'Sign In' : 'Create Account'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {authMode === 'signin' 
              ? 'Enter your credentials to access your account' 
              : 'Create a new account to get started'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">
                Full Name
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={e => setName(e.target.value)}
                className="bg-background border-border text-foreground placeholder:text-muted-foreground"
                disabled={isLoading}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email" className="text-foreground">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-foreground">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="bg-background border-border text-foreground placeholder:text-muted-foreground"
              disabled={isLoading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={isLoading}
          >
            {isLoading ? (authMode === 'signin' ? 'Signing in...' : 'Creating account...') : (authMode === 'signin' ? 'Sign In' : 'Create Account')}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-card px-2 text-muted-foreground">or</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full border-border text-foreground hover:bg-muted bg-transparent"
            disabled={isLoading}
          >
            Continue with Google
          </Button>

          <div className="text-center pt-2">
            <p className="text-xs text-muted-foreground">
              {authMode === 'signin' ? (
                <>
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('signup')}
                    className="text-primary hover:underline font-medium"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('signin')}
                    className="text-primary hover:underline font-medium"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>

          {authMode === 'signin' && (
            <p className="text-xs text-muted-foreground text-center">
              <a href="#" className="text-primary hover:underline">
                Forgot password?
              </a>
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
