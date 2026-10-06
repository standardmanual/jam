'use client'

import { useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Textarea } from '@/components/admin/ui/textarea'
import { MAX_DECISION_REASON_CHARS } from '@/lib/admin/opsInbox/constants'
import {
  END_BUTTON,
  END_CLOSE,
  END_GUIDANCE,
  END_IRREVERSIBLE,
  END_LOADING,
  END_PENDING,
  END_REASON_HELP,
  END_REASON_LABEL,
  END_SAMPLE_NOTICE,
  END_STILL_LIVE_NOTE,
  END_TITLE,
  buildEndPreview,
  endItemEnded,
  endNeedsRefresh,
  endStillLiveTitle,
  type EndPreviewView,
} from '@/lib/admin/opsInbox/executeView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { postEnd } from './executeClient'
import { OpsConfirmPanel, OpsDialogShell } from './OpsConfirmDialog'
import { itemSummaryLine } from './OpsItemActions'

/**
 * 공개 뒤 지금 종료 줄과 확인창 (티켓 20261006_1038, 상위 20260930_1500 ⑪-b, 운영툴 PRD §8.7). 「게재중」 항목의 `detailFooter` 자리를 채운다. 틀은 `OpsCancelItem.tsx`다.
 *
 * 안내 한 줄과 [지금 종료하기](외곽선 변형 — 붉은 면은 확인창의 확인 버튼 하나뿐이다)를 그린다. 누르면 확인창이 열리고, **열 때 미리 보기
 * 요청(`{ dryRun: true }`)을 새로 보내** 종류별 문단(유저에게 생길 일·영향 유저 수)과 함께 끝나지 않는 게재 중 항목을 보인다. 사유는 선택(500자)이고 비워도 된다.
 * 시험 묶음이면 실제 자원이 바뀌지 않는다는 것을, 마지막 줄로 되돌릴 수 없다는 것을 알린다.
 *
 * 실패는 창 안 인라인이고 창은 유지한다(미리 보기가 실패하면 확인 버튼을 끈다). 그사이 바뀐 항목(409)이면 화면을 새로 읽는다. 되돌림까지 실패한 500(`itemEnded`)은
 * 항목이 「종료」로 바뀌어 창이 사라지므로 창을 닫고 서버 문장을 토스트로 보인다(`onItemEnded`). 규칙은 서버가 판정하고, 이 파일은 응답을 읽어 그리기만 한다(`executeView.ts`).
 */

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {note && <p className="text-xs">{note}</p>}
      {children}
    </section>
  )
}

interface OpsEndPanelProps {
  /** 확인창 설명: 종료하려는 항목의 한 줄 요약. */
  summary: ReactNode
  /** 미리 보기 결과로 만든 내용. 아직 없으면(불러오는 중이거나 실패) null이다. */
  view: EndPreviewView | null
  loading?: boolean
  pending?: boolean
  error?: string | null
  /** 앞뒤 공백을 뗀 사유를 넘긴다(비었으면 빈 문자열). */
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** 확인창의 알맹이(포털 밖). 사유 글은 이 안에서 들고 있어 창을 닫았다 열면 비어 있다(`OpsCancelPanel` 선례). */
export function OpsEndPanel({ summary, view, loading, pending, error, onConfirm, onCancel }: OpsEndPanelProps) {
  const [reason, setReason] = useState('')

  return (
    <OpsConfirmPanel
      title={END_TITLE}
      description={summary}
      tone="destructive"
      confirmLabel={END_BUTTON}
      pendingLabel={END_PENDING}
      cancelLabel={END_CLOSE}
      confirmDisabled={!view}
      pending={pending}
      error={error}
      onConfirm={() => onConfirm(reason.trim())}
      onCancel={onCancel}
    >
      {loading && <p className="text-sm text-muted-foreground">{END_LOADING}</p>}
      {view && (view.effectLines.length > 0 || view.stillLive.length > 0) && (
        <div className="max-h-[40vh] space-y-4 overflow-y-auto pr-1 text-sm text-muted-foreground">
          {view.effectLines.length > 0 && (
            <div className="space-y-1">
              {view.effectLines.map((line) => (
                <p key={line} className="break-words">
                  {line}
                </p>
              ))}
            </div>
          )}
          {view.stillLive.length > 0 && (
            <Section title={endStillLiveTitle(view.stillLive.length)} note={END_STILL_LIVE_NOTE}>
              <ul className="space-y-1">
                {view.stillLive.map((item) => (
                  <li key={item.id} className="break-words text-foreground">
                    {item.line}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
      {view?.isSample && <p className="text-sm text-muted-foreground">{END_SAMPLE_NOTICE}</p>}
      <div className="space-y-1.5">
        <label htmlFor="ops-end-reason" className="text-sm font-medium text-foreground">
          {END_REASON_LABEL}
        </label>
        <Textarea
          id="ops-end-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_DECISION_REASON_CHARS}
          rows={3}
          disabled={pending}
        />
        <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <span>{END_REASON_HELP}</span>
          <span className="shrink-0 tabular-nums">
            {reason.length}/{MAX_DECISION_REASON_CHARS}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{END_IRREVERSIBLE}</p>
    </OpsConfirmPanel>
  )
}

interface OpsEndItemProps {
  bundleId: string
  item: OpsItemRecord
  /** 화면이 들고 있는 항목. 계속 보이는 항목의 한 줄 요약을 붙이는 데만 쓴다. */
  items: readonly OpsItemRecord[]
  /** 지금 종료가 끝났다(성공 응답 본문을 넘긴다. 창은 이미 닫혔다). 토스트와 화면 새로 읽기는 호출한 쪽이 한다. */
  onEnded: (data: Record<string, unknown>) => void
  /** 그사이 바뀌어 화면을 새로 읽어야 한다. */
  onConflict: () => void
  /** 항목은 「종료」로 바뀌었는데 자원 종료를 되돌리지 못했다(서버 문장을 넘긴다. 창은 이미 닫혔다). 토스트와 화면 새로 읽기는 호출한 쪽이 한다. */
  onItemEnded: (message: string) => void
}

export function OpsEndItem({ bundleId, item, items, onEnded, onConflict, onItemEnded }: OpsEndItemProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<EndPreviewView | null>(null)
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
    const result = await postEnd(bundleId, item.id, { dryRun: true })
    if (run !== previewRun.current) return
    setLoading(false)
    if (result.ok) {
      setView(buildEndPreview(result.data, item.id, items, itemSummaryLine))
      return
    }
    setError(result.error)
    if (endNeedsRefresh(result.status, result.data)) onConflict()
  }

  const closeDialog = () => {
    previewRun.current += 1
    setLoading(false)
    setOpen(false)
  }

  const confirm = async (reason: string) => {
    if (!view) return
    setPending(true)
    setError(null)
    const result = await postEnd(bundleId, item.id, reason ? { reason } : {})
    setPending(false)
    if (result.ok) {
      closeDialog()
      onEnded(result.data)
      return
    }
    if (endItemEnded(result.data)) {
      closeDialog()
      onItemEnded(result.error)
      return
    }
    setError(result.error)
    if (endNeedsRefresh(result.status, result.data)) onConflict()
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{END_GUIDANCE}</p>
        <Button type="button" variant="outline" onClick={() => void openDialog()}>
          {END_BUTTON}
        </Button>
      </div>

      {open && (
        <OpsDialogShell open onOpenChange={(next) => !next && closeDialog()} pending={pending} wide>
          <OpsEndPanel
            summary={<p className="break-words font-medium text-foreground">{itemSummaryLine(item)}</p>}
            view={view}
            loading={loading}
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
