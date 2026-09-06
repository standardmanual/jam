'use client'

import { useState } from 'react'
import { Button } from '@/components/admin/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/admin/ui/dialog'

interface DiagnosisBadge {
  id: string
  name: string
  rarity: string | null
}

interface DiagnosisResult {
  conditionMetBadges: DiagnosisBadge[]
  elapsedMs: number
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic',
}

interface Props {
  userId: string
}

/**
 * 「조건 충족 · 미발급」 진단 버튼 (티켓 20260906_1432).
 *
 * 배지 발급은 「새 활동 동기화」가 있어야만 실행되므로(티켓 20260906_1426), 조건은 이미
 * 넘겼는데 다음 동기화 전까지 발급이 미뤄지는 구간이 생긴다. 이 지연은 로그로 남지 않아
 * 유저가 화면에서 보고 신고하기 전까지 아무도 모른다 — 이 버튼은 유저 1명을 대상으로
 * 실제 발급 엔진(`evaluateBadgesDetailed`)을 `dryRun`으로 다시 돌려 그 순간을 온디맨드로
 * 잡는다. DB에는 아무것도 쓰지 않으므로 몇 번을 눌러도 안전하다.
 */
export function BadgeDiagnosisButton({ userId }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DiagnosisResult | null>(null)

  // Dialog(Radix Portal)는 기본적으로 document.body에 렌더링되는데, shadcn 어드민 테마
  // 실값은 [data-admin-theme] 스코프 안에만 존재한다 — AdminRoleToggle.tsx와 동일 패턴.
  const [themeContainer] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-admin-theme]')
  )

  const runDiagnosis = async () => {
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/users/${userId}/badge-diagnosis`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '진단에 실패했습니다.')
      setResult(data as DiagnosisResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : '진단 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={runDiagnosis} disabled={loading}>
        {loading ? '진단 중...' : '조건 충족·미발급 진단'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent container={themeContainer ?? undefined}>
          <DialogHeader>
            <DialogTitle>조건 충족 · 미발급 진단</DialogTitle>
            <DialogDescription>
              지금 배지 엔진을 다시 평가한다면(dry-run) 새로 발급될 배지 목록입니다. DB에는
              아무것도 반영되지 않습니다.
            </DialogDescription>
          </DialogHeader>

          {loading && <p className="text-sm text-muted-foreground">평가 중입니다...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && !error && result && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {result.conditionMetBadges.length}건 · {result.elapsedMs}ms
              </p>
              {result.conditionMetBadges.length === 0 ? (
                <p className="text-sm">조건 충족인데 미발급인 배지가 없습니다.</p>
              ) : (
                <ul className="max-h-80 overflow-y-auto divide-y divide-border rounded-md border border-border">
                  {result.conditionMetBadges.map((b) => (
                    <li key={b.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {b.rarity ? (RARITY_LABEL[b.rarity] ?? b.rarity) : '레벨형'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
