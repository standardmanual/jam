'use client'

import { useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useRouter } from 'next/navigation'

export default function SyncButton() {
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const router = useRouter()

  async function handleSync() {
    setLoading(true)
    try {
      const res = await fetch('/api/strava/sync', { method: 'POST' })
      if (res.ok) {
        const data: { synced: number; badges: number; itemBooksCompleted: number } = await res.json()
        if (data.itemBooksCompleted > 0) {
          toast(`아이템북 ${data.itemBooksCompleted}개 완성! 🎉`, 'success')
        } else if (data.badges > 0) {
          toast(`배지 ${data.badges}개 획득! 🏅`, 'success')
        } else {
          toast('동기화 완료!', 'success')
        }
        router.refresh()
      } else {
        toast('동기화 실패. 잠시 후 다시 시도해주세요.', 'error')
      }
    } catch {
      toast('네트워크 오류가 발생했습니다.', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="secondary" size="sm" loading={loading} onClick={handleSync}>
      지금 동기화
    </Button>
  )
}
