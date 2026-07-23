'use client'

import { useCallback, useEffect, useState } from 'react'
import { ADMIN_REASONS, HIGH_VALUE_THRESHOLD, type AdminReasonValue } from '@/lib/points/reasons'
import type { AdminUserPointHistoryItem } from '@/app/api/admin/points/route'

interface Props {
  userId: string
  username: string | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * 유저 포인트 지급/회수 공용 폼.
 * /admin/points(유저 검색 후)와 /admin/users/[id] 양쪽에서 동일하게 사용.
 * 자체적으로 대상 유저의 잔액·최근 내역을 불러오고, 지급/회수 후 갱신한다.
 */
export default function UserGrantForm({ userId, username }: Props) {
  const [balance, setBalance] = useState<number | null>(null)
  const [items, setItems] = useState<AdminUserPointHistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  const [direction, setDirection] = useState<'grant' | 'deduct'>('grant')
  const [magnitude, setMagnitude] = useState('')
  const [reasonLabel, setReasonLabel] = useState<AdminReasonValue>('cs_compensation')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/points?userId=${encodeURIComponent(userId)}`)
      if (res.ok) {
        const data = await res.json()
        setBalance(data.balance)
        setItems(data.items)
      }
    } finally {
      setLoading(false)
    }
  }, [userId])

  // 최초 로드 — 이펙트 본문에서 동기 setState를 피하기 위해 await 이후에만 상태를 갱신
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/points?userId=${encodeURIComponent(userId)}`)
        if (res.ok && active) {
          const data = await res.json()
          if (!active) return
          setBalance(data.balance)
          setItems(data.items)
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [userId])

  const mag = parseInt(magnitude, 10)
  const signedAmount = Number.isFinite(mag) ? (direction === 'deduct' ? -mag : mag) : 0
  const isHighValue = Math.abs(signedAmount) >= HIGH_VALUE_THRESHOLD

  const validate = (): string | null => {
    if (!Number.isInteger(mag) || mag <= 0) return '0보다 큰 정수 금액을 입력하세요.'
    if (reasonLabel === 'other' && note.trim().length === 0) return '"기타" 사유는 내용을 입력해야 합니다.'
    return null
  }

  const submit = async (confirmed: boolean) => {
    const v = validate()
    if (v) { setError(v); return }
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/points/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          amount: signedAmount,
          reasonLabel,
          note: reasonLabel === 'other' ? note.trim() : undefined,
          confirmed,
        }),
      })
      const data = await res.json()
      if (res.status === 422 && data.requiresConfirmation) {
        setShowConfirm(true)
        setSubmitting(false)
        return
      }
      if (!res.ok) throw new Error(data.error ?? '처리 실패')
      // 성공 — 갱신
      setBalance(data.balance)
      setMagnitude('')
      setNote('')
      setShowConfirm(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitClick = () => {
    const v = validate()
    if (v) { setError(v); return }
    if (isHighValue) { setShowConfirm(true); return }
    submit(false)
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">포인트 지급 / 회수</h3>
        <div className="text-right">
          <p className="text-xs text-white/40">현재 잔액</p>
          <p className="text-lg font-bold text-[#AEEA00]">
            {balance === null ? '—' : `${balance.toLocaleString('ko-KR')}P`}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 text-red-400 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* 방향 */}
        <div className="col-span-2 flex gap-2">
          <button
            type="button"
            onClick={() => setDirection('grant')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${direction === 'grant' ? 'bg-[#AEEA00] text-black border-[#AEEA00]' : 'bg-white/5 text-white/60 border-white/10'}`}
          >
            지급 (+)
          </button>
          <button
            type="button"
            onClick={() => setDirection('deduct')}
            className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-colors ${direction === 'deduct' ? 'bg-red-500 text-white border-red-500' : 'bg-white/5 text-white/60 border-white/10'}`}
          >
            회수 (−)
          </button>
        </div>

        {/* 금액 */}
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-xs text-white/50">금액 (P)</span>
          <input
            type="number"
            min="1"
            value={magnitude}
            onChange={(e) => setMagnitude(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
            placeholder="예: 500"
          />
          {isHighValue && (
            <span className="text-xs text-amber-400">
              기준액({HIGH_VALUE_THRESHOLD.toLocaleString('ko-KR')}P) 이상 — 실행 시 확인이 필요합니다.
            </span>
          )}
        </label>

        {/* 사유 */}
        <label className="flex flex-col gap-1.5 col-span-2">
          <span className="text-xs text-white/50">사유</span>
          <select
            value={reasonLabel}
            onChange={(e) => setReasonLabel(e.target.value as AdminReasonValue)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
          >
            {ADMIN_REASONS.map((r) => (
              <option key={r.value} value={r.value} className="bg-[#1a1a1a]">{r.label}</option>
            ))}
          </select>
        </label>

        {/* 기타 자유 입력 */}
        {reasonLabel === 'other' && (
          <label className="flex flex-col gap-1.5 col-span-2">
            <span className="text-xs text-white/50">사유 내용 *</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-[#AEEA00]/50"
              placeholder="사유를 직접 입력"
            />
          </label>
        )}
      </div>

      <button
        onClick={handleSubmitClick}
        disabled={submitting}
        className="bg-[#AEEA00] text-black font-bold px-5 py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors text-sm"
      >
        {submitting ? '처리 중…' : direction === 'grant' ? '지급 실행' : '회수 실행'}
      </button>

      {/* 최근 내역 */}
      <div>
        <p className="text-xs text-white/40 mb-2">최근 내역</p>
        {loading ? (
          <p className="text-white/30 text-sm py-3">불러오는 중…</p>
        ) : items.length === 0 ? (
          <p className="text-white/30 text-sm py-3">내역 없음</p>
        ) : (
          <div className="divide-y divide-white/5">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between py-2">
                <div className="min-w-0">
                  <p className="text-sm text-white/80 truncate">{it.title}</p>
                  {it.note && <p className="text-xs text-white/40 truncate">{it.note}</p>}
                  <p className="text-[11px] text-white/30">{formatDate(it.created_at)}</p>
                </div>
                <span className={`text-sm font-bold shrink-0 ml-3 ${it.amount > 0 ? 'text-[#AEEA00]' : 'text-red-400'}`}>
                  {it.amount > 0 ? '+' : '−'}{Math.abs(it.amount).toLocaleString('ko-KR')}P
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 고액 확인 팝업 */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-bold mb-2">{direction === 'grant' ? '지급' : '회수'} 확인</h3>
            <p className="text-white/60 text-sm mb-5">
              {username ?? '이 유저'}에게 <span className="font-bold text-white">{Math.abs(signedAmount).toLocaleString('ko-KR')}P</span>를 정말 {direction === 'grant' ? '지급' : '회수'}하시겠어요?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => submit(true)}
                disabled={submitting}
                className="flex-1 bg-[#AEEA00] text-black font-bold py-2.5 rounded-xl hover:bg-[#c6ff00] disabled:opacity-50 transition-colors"
              >
                {submitting ? '처리 중…' : '확인'}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-white/5 text-white py-2.5 rounded-xl hover:bg-white/10 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
