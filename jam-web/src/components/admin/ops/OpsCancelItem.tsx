'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Textarea } from '@/components/admin/ui/textarea'
import { MAX_DECISION_REASON_CHARS } from '@/lib/admin/opsInbox/constants'
import {
  CANCEL_BUTTON,
  CANCEL_CLOSE,
  CANCEL_GUIDANCE,
  CANCEL_LOADING,
  CANCEL_PENDING,
  CANCEL_REASON_HELP,
  CANCEL_REASON_LABEL,
  CANCEL_TITLE,
  buildCancelPreview,
  cancelAlsoTitle,
  cancelBlockersTitle,
  cancelIrreversibleNotice,
  cancelNeedsRefresh,
  type CancelPreviewView,
} from '@/lib/admin/opsInbox/executeView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { postCancel } from './executeClient'
import { OpsConfirmPanel, OpsDialogShell } from './OpsConfirmDialog'
import { itemSummaryLine } from './OpsItemActions'

/**
 * 공개 전 취소 줄과 확인창 (티켓 20261002_1649, 상위 20260930_1500 ⑤-b, 운영툴 PRD §8.7). 「예약됨」 항목의 `detailFooter` 자리를 채운다.
 *
 * 안내 한 줄과 [공개 전 취소하기](외곽선 변형 — 붉은 면은 확인창의 확인 버튼 하나뿐이다)를 그린다. 누르면 확인창이 열리고, **열 때 미리 보기
 * 요청(`{ dryRun: true }`)을 새로 보내** 함께 취소될 항목(가리키는 「예약됨」 항목)과 취소를 막는 항목(게재 중·준비중)과 서버 이유를 보인다.
 * 막는 항목이 있으면 확인 버튼이 꺼진다. 사유는 선택(500자)이고 비워도 된다. 되돌릴 수 없다는 것과 예약해 둔 자원도 지워진다는 것(시험 묶음은 지울 자원이
 * 없다는 것)을 마지막 줄로 알린다.
 *
 * 실패는 창 안 인라인이고 창은 유지한다(미리 보기가 실패하면 확인 버튼을 끈다). 그사이 바뀐 항목(409)이거나 일부만 취소했으면 화면을 새로 읽는다
 * (`cancelNeedsRefresh`). 사전 점검과 마찬가지로 규칙은 서버가 판정하고, 이 파일은 응답을 읽어 그리기만 한다(`executeView.ts`).
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

interface OpsCancelPanelProps {
  /** 확인창 설명: 취소하려는 항목의 한 줄 요약. */
  summary: ReactNode
  /** 미리 보기 결과로 만든 내용. 아직 없으면(불러오는 중이거나 실패) null이다. */
  view: CancelPreviewView | null
  loading?: boolean
  isSample: boolean
  pending?: boolean
  error?: string | null
  /** 앞뒤 공백을 뗀 사유를 넘긴다(비었으면 빈 문자열). */
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** 확인창의 알맹이(포털 밖). 사유 글은 이 안에서 들고 있어 창을 닫았다 열면 비어 있다(`OpsRejectPanel` 선례). */
export function OpsCancelPanel({ summary, view, loading, isSample, pending, error, onConfirm, onCancel }: OpsCancelPanelProps) {
  const [reason, setReason] = useState('')

  return (
    <OpsConfirmPanel
      title={CANCEL_TITLE}
      description={summary}
      tone="destructive"
      confirmLabel={view?.confirmLabel ?? CANCEL_BUTTON}
      pendingLabel={CANCEL_PENDING}
      cancelLabel={CANCEL_CLOSE}
      confirmDisabled={!view || !view.canConfirm}
      pending={pending}
      error={error}
      onConfirm={() => onConfirm(reason.trim())}
      onCancel={onCancel}
    >
      {loading && <p className="text-sm text-muted-foreground">{CANCEL_LOADING}</p>}
      {view && (view.also.length > 0 || view.blockers.length > 0) && (
        <div className="max-h-[40vh] space-y-4 overflow-y-auto pr-1 text-sm text-muted-foreground">
          {view.also.length > 0 && (
            <Section title={cancelAlsoTitle(view.also.length)}>
              <ul className="space-y-1">
                {view.also.map((item) => (
                  <li key={item.id} className="break-words text-foreground">
                    {item.line}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {view.blockers.length > 0 && (
            <Section title={cancelBlockersTitle(view.blockers.length)}>
              <ul className="space-y-1">
                {view.blockers.map((item) => (
                  <li key={item.id} className="break-words">
                    <span className="text-foreground">{item.line}</span>
                    {item.reason && <span className="block text-xs">{item.reason}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor="ops-cancel-reason" className="text-sm font-medium text-foreground">
          {CANCEL_REASON_LABEL}
        </label>
        <Textarea
          id="ops-cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_DECISION_REASON_CHARS}
          rows={3}
          disabled={pending}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <span>{CANCEL_REASON_HELP}</span>
          <span className="shrink-0 tabular-nums">
            {reason.length}/{MAX_DECISION_REASON_CHARS}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{cancelIrreversibleNotice(isSample)}</p>
    </OpsConfirmPanel>
  )
}

interface OpsCancelItemProps {
  bundleId: string
  item: OpsItemRecord
  /** 화면이 들고 있는 항목. 함께 취소될 항목·막는 항목의 한 줄 요약을 붙이는 데만 쓴다. */
  items: readonly OpsItemRecord[]
  isSample: boolean
  /** 취소가 끝났다(성공 응답 본문을 넘긴다. 창은 이미 닫혔다). 토스트와 화면 새로 읽기는 호출한 쪽이 한다. */
  onCancelled: (data: Record<string, unknown>) => void
  /** 그사이 바뀌었거나 일부만 취소해 화면을 새로 읽어야 한다. */
  onConflict: () => void
}

export function OpsCancelItem({ bundleId, item, items, isSample, onCancelled, onConflict }: OpsCancelItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<CancelPreviewView | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 미리 보기 요청의 순번. 창을 닫았다 다시 열면 앞선 요청의 응답은 버린다. */
  const previewRun = useRef(0)

  const openDialog = async () => {
    const run = ++previewRun.current
    setView(null)
    setError(null)
    setLoading(true)
    setOpen(true)
    const result = await postCancel(bundleId, item.id, { dryRun: true })
    if (run !== previewRun.current) return
    setLoading(false)
    if (result.ok) {
      setView(buildCancelPreview(result.data, item.id, items, itemSummaryLine))
      return
    }
    setError(result.error)
    if (cancelNeedsRefresh(result.status, result.data)) onConflict()
  }

  const closeDialog = () => {
    previewRun.current += 1
    setLoading(false)
    setOpen(false)
  }

  const confirm = async (reason: string) => {
    if (!view || !view.canConfirm) return
    setPending(true)
    setError(null)
    const result = await postCancel(bundleId, item.id, reason ? { reason } : {})
    setPending(false)
    if (result.ok) {
      closeDialog()
      onCancelled(result.data)
      return
    }
    setError(result.error)
    if (cancelNeedsRefresh(result.status, result.data)) onConflict()
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{CANCEL_GUIDANCE}</p>
        <Button type="button" variant="outline" onClick={() => void openDialog()}>
          {CANCEL_BUTTON}
        </Button>
      </div>

      {open && (
        <OpsDialogShell open onOpenChange={(next) => !next && closeDialog()} pending={pending} wide>
          <OpsCancelPanel
            summary={<p className="break-words font-medium text-foreground">{itemSummaryLine(item)}</p>}
            view={view}
            loading={loading}
            isSample={isSample}
            pending={pending}
            error={error}
            onConfirm={(reason) => void confirm(reason)}
            onCancel={closeDialog}
          />
        </OpsDialogShell>
      )}
    </>
  )
}
