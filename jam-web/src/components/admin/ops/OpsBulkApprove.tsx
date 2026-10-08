'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import { truncateText, userExperienceOf } from '@/lib/admin/opsInbox/itemView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { postDecision } from './decisionClient'
import { OpsConfirmPanel, OpsDialogShell } from './OpsConfirmDialog'

/**
 * 한 주 묶음 일괄 승인 (티켓 20260930_1818, 채원 화면 설계 「행동 영역」의 일괄 승인). 단계 표시줄 오른쪽 `barAction` 슬롯을 채운다.
 *
 * [N개 승인하기](0개면 비활성, 「승인할 항목을 골라 주세요」)를 누르면 요약 창이 뜨고, **요약이 곧 확인이다** — 확인창을 한 번 더 두지 않는다.
 * 요약은 「N개 승인, M개 제외」와 승인할 것(종류별 개수), 제외할 것(글머리와 이유), 형식 오류가 포함될 때의 경고를 보여 준다.
 * 형식 오류가 있는 항목도 경고를 본 뒤 승인할 수 있다(상위 티켓 결정 Q3).
 */

const EXCLUDED_LINES_SHOWN = 5

export interface BulkSummary {
  approveCount: number
  excludeCount: number
  /** 승인할 것의 종류별 개수(많은 순, 같으면 먼저 나온 순). */
  kinds: Array<{ label: string; count: number }>
  /** 제외할 것(요약 창에는 5줄까지). */
  excludedLines: Array<{ id: string; text: string; reason: string }>
  /** 승인할 것 중 형식 오류가 있는 항목 수. */
  errorCount: number
}

/** 체크한 항목(승인할 것)과 체크하지 않은 결정 전 항목(제외할 것)으로 요약을 만든다. */
export function buildBulkSummary(checked: readonly OpsItemRecord[], excluded: readonly OpsItemRecord[]): BulkSummary {
  const counts = new Map<string, number>()
  for (const item of checked) {
    const label = kindLabel(item.kind)
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const kinds = [...counts.entries()]
    .map(([label, count], index) => ({ label, count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ label, count }) => ({ label, count }))

  return {
    approveCount: checked.length,
    excludeCount: excluded.length,
    kinds,
    excludedLines: excluded.map((item) => ({
      id: item.id,
      text: truncateText(userExperienceOf(item) || kindLabel(item.kind), 24),
      reason: item.formatErrors.length > 0 ? '형식 오류가 있어요' : '체크를 풀었어요',
    })),
    errorCount: checked.filter((item) => item.formatErrors.length > 0).length,
  }
}

/** 결과 토스트 문장. 그 사이 다른 곳에서 처리된 항목이 있으면 건너뛴 수를, 패턴 제안을 뺐으면 그 개수를 함께 알린다. */
export function bulkResultMessage(approved: number, skipped: number, patternProposals = 0): string {
  const base = skipped > 0 ? `${approved}개 승인, ${skipped}개는 이미 처리돼 건너뛰었어요` : `${approved}개를 승인했어요`
  return patternProposals > 0 ? `${base} · 패턴 제안 ${patternProposals}개는 하나씩 승인해 주세요` : base
}

interface OpsBulkApprovePanelProps {
  summary: BulkSummary
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** 요약 창의 알맹이(포털 밖). */
export function OpsBulkApprovePanel({ summary, pending, error, onConfirm, onCancel }: OpsBulkApprovePanelProps) {
  const { approveCount, excludeCount, kinds, excludedLines, errorCount } = summary
  const hiddenExcluded = excludedLines.length - EXCLUDED_LINES_SHOWN

  return (
    <OpsConfirmPanel
      title={`${approveCount}개 승인, ${excludeCount}개 제외`}
      confirmLabel={`${approveCount}개 승인하기`}
      pendingLabel="승인하는 중"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      description={
        <div className="space-y-3">
          <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
            <dt className="font-medium text-foreground">승인할 것</dt>
            <dd className="break-words">{kinds.map(({ label, count }) => `${label} ${count}`).join(' · ')}</dd>
            {excludeCount > 0 && (
              <>
                <dt className="font-medium text-foreground">제외할 것</dt>
                <dd>
                  <ul className="space-y-0.5">
                    {excludedLines.slice(0, EXCLUDED_LINES_SHOWN).map((line) => (
                      <li key={line.id} className="break-words">
                        {line.text} — {line.reason}
                      </li>
                    ))}
                    {hiddenExcluded > 0 && <li>외 {hiddenExcluded}개</li>}
                  </ul>
                </dd>
              </>
            )}
          </dl>
          {errorCount > 0 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>형식 오류가 있는 항목 {errorCount}개가 들어 있어요</span>
            </p>
          )}
          <p>승인은 되돌릴 수 없어요. 예약은 승인한 뒤 [예약 등록하기]에서 해요.</p>
        </div>
      }
    />
  )
}

interface OpsBulkApproveProps {
  bundleId: string
  /** 체크한 결정 전(검토중) 항목. */
  checked: readonly OpsItemRecord[]
  /** 체크하지 않은 결정 전(검토중) 항목. */
  excluded: readonly OpsItemRecord[]
  onApproved: (result: { approved: number; skipped: number; patternProposals: number }) => void
  /** 그 사이 다른 곳에서 처리돼 하나도 바뀌지 않았을 때(화면을 새로 읽는다). */
  onConflict: () => void
}

export function OpsBulkApprove({ bundleId, checked, excluded, onApproved, onConflict }: OpsBulkApproveProps) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const empty = checked.length === 0

  const confirm = async () => {
    setPending(true)
    setError(null)
    const result = await postDecision(bundleId, { action: 'bulk_approve', itemIds: checked.map((item) => item.id) })
    setPending(false)
    if (result.ok) {
      setOpen(false)
      onApproved({
        approved: Number(result.data.approved) || 0,
        skipped: Number(result.data.skipped) || 0,
        patternProposals: Number(result.data.patternProposals) || 0,
      })
      return
    }
    setError(result.error)
    if (result.status === 409) onConflict()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        disabled={empty}
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        {checked.length}개 승인하기
      </Button>
      {empty && <span className="text-xs text-muted-foreground">승인할 항목을 골라 주세요</span>}

      {open && (
        <OpsDialogShell open onOpenChange={setOpen} pending={pending} wide>
          <OpsBulkApprovePanel
            summary={buildBulkSummary(checked, excluded)}
            pending={pending}
            error={error}
            onConfirm={confirm}
            onCancel={() => setOpen(false)}
          />
        </OpsDialogShell>
      )}
    </div>
  )
}
