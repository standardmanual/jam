'use client'

import { Checkbox } from '@/components/admin/ui/checkbox'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { cn } from '@/lib/utils'
import {
  BALANCE_LEVEL_LABELS,
  BALANCE_LEVELS,
  type BalanceLevel,
  type BalanceRuleKey,
  type PointRewardValue,
  type RuleFieldErrors,
} from '@/lib/admin/opsInbox/balance/rules'
import {
  DERIVED_ANCHOR_LABEL,
  DERIVED_UNREADABLE,
  ECONOMY_READONLY_HINT,
  LEVEL_FIELD_LABEL,
  PROVISIONAL_CHECK_LABEL,
  derivedPointsText,
  openCollectionsNote,
  resultSentence,
  ruleAnchorId,
  ruleFieldSpecs,
  type RuleDraft,
  type RuleFieldSpec,
} from '@/lib/admin/opsInbox/balance/settings'

/**
 * 밸런스 규칙 카드 안의 값 칸 (티켓 20260930_1459 조각 B, 채원 확정 설계 「조각 B (S7 운영 설정)」). `OpsRuleCard`가 폼·저장 흐름을 맡고, 이 부품은
 * 규칙마다 다른 칸을 그린다:
 * - R1~R4: 값 칸 하나 · 경고 수준 · 임시값 체크(탭 순서 값 → 수준 → 임시값). 값 아래에 결과 문장(값을 고치는 동안 바로 바뀐다). R1은 「지금 서비스」 상자
 * - R5: 종류 5줄(값 칸과 임시값 체크, 줄마다 결과 문장), 아래에 경고 수준
 * - R6·R7: R5를 따르는 읽기 전용 값과 「항목별 포인트(R5)에서 바꿔요」 앵커, 경고 수준
 * - R8: 경제 정책 키 칩 목록(읽기 전용)과 안내, 경고 수준
 *
 * 입력 칸은 `<label htmlFor>`, 오류·결과 문장은 `aria-describedby`, 잘못된 값은 `aria-invalid` + `border-destructive`다. 스위치·체크박스는
 * `<label>`에 `min-h-11`(44px)을 준다. 입력 높이는 `h-10`(카드 폭 40rem 미만 `h-11`). 카드는 `@container`라 40rem 미만에서는 한 열이다.
 * 문장은 모두 React 텍스트 노드다.
 */

export interface OpsBalanceRuleFieldsProps {
  ruleKey: BalanceRuleKey
  draft: RuleDraft
  onChange: (next: RuleDraft) => void
  /** 지금 보이는 칸 오류(만져 본 칸 + 서버 400). 칸 경로 → 문장. */
  errors: RuleFieldErrors
  /** 칸을 떠났다(그 칸의 오류를 보이기 시작한다). */
  onTouch: (path: string) => void
  disabled: boolean
  /** 카드 안 요소 ID의 접두사(규칙 키). */
  idBase: string
  /** 저장된 R5 값(R6·R7이 따라 읽는다). */
  pointRewardValue: PointRewardValue | null
  /** 지금 열린 컬렉션 수(R1 「지금 서비스」 상자). 못 읽었으면 `null`. */
  openCollectionsNow: number | null
  /** R8 키 목록. */
  economyKeys: readonly string[]
}

function fieldDomId(idBase: string, path: string): string {
  return `${idBase}-${path.replace(/\./g, '-')}`
}

