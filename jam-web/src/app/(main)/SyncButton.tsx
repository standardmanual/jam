'use client'

import { useState } from 'react'
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
        const data: { synced: number; badges: number; itemBooksCompleted: number; missionsCompleted: number } = await res.json()
        if (data.itemBooksCompleted > 0) {
          toast(`아이템북 ${data.itemBooksCompleted}개 완성! 🎉`, 'success')
        } else if (data.missionsCompleted > 0) {
          toast(`미션 ${data.missionsCompleted}개 달성! 🎯`, 'success')
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
    <button
      onClick={handleSync}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-jam-ink text-white text-xs font-black border-2 border-jam-ink disabled:opacity-40 active:scale-95 transition-all"
    >
      {loading ? (
        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
        </svg>
      )}
      동기화
    </button>
  )
}
