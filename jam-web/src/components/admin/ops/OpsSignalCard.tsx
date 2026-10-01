'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { IconPencil, IconRuler2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import {
  CANCEL_CHANGES_LABEL,
  RETRY_SAVE_LABEL,
  SAVED_LIVE_MESSAGE,
  SAVE_LABEL,
  SAVING_LABEL,
} from '@/lib/admin/opsInbox/balance/settings'
import type { OpsSignalThresholdKey } from '@/lib/admin/opsSignals/thresholds'
import {
  NOT_MEASURED_CHIP_LABEL,
  NOT_MEASURED_NOTE,
  SIGNAL_CONFLICT_MESSAGE,
  SIGNAL_REVERTED_LIVE_MESSAGE,
  SIGNAL_SAVED_TOAST_DESCRIPTION,
  UNREADABLE_STORED_MESSAGE,
  changedCountChipLabel,
  checkSignalDraft,
  draftFromSignalRecords,
  recordMapOf,
  signalAnchorId,
  signalChangedCount,
  signalDraftChangedKeys,
  signalDraftToPatch,
  signalLastChangeLine,
  signalResultSentence,
  signalRevertedToastTitle,
  signalSavedToastTitle,
  type SignalCardSpec,
  type SignalDraft,
  type SignalRecordMap,
  type SignalThresholdRecord,
} from '@/lib/admin/opsSignals/thresholdSettings'
import { cn } from '@/lib/utils'
import { fetchSignalThresholds, patchSignalThresholds, revertSignalThreshold } from './ruleClient'
import { OpsSignalFields } from './OpsSignalFields'
import { SaveFailureAlerts, UnsavedChip, judgeFailedResponse, useFlash, type CardFailure } from './OpsRuleCardParts'
import { Chip } from './OpsStatusBadge'

/**
 * 신호 기준값 카드 한 장 (티켓 20260930_1459 조각 C, 채원 확정 설계 「조각 C (S7 신호 기준값 구역)」). 신호 하나가 카드 한 장이고, 카드 하나가 작은 `<form>`이라
 * Enter로 저장하며 **카드의 칸을 한 번에 저장한다**(`PATCH /api/admin/ops-rules/signals/[signalKey]`, 고친 칸만 보낸다). 앵커는 `#signal-<신호 키>`다.
 * 신호를 끄는 칸은 두지 않는다(신호는 승인을 막지 않고, 끄는 것은 이 티켓의 범위가 아니다).
 *
 * 흐름: 고치는 동안 「저장 전」 칩과 결과 문장이 바로 바뀐다(칸이 하나라도 틀리면 문장 대신 칸 오류만) → 칸을 떠나면 오류가 보이고 [저장하기]가 비활성이다
 * → 저장은 확인창 없이 바로 한다(기본값으로 되돌릴 수 있다) → 성공하면 토스트, 1.2초 잔상, 「바꾼 값 N」·마지막 변경 줄 갱신, 화면 읽기 전용 알림.
 * 칸별 [기본값으로 되돌리기]는 그 칸의 행만 지우고 **같은 카드 다른 칸의 입력 중 값은 남긴다**. 실패·409(그사이 다른 곳에서 바뀜)는 밸런스 규칙 카드와 같은 방식이다
 * (`OpsRuleCardParts`). 고치지 않은 칸은 저장하지 않으므로 읽을 수 없는 저장값이 있어도 다른 칸을 저장할 수 있다.
 *
 * 초안은 저장·최신 값 불러오기·바꾼 내용 취소로만 다시 만든다(되돌리기는 그 칸만 기본값으로). 구역이 서버에서 새로 읽히면(화면 새로 읽기) 부모가 카드를 새로 그린다.
 */

export interface OpsSignalCardProps {
  card: SignalCardSpec
  /** 카드 칸들의 저장된 상태. */
  records: SignalRecordMap
  /** 저장·되돌리기·최신 값 불러오기로 칸이 바뀌었다. 부모가 구역의 값을 갱신한다. */
  onRecords: (records: SignalThresholdRecord[]) => void
}

