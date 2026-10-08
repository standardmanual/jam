'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import type { OpsPatternRejectionsResult } from '@/lib/admin/opsPatterns/tasteWrite'
import {
  EVIDENCE_EMPTY_TEXT,
  EVIDENCE_KEEP_LABEL,
  EVIDENCE_LINK_LABEL,
  EVIDENCE_LOADING_TEXT,
  EVIDENCE_LOAD_FAILED_TEXT,
  EVIDENCE_MORE_LABEL,
  EVIDENCE_NONE_LABEL,
  EVIDENCE_NONE_VALUE,
  EVIDENCE_RETRY_LABEL,
  evidenceLegendText,
  needsKeepEvidenceOption,
  rejectionLineView,
} from '@/lib/admin/opsPatterns/tasteDraft'

/**
 * 취향 신호의 근거 선택 (티켓 20261008_1754, 상위 20260930_1503 ⑩b-2, 채원 판정 승인 16·17). 표시 전용 부품이다 — 반려 기록을 읽는 일은 편집 부품이 맡는다.
 *
 * `fieldset`/`legend`로 묶은 네이티브 라디오 하나다(새 ui 부품 없음). 첫 선택지는 「근거 없이 확정」이고, 확정 신호에 붙은 근거가 불러온 목록에 없으면 그 위에
 * 「지금 붙은 근거 유지」를 둔다. 반려 줄의 [기획 보기] 링크는 라디오 `label` 밖에 있어 링크를 눌러도 선택이 바뀌지 않는다.
 * 읽기가 실패해도 「근거 없이 확정」과 붙은 근거 유지는 고를 수 있다. 반려 이유·항목 이름은 사람이 쓴 글이라 텍스트 노드로만 그린다.
 */

export type EvidencePickerState = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; data: OpsPatternRejectionsResult }

export interface OpsEvidencePickerProps {
  state: EvidencePickerState
  /** 지금 이 신호에 붙은 근거 결정 ID(없으면 `null`). */
  attachedId: string | null
  /** 선택한 값: 근거 결정 ID, 빈 문자열은 「근거 없이 확정」. */
  choice: string
  onChoice: (value: string) => void
  /** 서버가 근거를 거절했을 때의 문장(근거 묶음 아래). */
  error?: string | null
  disabled?: boolean
  /** 더 보기를 읽는 중 / 실패. */
  moreLoading?: boolean
  moreFailed?: boolean
  onRetry: () => void
  onMore: () => void
  /** 라디오 `name`과 `id`의 접두사(한 화면에 여러 줄이 있어도 겹치지 않게). */
  idPrefix: string
}

const RADIO_CLASS = 'mt-1 size-4 shrink-0 accent-neutral-900'
const TEXT_CLASS = 'break-keep wrap-break-word text-pretty'

function Option({
  name,
  id,
  value,
  choice,
  disabled,
  onChoice,
  children,
}: {
  name: string
  id: string
  value: string
  choice: string
  disabled?: boolean
  onChoice: (value: string) => void
  children: ReactNode
}) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-sm">
      <input type="radio" id={id} name={name} value={value} checked={choice === value} disabled={disabled} onChange={() => onChoice(value)} className={RADIO_CLASS} />
      <span className={`min-w-0 ${TEXT_CLASS}`}>{children}</span>
    </label>
  )
}

export function OpsEvidencePicker({
  state,
  attachedId,
  choice,
  onChoice,
  error,
  disabled,
  moreLoading,
  moreFailed,
  onRetry,
  onMore,
  idPrefix,
}: OpsEvidencePickerProps) {
  const name = `${idPrefix}-evidence`
  const errorId = `${idPrefix}-evidence-error`
  const loaded = state.status === 'ready' ? state.data.rejections : []
  const keepCurrent = needsKeepEvidenceOption(attachedId, loaded)
  return (
    <fieldset className="min-w-0 space-y-2" aria-describedby={error ? errorId : undefined}>
      <legend className={`text-sm font-medium ${TEXT_CLASS} text-balance`}>{evidenceLegendText(state.status === 'ready' ? state.data.total : null)}</legend>
      <ul className="space-y-2">
        {keepCurrent && attachedId !== null && (
          <li className="flex items-start gap-2">
            <Option name={name} id={`${name}-keep`} value={attachedId} choice={choice} disabled={disabled} onChoice={onChoice}>
              {EVIDENCE_KEEP_LABEL}
            </Option>
          </li>
        )}
        <li className="flex items-start gap-2">
          <Option name={name} id={`${name}-none`} value={EVIDENCE_NONE_VALUE} choice={choice} disabled={disabled} onChoice={onChoice}>
            {EVIDENCE_NONE_LABEL}
          </Option>
        </li>
        {loaded.map((record) => {
          const line = rejectionLineView(record)
          return (
            <li key={line.id} className="flex items-start gap-2">
              <Option name={name} id={`${name}-${line.id}`} value={line.id} choice={choice} disabled={disabled} onChoice={onChoice}>
                <span className="tabular-nums text-muted-foreground">{line.dateText}</span> · {line.sentence} · <span className="font-medium">{line.name}</span>
                {line.reason !== null && <span className="block whitespace-pre-wrap text-muted-foreground">{line.reason}</span>}
              </Option>
              {line.href !== null && (
                <Link href={line.href} className="shrink-0 whitespace-nowrap py-0.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                  {EVIDENCE_LINK_LABEL}
                </Link>
              )}
            </li>
          )
        })}
      </ul>

      {state.status === 'loading' && (
        <p role="status" className={`text-xs text-muted-foreground ${TEXT_CLASS}`}>
          {EVIDENCE_LOADING_TEXT}
        </p>
      )}
      {state.status === 'failed' && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p role="status" className={`text-sm text-muted-foreground ${TEXT_CLASS}`}>
            {EVIDENCE_LOAD_FAILED_TEXT}
          </p>
          <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" disabled={disabled} onClick={onRetry}>
            {EVIDENCE_RETRY_LABEL}
          </Button>
        </div>
      )}
      {state.status === 'ready' && state.data.rejections.length === 0 && <p className={`text-sm text-muted-foreground ${TEXT_CLASS}`}>{EVIDENCE_EMPTY_TEXT}</p>}
      {state.status === 'ready' && state.data.hasMore && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Button type="button" variant="outline" size="sm" className="whitespace-nowrap" disabled={disabled || moreLoading} onClick={onMore}>
            {EVIDENCE_MORE_LABEL}
          </Button>
          {moreFailed && (
            <p role="status" className={`text-sm text-muted-foreground ${TEXT_CLASS}`}>
              {EVIDENCE_LOAD_FAILED_TEXT}
            </p>
          )}
        </div>
      )}
      {error && (
        <p id={errorId} className={`text-sm font-medium text-destructive ${TEXT_CLASS}`}>
          {error}
        </p>
      )}
    </fieldset>
  )
}