function LevelField({ idBase, level, disabled, onChange }: { idBase: string; level: BalanceLevel; disabled: boolean; onChange: (level: BalanceLevel) => void }) {
  const id = `${idBase}-level`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {LEVEL_FIELD_LABEL}
      </label>
      <Select value={level} onValueChange={(next) => onChange(next === 'info' ? 'info' : 'warn')} disabled={disabled}>
        <SelectTrigger id={id} className="h-11 w-full @[40rem]:h-10">
          <SelectValue>{BALANCE_LEVEL_LABELS[level]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {BALANCE_LEVELS.map((value) => (
            <SelectItem key={value} value={value}>
              {BALANCE_LEVEL_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function ProvisionalCheck({ id, checked, disabled, onChange }: { id: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(next === true)} />
      {PROVISIONAL_CHECK_LABEL}
    </label>
  )
}

interface NumberFieldProps {
  spec: RuleFieldSpec
  idBase: string
  draft: RuleDraft
  error?: string
  result: string | null
  disabled: boolean
  onText: (text: string) => void
  onTouch: () => void
}

/** 값 칸 하나: 이름표 · 입력 + 단위 · 오류(있으면) · 결과 문장(오류가 없을 때). */
function NumberField({ spec, idBase, draft, error, result, disabled, onText, onTouch }: NumberFieldProps) {
  const id = fieldDomId(idBase, spec.path)
  const errorId = `${id}-error`
  const resultId = `${id}-result`
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {spec.label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft.texts[spec.path] ?? ''}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : result ? resultId : undefined}
          className={cn('h-11 w-28 @[40rem]:h-10', error && 'border-destructive focus-visible:ring-destructive')}
          onChange={(event) => onText(event.target.value)}
          onBlur={onTouch}
        />
        <span className="text-sm text-muted-foreground">{spec.unit}</span>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="break-words text-xs font-medium text-destructive">
          {error}
        </p>
      ) : (
        result && (
          <p id={resultId} className="break-words text-sm text-muted-foreground">
            {result}
          </p>
        )
      )}
    </div>
  )
}

export function OpsBalanceRuleFields({
  ruleKey,
  draft,
  onChange,
  errors,
  onTouch,
  disabled,
  idBase,
  pointRewardValue,
  openCollectionsNow,
  economyKeys,
}: OpsBalanceRuleFieldsProps) {
  const specs = ruleFieldSpecs(ruleKey)
  const setText = (path: string, text: string) => onChange({ ...draft, texts: { ...draft.texts, [path]: text } })
  const setProvisional = (path: string, checked: boolean) => onChange({ ...draft, provisional: { ...draft.provisional, [path]: checked } })
  const setLevel = (level: BalanceLevel) => onChange({ ...draft, level })

  const level = <LevelField idBase={idBase} level={draft.level} disabled={disabled} onChange={setLevel} />

  // R1~R4: 값 → 수준 → 임시값(40rem 미만은 한 열, 이상은 세 열).
  if (specs.length === 1) {
    const spec = specs[0]
    return (
      <div className="space-y-3">
        <div className="grid gap-3 @[40rem]:grid-cols-[minmax(0,1fr)_9rem_auto] @[40rem]:items-start">
          <NumberField
            spec={spec}
            idBase={idBase}
            draft={draft}
            error={errors[spec.path]}
            result={resultSentence(ruleKey, spec, draft)}
            disabled={disabled}
            onText={(text) => setText(spec.path, text)}
            onTouch={() => onTouch(spec.path)}
          />
          {level}
          <div className="@[40rem]:pt-[1.625rem]">
            <ProvisionalCheck
              id={fieldDomId(idBase, spec.provisionalPath)}
              checked={draft.provisional[spec.provisionalPath] === true}
              disabled={disabled}
              onChange={(checked) => setProvisional(spec.provisionalPath, checked)}
            />
          </div>
        </div>
        {ruleKey === 'open_collections_max' && (
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold text-muted-foreground">지금 서비스</p>
            <p className="mt-0.5 break-words text-sm">{openCollectionsNote(openCollectionsNow, draft.texts[spec.path] ?? '', draft.level)}</p>
          </div>
        )}
      </div>
    )
  }

  // R5: 종류 5줄, 아래에 경고 수준.
  if (specs.length > 1) {
    return (
      <div className="space-y-3">
        <ul className="space-y-3">
          {specs.map((spec) => (
            <li key={spec.path} className="grid gap-x-4 gap-y-1 @[40rem]:grid-cols-[minmax(0,1fr)_auto] @[40rem]:items-start">
              <NumberField
                spec={spec}
                idBase={idBase}
                draft={draft}
                error={errors[spec.path]}
                result={resultSentence(ruleKey, spec, draft)}
                disabled={disabled}
                onText={(text) => setText(spec.path, text)}
                onTouch={() => onTouch(spec.path)}
              />
              <div className="@[40rem]:pt-[1.625rem]">
                <ProvisionalCheck
                  id={fieldDomId(idBase, spec.provisionalPath)}
                  checked={draft.provisional[spec.provisionalPath] === true}
                  disabled={disabled}
                  onChange={(checked) => setProvisional(spec.provisionalPath, checked)}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className="@[40rem]:max-w-[9rem]">{level}</div>
      </div>
    )
  }

  // R6·R7: R5를 따르는 읽기 전용 값.
  if (ruleKey === 'single_action_points' || ruleKey === 'count_ladder_points') {
    const text = derivedPointsText(ruleKey, pointRewardValue)
    return (
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="break-words text-sm font-medium">{text ?? DERIVED_UNREADABLE}</p>
          <a
            href={`#${ruleAnchorId('point_reward_max')}`}
            className="inline-flex min-h-11 items-center rounded text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            {DERIVED_ANCHOR_LABEL}
          </a>
        </div>
        <div className="@[40rem]:max-w-[9rem]">{level}</div>
      </div>
    )
  }

  // R8: 경제 정책 키 목록(읽기 전용).
  return (
    <div className="space-y-3">
      {economyKeys.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="경제 정책 키">
          {economyKeys.map((key) => (
            <li key={key} className="rounded-full border border-border bg-background px-2.5 py-0.5 font-mono text-xs">
              {key}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">{ECONOMY_READONLY_HINT}</p>
      <div className="@[40rem]:max-w-[9rem]">{level}</div>
    </div>
  )
}
