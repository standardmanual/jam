'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { IconRuler2 } from '@tabler/icons-react'
import { toast } from 'sonner'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import { Switch } from '@/components/admin/ui/switch'
import { cn } from '@/lib/utils'
import { BALANCE_RULE_NAMES, type BalanceRuleKey, type OpsRuleRecord, type PointRewardValue } from '@/lib/admin/opsInbox/balance/rules'
import { PROVISIONAL_CHIP_LABEL } from '@/lib/admin/opsInbox/balance/messages'
import {
  CANCEL_CHANGES_LABEL,
  CONFLICT_MESSAGE,
  ECONOMY_OFF_NOTE,
  ENABLED_LABELS,
  POINT_REWARD_OFF_NOTE,
  PROVISIONAL_HINT,
  RETRY_SAVE_LABEL,
  REVERT_LABEL,
  RULE_EASY_DESCRIPTIONS,
  RULE_OFF_NOTE,
  SAVED_LIVE_MESSAGE,
  SAVED_TOAST_DESCRIPTION,
  SAVE_LABEL,
  SAVING_LABEL,
  canRevertToPrevious,
  draftChanges,
  draftFieldErrors,
  draftFromRecord,
  draftToPatch,
  economyKeysOf,
  lastChangeLines,
  ruleAnchorId,
  savedToastTitle,
  shouldHintProvisional,
  type RuleDraft,
  type RulePatchBody,
} from '@/lib/admin/opsInbox/balance/settings'
import { fetchOpsRules, patchOpsRule } from './ruleClient'
import { OpsBalanceRuleFields } from './OpsBalanceRuleFields'
import { Chip } from './OpsStatusBadge'
import { SaveFailureAlerts, UnsavedChip, judgeFailedResponse, useFlash, type CardFailure } from './OpsRuleCardParts'

/**
 * 밸런스 규칙 카드 한 장 (티켓 20260930_1459 조각 B, 채원 확정 설계 「조각 B (S7 운영 설정)」). 카드 하나가 작은 `<form>`이라 Enter로 저장하고,
 * 켜기 스위치도 이 폼의 한 칸이다(켜기·값·수준·임시값을 한 번에 저장한다). 앵커 `#rule-<규칙 키>`는 기획 상세의 「밸런스 규칙 보기」가 온다.
 *
 * 흐름: 고치는 동안 「저장 전」 칩과 결과 문장이 바로 바뀐다 → 칸을 떠나면 오류가 보이고 [저장하기]가 비활성이다 → 저장은 확인창 없이 바로 한다
 * (서비스를 바꾸지 않고 직전 값으로 되돌릴 수 있다. 1818 원칙) → 성공하면 토스트, 1.2초 `bg-muted` 잔상, 마지막 변경 줄·직전 값 갱신,
 * 화면 읽기 전용 알림 「저장했어요」. 실패하면 카드 안 `Alert`에 문장과 「입력한 값은 그대로 있어요」, 버튼은 「다시 저장하기」다.
 * 409(그사이 다른 곳에서 바뀜)는 [최신 값 불러오기]로 규칙을 다시 읽는다. 서버 400의 `fieldErrors`는 같은 칸 아래에 나온다.
 *
 * 저장된 규칙(`record`)이 바뀌면(저장·최신 값 불러오기·화면 새로 읽기) 초안을 그 값으로 다시 만든다(렌더 중에 비교한다. effect 안에서 `setState`하지 않는다).
 */

export interface OpsRuleCardProps {
  ruleKey: BalanceRuleKey
  record: OpsRuleRecord
  /** 저장된 R5 값(R6·R7이 따라 읽는다). */
  pointRewardValue: PointRewardValue | null
  openCollectionsNow: number | null
  /** 저장했거나 최신 값을 불러왔다. 부모가 규칙 목록을 갱신한다. */
  onRecord: (record: OpsRuleRecord) => void
}

