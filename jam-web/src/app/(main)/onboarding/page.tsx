'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return (
    <div className="min-h-full bg-jam-yellow flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-jam-ink border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
