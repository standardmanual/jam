'use client'

import { useRef, useState, type ReactNode } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import {
  EXECUTE_APPROVE_IRREVERSIBLE,
  EXECUTE_BADGE_PREVIEW_FAILED,
  EXECUTE_BADGE_PREVIEW_LOADING,
  EXECUTE_BADGE_PREVIEW_TITLE,
  EXECUTE_FAIL_CLOSE_APPROVING_NOTE,
  EXECUTE_FAIL_CLOSE_NOTE,
  EXECUTE_LOADING,
  EXECUTE_NOTHING_TO_RUN,
  EXECUTE_SAMPLE_NOTICE,
  EXECUTE_SUMMARY_TITLE,
  EXECUTE_WAITING_REASON,
  buildExecuteSummary,
  executeButtonLabel,
  narrowToChecked,
  readPrecheck,
  readyJamBadgeIds,
  type BadgePreviewSection,
  type ExecuteSummary,
  type SummaryItem,
} from '@/lib/admin/opsInbox/executeView'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { fetchBadgePreview, postExecute } from './executeClient'
import { OpsConfirmPanel, OpsDialogShell } from './OpsConfirmDialog'

/**
 * 「N건 승인하고 예약」 버튼과 요약창 (티켓 20261026_2031, 상위 20261026_2020 D1, 운영툴 PRD §7.3·§8). 단계 표시줄 오른쪽 `barAction` 슬롯을 채운다.
 *
 * 버튼 하나가 승인과 예약을 함께 한다. N은 체크한 검토중 항목(패턴 제안 제외)과 이미 승인돼 예약을 기다리는 항목의 합이다. 누르면 요약창이 열리고,
 * **열 때 사전 점검 요청(`{ dryRun: true, approve: true }`)을 새로 보내 그 결과로 그린다** — 요약이 곧 확인이다(확인창을 한 번 더 두지 않는다).
 * 사전 점검은 검토중 항목 전부를 대상으로 하므로 체크하지 않은 항목은 요약에서 뺀다(`narrowToChecked`). 확인하면 `{ itemIds, approve: true }`를 보낸다.
 * 구역은 승인할 항목 · 예약할 항목 · 기다리는 항목 · 예약할 수 없는 항목 · 실패로 닫을 항목 · 경고이고, 시험 묶음이면 자원을 만들지 않는다는 문장이 붙는다. 비어 있는 구역은 그리지 않는다.
 * 주 버튼은 예약할 항목이 있으면 「N건 승인하고 예약」, 없고 실패로 닫을 항목만 있으면 「실패로 닫기」, 둘 다 없으면 꺼진다.
 *
 * 예약할 JAM! 배지가 있으면 사전 점검 결과로 요약을 그린 뒤 **두 번째 요청**(`{ badgePreview: true, approve: true }`)을 따로 보내 「공개되면 바로 획득하는 유저」 구역을 채운다(티켓 20261005_1607 ⑨-b).
 * 구역은 「미리 세는 중이에요」로 시작해 배지마다 한 줄로 바뀌고, 느리거나 실패해도 요약창과 주 버튼은 영향을 받지 않는다(실패는 구역 안 문장이다). 예약할 JAM! 배지가 없으면 요청도 구역도 없다.
 *
 * 사전 점검은 서버가 한다: 이 파일은 레지스트리·카드 핸들러를 값으로 가져오지 않고, 응답을 읽어 그리기만 한다(`executeView.ts`).
 * 목록이 길면 창 안에서 스크롤한다(`AlertDialogContent`에 높이 제한이 없다). 실패는 창 안 인라인이고 창은 유지한다.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="break-keep wrap-break-word text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  )
}

function ItemName({ item }: { item: SummaryItem }) {
  return <span className="text-foreground">{item.name}</span>
}

interface OpsExecutePanelProps {
  /** 사전 점검 결과로 만든 구역. 아직 없으면(불러오는 중이거나 실패) null이다. */
  summary: ExecuteSummary | null
  /** 예약할 JAM! 배지의 소급 미리 세기 구역. 예약할 JAM! 배지가 없으면(요청을 보내지 않았으면) null이다. */
  badgePreview?: BadgePreviewSection | null
  loading?: boolean
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/** 요약창의 알맹이(포털 밖). */
export function OpsExecutePanel({ summary, badgePreview, loading, pending, error, onConfirm, onCancel }: OpsExecutePanelProps) {
  return (
    <OpsConfirmPanel
      title={EXECUTE_SUMMARY_TITLE}
      confirmLabel={summary?.confirmLabel ?? executeButtonLabel(0)}
      pendingLabel={summary?.pendingLabel}
      cancelLabel="닫기"
      confirmDisabled={!summary || summary.action === 'none'}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
      description={
        loading ? (
          <p>{EXECUTE_LOADING}</p>
        ) : summary ? (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
            {summary.approving.length > 0 && (
              <Section title={`승인할 항목 ${summary.approving.length}개`}>
                <ul className="space-y-1">
                  {summary.approving.map((item) => (
                    <li key={item.id} className="break-words">
                      <ItemName item={item} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {summary.ready.length > 0 && (
              <Section title={`예약할 항목 ${summary.readyCount}개`}>
                <ul className="space-y-1">
                  {summary.ready.map((entry) =>
                    entry.type === 'single' ? (
                      <li key={entry.item.id} className="break-words">
                        <ItemName item={entry.item} />
                      </li>
                    ) : (
                      <li key={entry.items[0].id}>
                        {/* 함께 예약되는 연결 묶음: 중첩 목록과 왼쪽 선으로 한 덩어리로 보인다. */}
                        <ul className="space-y-0.5 border-l-2 border-border pl-3">
                          {entry.items.map((item) => (
                            <li key={item.id} className="break-words">
                              <ItemName item={item} />
                            </li>
                          ))}
                        </ul>
                      </li>
                    )
                  )}
                </ul>
              </Section>
            )}
            {badgePreview && !(badgePreview.status === 'done' && badgePreview.lines.length === 0) && (
              <Section title={EXECUTE_BADGE_PREVIEW_TITLE}>
                {badgePreview.status === 'loading' && <p>{EXECUTE_BADGE_PREVIEW_LOADING}</p>}
                {badgePreview.status === 'failed' && <p>{EXECUTE_BADGE_PREVIEW_FAILED}</p>}
                {badgePreview.status === 'done' && (
                  <>
                    <ul className="space-y-1">
                      {badgePreview.lines.map((line) => (
                        <li key={line.id} className="break-words">
                          <ItemName item={line} />
                          <span className="block text-xs">{line.text}</span>
                        </li>
                      ))}
                    </ul>
                    {badgePreview.notes.map((note) => (
                      <p key={note} className="text-xs">
                        {note}
                      </p>
                    ))}
                  </>
                )}
              </Section>
            )}
            {summary.waiting.length > 0 && (
              <Section title={`기다리는 항목 ${summary.waiting.length}개`}>
                <ul className="space-y-1">
                  {summary.waiting.map((item) => (
                    <li key={item.id} className="break-words">
                      <ItemName item={item} />
                      <span className="block text-xs">{EXECUTE_WAITING_REASON}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {summary.blocked.length > 0 && (
              <Section title={`예약할 수 없는 항목 ${summary.blocked.length}개`}>
                <ul className="space-y-1">
                  {summary.blocked.map((item) => (
                    <li key={item.id} className="break-words">
                      <ItemName item={item} />
                      <span className="block text-xs">{item.reasons.join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {summary.failClose.length > 0 && (
              <Section title={`실패로 닫을 항목 ${summary.failClose.length}개`}>
                <ul className="space-y-1">
                  {summary.failClose.map((item) => (
                    <li key={item.id} className="break-words">
                      <ItemName item={item} />
                      <span className="block break-keep wrap-break-word text-xs">
                        {item.reason}. {item.approving ? EXECUTE_FAIL_CLOSE_APPROVING_NOTE : EXECUTE_FAIL_CLOSE_NOTE}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {summary.warnings.length > 0 && (
              <div className="space-y-2">
                {summary.warnings.map((warning, index) => (
                  <p key={index} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                    <IconAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      {warning.message}
                      {warning.names.length > 0 && <span className="block text-xs">{warning.names.join(' · ')}</span>}
                    </span>
                  </p>
                ))}
              </div>
            )}
            {summary.approving.length > 0 && <p className="break-keep wrap-break-word">{EXECUTE_APPROVE_IRREVERSIBLE}</p>}
            {summary.isSample && <p>{EXECUTE_SAMPLE_NOTICE}</p>}
          </div>
        ) : undefined
      }
    >
      {summary?.action === 'none' && <p className="text-sm font-medium text-foreground">{EXECUTE_NOTHING_TO_RUN}</p>}
    </OpsConfirmPanel>
  )
}

interface OpsExecuteBundleProps {
  bundleId: string
  /** 화면이 들고 있는 항목. 요약창이 항목 이름을 붙이는 데만 쓴다. */
  items: readonly OpsItemRecord[]
  /** 체크한 검토중 항목 ID(패턴 제안 제외). 요약창은 이 항목과 이미 승인된 항목만 대상으로 삼는다. */
  checkedReviewingIds: ReadonlySet<string>
  /** 버튼의 N: 체크한 검토중 항목(패턴 제안 제외) + 이미 승인돼 예약을 기다리는 항목(`execution.readyCount`). */
  approvableCount: number
  /**
   * 「승인됨」 항목 수(`execution.approvedCount`). N이 0이어도 승인된 항목이 있으면 버튼을 끄지 않는다 —
   * 예약할 수 없는 이유를 요약창에서 보고, 실패로 닫을 항목을 닫을 수 있어야 한다.
   */
  approvedCount: number
  isSample: boolean
  /** 실행이 끝났을 때(성공 응답 본문을 넘긴다). 창은 이미 닫혔다. */
  onExecuted: (data: Record<string, unknown>) => void
  /** 그사이 다른 곳에서 처리돼 하나도 실행하지 못했을 때(화면을 새로 읽는다). */
  onConflict: () => void
}

export function OpsExecuteBundle({ bundleId, items, checkedReviewingIds, approvableCount, approvedCount, isSample, onExecuted, onConflict }: OpsExecuteBundleProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<ExecuteSummary | null>(null)
  const [badgePreview, setBadgePreview] = useState<BadgePreviewSection | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 사전 점검 요청의 순번. 창을 닫았다 다시 열면 앞선 요청(배지 미리 세기 포함)의 응답은 버린다. */
  const precheckRun = useRef(0)
  const disabled = approvableCount === 0 && approvedCount === 0

  /** 두 번째 요청. 요약창이 이미 떠 있으므로 기다리지 않고, 실패해도 구역 안 문장으로만 알린다. */
  const loadBadgePreview = async (run: number, readyIds: ReadonlySet<string>) => {
    setBadgePreview({ status: 'loading' })
    const section = await fetchBadgePreview(bundleId, items, readyIds)
    if (run === precheckRun.current) setBadgePreview(section)
  }

  const openDialog = async () => {
    const run = ++precheckRun.current
    setSummary(null)
    setBadgePreview(null)
    setError(null)
    setLoading(true)
    setOpen(true)
    const result = await postExecute(bundleId, { dryRun: true, approve: true })
    if (run !== precheckRun.current) return
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const precheck = readPrecheck(result.data)
    const next = narrowToChecked(buildExecuteSummary(precheck, items, isSample), checkedReviewingIds)
    setSummary(next)
    // 이번에 예약할 JAM! 배지가 있을 때만 두 번째 요청을 보낸다.
    const scheduleIds = next.action === 'schedule' ? new Set(next.requestIds) : new Set<string>()
    if (readyJamBadgeIds({ ...precheck, ready: [...scheduleIds] }, items).length > 0) void loadBadgePreview(run, scheduleIds)
  }

  const closeDialog = () => {
    precheckRun.current += 1
    setLoading(false)
    setOpen(false)
  }

  const confirm = async () => {
    if (!summary || summary.action === 'none') return
    setPending(true)
    setError(null)
    const result = await postExecute(bundleId, { itemIds: summary.requestIds, approve: true })
    setPending(false)
    if (result.ok) {
      closeDialog()
      onExecuted(result.data)
      return
    }
    setError(result.error)
    if (result.status === 409) onConflict()
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" disabled={disabled} onClick={() => void openDialog()}>
        {executeButtonLabel(approvableCount)}
      </Button>
      {disabled && <span className="break-keep wrap-break-word text-xs text-muted-foreground">승인할 항목을 골라 주세요</span>}

      {open && (
        <OpsDialogShell open onOpenChange={(next) => !next && closeDialog()} pending={pending} wide>
          <OpsExecutePanel
            summary={summary}
            badgePreview={badgePreview}
            loading={loading}
            pending={pending}
            error={error}
            onConfirm={() => void confirm()}
            onCancel={closeDialog}
          />
        </OpsDialogShell>
      )}
    </div>
  )
}
