'use client'

import { useState } from 'react'
import { Input } from '@/components/admin/ui/input'
import type { CombinePolicy } from '@/lib/combine/policy'

/**
 * 믹스 정책 화면 (티켓 20260910_1408) — 트라이브 다양성 티어 3개 섹션(12개 입력)과
 * 피티 2개 섹션(7개 입력)을 전면 제거했다. 배지 지급은 어드민이 등록한 레시피를 통해서만
 * 일어나므로, 정책에 남는 설정은 「레시피 미매칭 시 지급할 고정 포인트」 하나뿐이다.
 */
export default function CombinePolicyForm({ initial }: { initial: CombinePolicy }) {
  const [failRewardPoints, setFailRewardPoints] = useState(String(initial.fail_reward_points))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const points = Number(failRewardPoints || '0')
      if (!Number.isInteger(points) || points < 0) {
        setMessage({ type: 'error', text: '실패 시 지급 포인트는 0 이상의 정수여야 해요.' })
        return
      }
      const patch: Partial<CombinePolicy> = { fail_reward_points: points }
      const res = await fetch('/api/admin/combine-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      } else {
        setMessage({ type: 'ok', text: '저장되었습니다. 다음 믹스부터 즉시 적용됩니다.' })
      }
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-bold mb-1">실패 보상</h2>
        <p className="text-muted-foreground text-xs mb-4">
          등록된 레시피에 맞지 않는 조합은 배지를 전혀 지급하지 않고, 아래 고정 포인트만
          지급합니다. 0이면 미지급입니다.
        </p>
        <label className="block max-w-[16rem]">
          <span className="text-foreground text-xs">실패 시 지급 포인트</span>
          <Input
            type="number"
            step="1"
            min="0"
            value={failRewardPoints}
            onChange={(e) => setFailRewardPoints(e.target.value)}
            className="mt-1"
          />
        </label>
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
