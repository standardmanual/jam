'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ResetUserButton({ userId, userName }: { userId: string; userName: string }) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ deletedActivityBadges: number; deletedInventoryItems: number } | null>(null)

  const handleReset = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '초기화 실패')
      setResult(data)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '초기화 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => {
          setError(null)
          setResult(null)
          setShowConfirm(true)
        }}
        className="text-red-400/70 hover:text-red-400 text-xs font-medium transition-colors"
      >
        초기화
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4">
            {result ? (
              <>
                <h3 className="text-lg font-bold mb-2">초기화 완료</h3>
                <p className="text-white/50 text-sm mb-5">
                  &apos;{userName}&apos;님의 배지 {result.deletedActivityBadges}개, 아이템{' '}
                  {result.deletedInventoryItems}개가 삭제되었습니다.
                </p>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="w-full bg-white/5 text-white py-2.5 rounded-xl hover:bg-white/10 transition-colors"
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold mb-2">유저 컨텐츠 초기화</h3>
                <p className="text-white/50 text-sm mb-2">
                  &apos;{userName}&apos;님이 보유한 <strong className="text-white">모든 액티비티 배지</strong>와{' '}
                  <strong className="text-white">인벤토리 아이템</strong>을 삭제하고 슬롯을 리셋합니다.
                </p>
                <p className="text-red-400/70 text-xs mb-5">
                  이 작업은 되돌릴 수 없습니다. 계정 정보와 Strava 연동은 유지됩니다.
                </p>
                {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    disabled={loading}
                    className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-500 disabled:opacity-50 transition-colors"
                  >
                    {loading ? '초기화 중...' : '초기화 확인'}
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={loading}
                    className="flex-1 bg-white/5 text-white py-2.5 rounded-xl hover:bg-white/10 transition-colors"
                  >
                    취소
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