export function OpsRuleCard({ ruleKey, record, pointRewardValue, openCollectionsNow, onRecord }: OpsRuleCardProps) {
  const name = BALANCE_RULE_NAMES[ruleKey]
  const idBase = ruleAnchorId(ruleKey)
  const titleId = `${idBase}-title`

  const [draft, setDraft] = useState<RuleDraft>(() => draftFromRecord(record))
  const [baseStamp, setBaseStamp] = useState(record.updatedAt)
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<CardFailure | null>(null)
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const { flash, start: startFlash } = useFlash()
  const [savedLive, setSavedLive] = useState(false)

  // 저장된 규칙이 바뀌었으면 초안을 그 값으로 다시 만든다(저장·최신 값 불러오기·화면 새로 읽기).
  if (record.updatedAt !== baseStamp) {
    setBaseStamp(record.updatedAt)
    setDraft(draftFromRecord(record))
    setTouched(new Set())
    setServerErrors({})
    setFailure(null)
  }

  const changes = draftChanges(record, draft)
  const liveErrors = useMemo(() => draftFieldErrors(ruleKey, draft), [ruleKey, draft])
  const hasErrors = Object.keys(liveErrors).length > 0
  // 저장된 값부터 형식이 틀린 칸은 칸을 떠나기 전에도 문구를 보인다(이유 없이 [저장하기]만 비활성으로 보이지 않게).
  const savedErrors = useMemo(() => draftFieldErrors(ruleKey, draftFromRecord(record)), [ruleKey, record])
  const visibleErrors = useMemo(() => {
    const shown: Record<string, string> = {}
    for (const [path, message] of Object.entries(liveErrors)) if (touched.has(path) || path in savedErrors) shown[path] = message
    return { ...shown, ...serverErrors }
  }, [liveErrors, touched, serverErrors, savedErrors])

  const last = lastChangeLines(record)
  const showProvisionalChip = Object.values(draft.provisional).some(Boolean)
  const canRevert = canRevertToPrevious(record)
  const busy = saving || reloading

  function changeDraft(next: RuleDraft) {
    setDraft(next)
    setServerErrors({})
    setSavedLive(false)
  }

  function touch(path: string) {
    setTouched((current) => (current.has(path) ? current : new Set(current).add(path)))
  }

  async function runSave(body: RulePatchBody) {
    setSaving(true)
    setFailure(null)
    setServerErrors({})
    setSavedLive(false)
    const res = await patchOpsRule(record.ruleKey, { ...body, expectedUpdatedAt: record.updatedAt })
    setSaving(false)

    if (res.ok) {
      setDraft(draftFromRecord(res.rule))
      setTouched(new Set())
      onRecord(res.rule)
      // 서버가 같은 값으로 본 저장(예: 「6」→「06」)은 아무것도 쓰지 않았으므로 바꿨다고 알리지 않는다.
      if (!res.changed) return
      startFlash()
      setSavedLive(true)
      toast.success(savedToastTitle(name), { description: SAVED_TOAST_DESCRIPTION })
      return
    }
    const judged = judgeFailedResponse(res)
    setServerErrors(judged.fieldErrors)
    // 칸에 붙지 않는 오류(값 전체의 형식 등)는 카드 안 알림으로도 알린다.
    setFailure(judged.failure)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !changes.any || hasErrors) return
    void runSave(draftToPatch(record, draft))
  }

  function revert() {
    if (busy || !canRevert) return
    void runSave({ value: record.previousValue })
  }

  function cancelChanges() {
    setDraft(draftFromRecord(record))
    setTouched(new Set())
    setServerErrors({})
    setFailure(null)
    setSavedLive(false)
  }

  async function reloadLatest() {
    setReloading(true)
    const res = await fetchOpsRules('balance')
    setReloading(false)
    const latest = res.ok ? res.rules.find((rule) => rule.ruleKey === ruleKey) : undefined
    if (!latest) {
      setFailure({ kind: 'reload' })
      return
    }
    // 규칙이 바뀌었으면(수정 시각이 달라졌으면) 렌더 중 비교가 초안과 알림을 새로 만든다. 같으면 알림만 닫는다.
    setFailure(null)
    onRecord(latest)
  }

  const offNote = ruleKey === 'economy_keys' ? ECONOMY_OFF_NOTE : RULE_OFF_NOTE

  return (
    <Card id={idBase} className={cn('scroll-mt-32 transition-colors motion-reduce:transition-none', flash && 'bg-muted')}>
      <form
        onSubmit={submit}
        // 오류가 있으면 [저장하기]가 비활성이라 Enter 제출이 막힌다. 저장을 시도한 순간 오류 칸의 문구를 모두 보인다.
        onKeyDown={(event) => event.key === 'Enter' && hasErrors && setTouched(new Set([...touched, ...Object.keys(liveErrors)]))}
        aria-labelledby={titleId}
        className="@container space-y-4 p-5"
        noValidate
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 id={titleId} className="text-base font-semibold">
            {name}
          </h4>
          {showProvisionalChip && (
            <Chip tone="muted" Icon={IconRuler2}>
              {PROVISIONAL_CHIP_LABEL}
            </Chip>
          )}
          {changes.any && <UnsavedChip />}
          <label htmlFor={`${idBase}-enabled`} className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <Switch
              id={`${idBase}-enabled`}
              checked={draft.enabled}
              disabled={busy}
              onCheckedChange={(checked) => changeDraft({ ...draft, enabled: checked })}
            />
            {draft.enabled ? ENABLED_LABELS.on : ENABLED_LABELS.off}
          </label>
        </div>

        <p className="break-words text-sm text-muted-foreground">{RULE_EASY_DESCRIPTIONS[ruleKey]}</p>
        {!draft.enabled && <p className="break-words text-sm text-muted-foreground">{offNote}</p>}
        {ruleKey === 'point_reward_max' && !draft.enabled && <p className="break-words text-sm text-muted-foreground">{POINT_REWARD_OFF_NOTE}</p>}

        <OpsBalanceRuleFields
          ruleKey={ruleKey}
          draft={draft}
          onChange={changeDraft}
          errors={visibleErrors}
          onTouch={touch}
          disabled={busy}
          idBase={idBase}
          pointRewardValue={pointRewardValue}
          openCollectionsNow={openCollectionsNow}
          economyKeys={economyKeysOf(ruleKey === 'economy_keys' ? record : undefined)}
        />

        {shouldHintProvisional(record, draft) && <p className="break-words text-sm text-muted-foreground">{PROVISIONAL_HINT}</p>}

        <div className="space-y-0.5 text-xs text-muted-foreground">
          <p className="break-words">{last.changed}</p>
          {last.previous && <p className="break-words">{last.previous}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !changes.any || hasErrors}>
            {saving ? SAVING_LABEL : failure?.kind === 'error' ? RETRY_SAVE_LABEL : SAVE_LABEL}
          </Button>
          {changes.any && (
            <Button type="button" variant="ghost" disabled={busy} onClick={cancelChanges}>
              {CANCEL_CHANGES_LABEL}
            </Button>
          )}
          {canRevert && (
            <Button type="button" variant="outline" disabled={busy} onClick={revert}>
              {REVERT_LABEL}
            </Button>
          )}
        </div>

        <SaveFailureAlerts failure={failure} conflictMessage={CONFLICT_MESSAGE} reloading={reloading} onReload={() => void reloadLatest()} />

        <p className="sr-only" aria-live="polite">
          {savedLive ? SAVED_LIVE_MESSAGE : ''}
        </p>
      </form>
    </Card>
  )
}