export function OpsSignalCard({ card, records, onRecords }: OpsSignalCardProps) {
  const idBase = signalAnchorId(card.signal)
  const titleId = `${idBase}-title`

  const [draft, setDraft] = useState<SignalDraft>(() => draftFromSignalRecords(card, records))
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<CardFailure | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [reverting, setReverting] = useState(false)
  const { flash, start: startFlash } = useFlash()
  const [liveMessage, setLiveMessage] = useState('')

  const check = useMemo(() => checkSignalDraft(card, records, draft), [card, records, draft])
  const changedKeys = useMemo(() => new Set<string>(signalDraftChangedKeys(card, records, draft)), [card, records, draft])
  const hasChanges = changedKeys.size > 0
  const hasErrors = Object.keys(check.errors).length > 0
  const busy = saving || reloading || reverting

  const visibleErrors = useMemo(() => {
    const shown: Record<string, string> = {}
    for (const [key, message] of Object.entries(check.errors)) {
      // 고친 칸의 오류는 칸을 떠난 뒤에, 고치지 않은 칸의 오류(맞물린 짝)는 바로 보인다.
      if (message && (touched.has(key) || !changedKeys.has(key))) shown[key] = message
    }
    // 저장된 값을 읽을 수 없는 칸(범위 밖·모양 틀림)은 아직 고치지 않았어도 처음부터 문구를 보인다.
    for (const field of card.editableFields) {
      if (records[field.key]?.unreadable && !changedKeys.has(field.key) && shown[field.key] === undefined) {
        shown[field.key] = UNREADABLE_STORED_MESSAGE
      }
    }
    return { ...shown, ...serverErrors }
  }, [check.errors, touched, changedKeys, card, records, serverErrors])

  const sentence = signalResultSentence(card, records, draft)
  const changedCount = signalChangedCount(card, records)
  const lastLine = signalLastChangeLine(card, records)

  function changeDraft(next: SignalDraft) {
    setDraft(next)
    setServerErrors({})
    setLiveMessage('')
  }

  function touch(key: OpsSignalThresholdKey) {
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)))
  }

  /** 초안을 저장된 칸들로 다시 만든다(저장 성공·최신 값 불러오기·바꾼 내용 취소). */
  function resetFrom(source: SignalRecordMap) {
    setDraft(draftFromSignalRecords(card, source))
    setTouched(new Set())
    setServerErrors({})
  }

  async function runSave() {
    setSaving(true)
    setFailure(null)
    setServerErrors({})
    setLiveMessage('')
    const res = await patchSignalThresholds(card.signal, signalDraftToPatch(card, records, draft))
    setSaving(false)

    if (res.ok) {
      resetFrom(recordMapOf(res.thresholds))
      onRecords(res.thresholds)
      // 서버가 같은 값으로 본 저장(예: 「6」→「06」)은 아무것도 쓰지 않았으므로 바꿨다고 알리지 않는다.
      if (!res.changed) return
      startFlash()
      setLiveMessage(SAVED_LIVE_MESSAGE)
      toast.success(signalSavedToastTitle(card.name), { description: SIGNAL_SAVED_TOAST_DESCRIPTION })
      return
    }
    const judged = judgeFailedResponse(res)
    const onThisCard = Object.keys(judged.fieldErrors).filter((key) => card.editableFields.some((field) => field.key === key))
    if (res.status === 400 && Object.keys(judged.fieldErrors).length > 0 && onThisCard.length === 0) {
      // 이 카드의 칸에 붙지 않는 오류(낯선 칸 등)는 카드 안 알림으로 알린다.
      setFailure({ kind: 'error', message: res.error })
      return
    }
    setServerErrors(judged.fieldErrors)
    setFailure(judged.failure)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !hasChanges || hasErrors) return
    void runSave()
  }

  async function revert(key: OpsSignalThresholdKey) {
    const stamp = records[key]?.updatedAt
    if (busy || !stamp) return
    setReverting(true)
    setFailure(null)
    setServerErrors({})
    setLiveMessage('')
    const res = await revertSignalThreshold(card.signal, key, stamp)
    setReverting(false)

    if (res.ok) {
      onRecords([res.threshold])
      // 그 칸만 기본값으로 바꾼다. 같은 카드 다른 칸의 입력 중 값은 그대로 둔다.
      setDraft((current) => ({ ...current, [key]: String(res.threshold.value) }))
      setTouched((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
      startFlash()
      setLiveMessage(SIGNAL_REVERTED_LIVE_MESSAGE)
      toast.success(signalRevertedToastTitle(card.name))
      return
    }
    setFailure(res.status === 409 ? { kind: 'conflict' } : { kind: 'error', message: res.error })
  }

  function cancelChanges() {
    resetFrom(records)
    setFailure(null)
    setLiveMessage('')
  }

  async function reloadLatest() {
    setReloading(true)
    const res = await fetchSignalThresholds()
    setReloading(false)
    if (!res.ok) {
      setFailure({ kind: 'reload' })
      return
    }
    // 최신 값으로 카드 초안 전체를 새로 만든다.
    setFailure(null)
    resetFrom(recordMapOf(res.thresholds))
    onRecords(res.thresholds)
  }

  return (
    <Card id={idBase} className={cn('scroll-mt-32 transition-colors motion-reduce:transition-none', flash && 'bg-muted')}>
      <form
        onSubmit={submit}
        // 오류가 있으면 [저장하기]가 비활성이라 Enter 제출이 막힌다. 저장을 시도한 순간 오류 칸의 문구를 모두 보인다.
        onKeyDown={(event) => event.key === 'Enter' && hasErrors && setTouched(new Set([...touched, ...Object.keys(check.errors)]))}
        aria-labelledby={titleId}
        className="@container space-y-4 p-5"
        noValidate
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 id={titleId} className="text-base font-semibold">
            {card.name}
          </h4>
          {card.notMeasured && (
            <Chip tone="muted" Icon={IconRuler2}>
              {NOT_MEASURED_CHIP_LABEL}
            </Chip>
          )}
          {changedCount > 0 && (
            <Chip tone="secondary" Icon={IconPencil}>
              {changedCountChipLabel(changedCount)}
            </Chip>
          )}
          {hasChanges && <UnsavedChip />}
        </div>

        {card.notMeasured && <p className="break-words text-sm text-muted-foreground">{NOT_MEASURED_NOTE}</p>}

        <OpsSignalFields
          card={card}
          records={records}
          draft={draft}
          onChange={changeDraft}
          errors={visibleErrors}
          onTouch={touch}
          onRevert={(key) => void revert(key)}
          disabled={busy}
          idBase={idBase}
        />

        {sentence && <p className="break-words text-sm">{sentence}</p>}

        {lastLine && <p className="break-words text-xs text-muted-foreground">{lastLine}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !hasChanges || hasErrors}>
            {saving ? SAVING_LABEL : failure?.kind === 'error' ? RETRY_SAVE_LABEL : SAVE_LABEL}
          </Button>
          {hasChanges && (
            <Button type="button" variant="ghost" disabled={busy} onClick={cancelChanges}>
              {CANCEL_CHANGES_LABEL}
            </Button>
          )}
        </div>

        <SaveFailureAlerts failure={failure} conflictMessage={SIGNAL_CONFLICT_MESSAGE} reloading={reloading} onReload={() => void reloadLatest()} />

        <p className="sr-only" aria-live="polite">
          {liveMessage}
        </p>
      </form>
    </Card>
  )
}
