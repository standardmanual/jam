'use client'

import { useState } from 'react'
import { Input } from '@/components/admin/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/admin/ui/alert-dialog'

interface Props {
  initialMaxSlots: number
  initialAffectedUserCount: number
}

/**
 * 인벤토리 최대치(max_slots) 전체 유저 일괄 조정 폼 (티켓 20260904_1623).
 * 되돌리기 어려운 일괄 작업이므로 저장 버튼 클릭 시 바로 API를 호출하지 않고
 * AlertDialog로 확인한 뒤에만 호출한다 (AdminRoleToggle.tsx와 동일 패턴).
 */
export default function InventoryPolicyForm({ initialMaxSlots, initialAffectedUserCount }: Props) {
  const [maxSlots, setMaxSlots] = useState(initialMaxSlots)
  const [affectedUserCount, setAffectedUserCount] = useState(initialAffectedUserCount)
  const [input, setInput] = useState(String(initialMaxSlots))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  // AlertDialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — 포털 컨테이너를 그 스코프 노드로
  // 지정한다(AdminRoleToggle.tsx와 동일 패턴).
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const parsed = parseInt(input, 10)
  const isValid = input.trim() !== '' && Number.isInteger(parsed) && parsed >= 1
  const isUnchanged = isValid && parsed === maxSlots

  const handleConfirm = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/inventory-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_slots: parsed }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: json.error ?? '저장 실패' })
      } else {
        setMaxSlots(json.policy.max_slots)
        setAffectedUserCount((prev) => (typeof json.updatedCount === 'number' ? json.updatedCount : prev))
        setMessage({
          type: 'ok',
          text: `저장됐어요. 유저 ${json.updatedCount?.toLocaleString('ko-KR') ?? ''}명의 인벤토리 최대치가 즉시 ${json.policy.max_slots}개로 바뀌었고, 앞으로 가입할 신규 유저에게도 같은 값이 적용됩니다.`,
        })
        setConfirmOpen(false)
      }
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류로 저장하지 못했어요. 다시 시도해 주세요.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <section className="bg-white border border-border rounded-2xl p-6">
        <h2 className="font-bold mb-1">현재 정책</h2>
        <div className="flex items-center gap-6 mt-3">
          <div>
            <p className="text-muted-foreground text-xs">현재 최대치</p>
            <p className="text-2xl font-bold text-foreground">{maxSlots}개</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">적용 대상 유저 수</p>
            <p className="text-2xl font-bold text-foreground">{affectedUserCount.toLocaleString('ko-KR')}명</p>
          </div>
        </div>

        <label className="block mt-6">
          <span className="text-foreground text-xs">새 최대치</span>
          <Input
            type="number"
            step="1"
            min="1"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="mt-1 max-w-[160px]"
          />
          {!isValid && (
            <p className="text-red-600 text-xs mt-1">1 이상의 정수를 입력해 주세요.</p>
          )}
        </label>

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={saving || !isValid || isUnchanged}
          className="mt-4 bg-primary text-white font-bold px-6 py-2.5 rounded-xl hover:bg-primary/90 transition-colors text-sm disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>

        {message && (
          <p className={`text-sm mt-3 ${message.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !saving && setConfirmOpen(open)}>
        <AlertDialogContent container={themeContainer ?? undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>인벤토리 최대치 변경</AlertDialogTitle>
            <AlertDialogDescription>
              전체 유저 {affectedUserCount.toLocaleString('ko-KR')}명의 인벤토리 최대치를{' '}
              <span className="font-bold text-foreground">{maxSlots}개 → {isValid ? parsed : '—'}개</span>로
              변경할까요? 되돌리기 어려운 일괄 작업이에요. 앞으로 가입할 신규 유저의 기본값도
              함께 바뀝니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? '처리 중...' : '확인'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={saving}
              className="flex-1 bg-white text-foreground py-2.5 rounded-xl hover:bg-muted disabled:opacity-50 transition-colors"
            >
              취소
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
