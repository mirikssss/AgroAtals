'use client'

import { useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Settings, LogOut, Globe, Eye, EyeOff, Lock } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'

interface User {
  name: string
  email: string
  organization?: string
  role?: string
}

interface ProfilePopupProps {
  user: User
  onLogout: () => void
  /** Опциональный класс для кнопки-триггера (например, в боковом меню) */
  triggerClassName?: string
  /** В боковом меню: показывать ли текст "Profile" рядом с аватаром */
  showLabel?: boolean
}

export function ProfilePopup({ user, onLogout, triggerClassName, showLabel }: ProfilePopupProps) {
  const { language, setLanguage, t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showProfileInfo, setShowProfileInfo] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [riskAlerts, setRiskAlerts] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState(false)

  const userInitial = user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase() || 'U'

  const handleLogout = () => {
    setIsOpen(false)
    onLogout()
  }

  const handlePasswordChange = () => {
    setPasswordError('')
    
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required')
      return
    }
    
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match')
      return
    }
    
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters')
      return
    }
    
    // Simulate password change
    console.log('[v0] Password changed successfully')
    setPasswordSuccess(true)
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    
    setTimeout(() => {
      setShowChangePassword(false)
      setPasswordSuccess(false)
    }, 2000)
  }

  return (
    <>
      {/* Main Profile Popover */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button className={triggerClassName ?? 'rounded-full hover:ring-2 hover:ring-primary/50 transition-all'}>
            {showLabel ? (
              <span className="flex items-center gap-3 w-full">
                <Avatar className="h-10 w-10 cursor-pointer shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate font-medium">{user.name}</span>
              </span>
            ) : (
              <Avatar className="h-10 w-10 cursor-pointer">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0 rounded-xl shadow-lg shadow-black/5 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border border-white/40 dark:border-slate-600/40" align="end">
          {!showSettings ? (
            <div className="space-y-0">
              {/* User Info Section */}
              <div className="p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsOpen(false)
                      setShowProfileInfo(true)
                    }}
                    className="rounded-full hover:ring-2 hover:ring-primary/50 transition-all"
                  >
                    <Avatar className="h-12 w-12 cursor-pointer">
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{user.name}</p>
                    {user.organization && (
                      <p className="text-xs text-muted-foreground truncate">
                        {user.organization}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">{user.email}</p>
                  {user.role && (
                    <Badge variant="secondary" className="w-fit text-xs">
                      {user.role}
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              {/* Action Buttons */}
              <div className="p-4 space-y-2">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-foreground hover:bg-primary/5"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  {t('settings')}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start text-destructive hover:bg-destructive/10"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('logout')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Settings Header */}
              <div className="p-4 border-b border-border/50">
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  ← {t('back')}
                </button>
              </div>

              {/* Settings Content */}
              <div className="p-4 space-y-6 max-h-96 overflow-y-auto">
                {/* Risk Alerts Toggle */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">
                    {t('riskAlerts')}
                  </label>
                  <button
                    onClick={() => setRiskAlerts(!riskAlerts)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                      riskAlerts
                        ? 'bg-[#10B981]/20 text-[#10B981] dark:text-[#34D399]'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {riskAlerts ? t('on') : t('off')}
                  </button>
                </div>

                {/* Language Selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    {t('language')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['en', 'ru', 'uz'] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                          language === lang
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {lang.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Change Password Modal */}
      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('changePassword')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {passwordSuccess && (
              <div className="p-3 rounded-md bg-[#10B981]/10 text-[#10B981] dark:text-[#34D399] text-sm">
                Password updated successfully!
              </div>
            )}
            
            {passwordError && (
              <div className="p-3 rounded-md bg-red-500/10 text-red-700 dark:text-red-400 text-sm">
                {passwordError}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground">{t('oldPassword')}</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter old password"
                className="w-full mt-1 px-3 py-2 rounded-md bg-muted text-foreground text-sm border border-border/50"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t('newPassword')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full mt-1 px-3 py-2 rounded-md bg-muted text-foreground text-sm border border-border/50"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">{t('confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full mt-1 px-3 py-2 rounded-md bg-muted text-foreground text-sm border border-border/50"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                variant="outline"
                className="flex-1 bg-transparent"
                onClick={() => setShowChangePassword(false)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1"
                onClick={handlePasswordChange}
                disabled={passwordSuccess}
              >
                {t('updatePassword')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Info Modal */}
      <Dialog open={showProfileInfo} onOpenChange={setShowProfileInfo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('profileInformation')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Avatar */}
            <div className="flex justify-center">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-2xl">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* User Details */}
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('name')}
                </label>
                <p className="mt-1 text-sm font-medium text-foreground">{user.name}</p>
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('email')}
                </label>
                <p className="mt-1 text-sm font-medium text-foreground">{user.email}</p>
              </div>

              {/* Password */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  {t('password')}
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value="••••••••"
                    disabled
                    className="flex-1 px-3 py-2 rounded-md bg-muted text-sm font-medium text-foreground"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-2 hover:bg-muted rounded-md transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Change Password Button */}
            <Button 
              onClick={() => {
                setShowProfileInfo(false)
                setShowChangePassword(true)
              }}
              className="w-full"
            >
              <Lock className="w-4 h-4 mr-2" />
              {t('changePassword')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
