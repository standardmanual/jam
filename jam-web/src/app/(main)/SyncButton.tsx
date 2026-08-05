'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/button'
import { d, t } from '@/lib/i18n'

export default function SyncButton() {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  async function handleSync() {
    setLoading(true)
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' })
      if (res.ok) {
        const data: { synced: number; badges: number; itemBooksCompleted: number; missionsCompleted: number } = await res.json()
        if (data.itemBooksCompleted > 0) {
          toast(t(d.today.syncItembookDone, { count: data.itemBooksCompleted }), 'success')
        } else if (data.missionsCompleted > 0) {
          toast(t(d.today.syncMissionDone, { count: data.missionsCompleted }), 'success')
        } else if (data.badges > 0) {
          toast(t(d.today.syncBadgeDone, { count: data.badges }), 'success')
        } else {
          toast(d.today.syncDone, 'success')
        }
        router.refresh()
      } else {
        toast(d.today.syncFailed, 'error')
      }
    } catch {
      toast(d.common.networkError, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      surface="sub"
      size="sm"
      onClick={handleSync}
      loading={loading}
    >
      {d.today.syncButton}
    </Button>
  )
}
