'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CONFIRM_TEXT = '삭제합니다'

/**
 * 유저 계정 강제 완전 삭제 버튼 (티켓 20260909_0911)
 * `ResetUserButton`(컨텐츠만 초기화)과 달리 계정 자체와 모든 데이터를 영구히 지운다.
 * 실수 삭제를 막기 위해 "삭제합니다"를 정확히 입력해야만 삭제 버튼이 활성화된다.
 */
export function DeleteUserButton({
  userId,
  userName,
  userEmail,
}: {
  userId: string
  userName: string
  userEmail: string
}) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ deletedEmail: string } | null>(null)

  const canDelete = confirmText === CONFIRM_TEXT

  const closeAndReset = () => {
    setShowConfirm(false)
    setConfirmText('')
    setError(null)
    setResult(null)
  }

  const handleDelete = async () => {
    if (!canDelete) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '삭제하지 못했습니다.')
      setResult(data)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제하는 중 오류가 발생했습니다.')
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
          setConfirmText('')
          setShowConfirm(true)
        }}
        className="border border-red-700 text-red-700 hover:bg-red-700 hover:text-white text-xs font-bold px-2 py-1 rounded transition-colors"
      >
        완전 삭제
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-white border-2 border-red-700 rounded-2xl p-6 max-w-sm w-full mx-4">
            {result ? (
              <>
                <h3 className="text-lg font-bold mb-2">삭제 완료</h3>
                <p className="text-muted-foreground text-sm mb-5">
                  &apos;{result.deletedEmail}&apos; 계정과 관련된 모든 데이터를 영구적으로 삭제했습니다.
                </p>
                <button
                  onClick={closeAndReset}
                  className="w-full bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors"
                >
                  닫기
                </button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-bold text-red-700 mb-2">계정 완전 삭제</h3>
                <p className="text-muted-foreground text-sm mb-2">
                  &apos;{userName}&apos;님({userEmail}) 계정을 삭제합니다. 계정 자체는 물론{' '}
                  <strong className="text-foreground">보유한 모든 배지·아이템·활동 기록</strong>까지
                  함께 사라집니다.
                </p>
                <p className="text-red-700 text-xs font-bold mb-4">
                  이 작업은 영구적으로 실행되며, 실행한 뒤에는 절대 되돌릴 수 없습니다.
                </p>
                <label htmlFor="delete-user-confirm-input" className="block text-xs text-muted-foreground mb-1">
                  삭제하려면 아래 입력란에 &apos;{CONFIRM_TEXT}&apos;를 정확히 입력하세요.
                </label>
                <input
                  id="delete-user-confirm-input"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={loading}
                  placeholder={CONFIRM_TEXT}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-red-700"
                />
                <p className="text-muted-foreground text-xs mb-4">
                  입력한 문구가 정확히 일치해야 삭제 버튼이 활성화됩니다.
                </p>
                {error && <p className="text-red-600 text-xs mb-3">{error}</p>}
                <div className="flex gap-3">
                  <button
                    onClick={handleDelete}
                    disabled={!canDelete || loading}
                    className="flex-1 bg-red-700 text-white font-bold py-2.5 rounded-xl hover:bg-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '삭제하는 중...' : '완전 삭제 확인'}
                  </button>
                  <button
                    onClick={closeAndReset}
                    disabled={loading}
                    className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted transition-colors"
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
