'use client'

/**
 * 배지 폼 「획득 조건」(아이템은 「드랍 조건」) 섹션 본문 — 티켓 20260911_0901
 *
 * 입력 UI는 여전히 **레지스트리(`conditionRegistry.ts`)의 `form` 선언에서 생성한다**(티켓
 * 20260905_0032 A-2). 그룹·라벨·접미사·칸 수·짝 입력·소제목 전부 그 선언을 읽는다 — 새 조건
 * 필드는 레지스트리의 `form`과 `ConditionFormFields`의 state 키만 추가하면 여기 자동으로 나온다.
 * 2단 게이트(gate) 그룹만 결합 규칙(교차 둘은 OR, 미션 게이트는 AND)을 드러내야 해서 전용 블록이다.
 *
 * 이 컴포넌트는 **값을 만들지 않는다.** 저장될 `condition_json`은 `BadgeForm`이
 * `buildConditionJsonFromFields`로 조립해 `condPreview`로 넘긴다. 숨긴 그룹의 입력값도 폼 state에
 * 그대로 남아 저장 페이로드가 바뀌지 않는다.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { IconChevronDown, IconSearch } from '@tabler/icons-react'
import type { BadgeCondition, BadgeRarity, BadgeType } from '@/types/database'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import ConditionSimulationPanel from '@/components/admin/ConditionSimulationPanel'
import {
  FIELD_GRID_CLASS,
  SectionStatusBadge,
  fieldSpanClass,
} from '@/components/admin/badges/BadgeEditorLayout'
import { cn } from '@/lib/utils'
import {
  CONDITION_FORM_SECTIONS,
  CONDITION_FORM_SECTION_DESCRIPTION,
  CONDITION_FORM_SECTION_LABEL,
  conditionFormEntriesOf,
  conditionFormSectionOf,
  getConditionField,
  type ConditionFormEntry,
  type ConditionFormSection,
} from '@/lib/badge-engine/conditionRegistry'
import type { ProgressUnsupportedReason } from '@/lib/badge-engine/badgeProgress'
import { conditionSummaryChips } from '@/lib/admin/badge-sections'
import type { ConditionFormFields } from './conditionFormFields'
import { FieldLabel, FieldMessage, SegmentedControl, SuffixInput } from './BadgeFormControls'

const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']
const RARITY_LABEL: Record<BadgeRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

// Radix Select는 SelectItem value=""를 허용하지 않는다 — "선택 안 함"을 나타내는 전용 값.
const NONE_VALUE = '__none__'

/** 2단 교차 게이트 입력 블록 — 폼 state 키 접두는 레지스트리의 `gateForm`과 짝이다 */
const CROSS_GATE_BLOCKS = [
  { prefix: 'crossInAxis', title: '축 내 교차', help: '같은 축 안의 다른 계열 배지를 요구해요.' },
  { prefix: 'crossBetweenAxis', title: '축 간 교차', help: '보완 축(다른 축)의 계열 배지를 요구해요.' },
] as const
const MISSION_GATE_BLOCK = {
  prefix: 'gateMissionBadge',
  title: '미션 보상 배지',
  help: '미션 완료로만 지급되는 배지를 요구해요. 위 교차 게이트와 함께 충족해야 통과해요.',
} as const

/** 필드 찾기가 게이트 그룹을 찾을 때 보는 이름들 — 게이트는 전용 블록이라 레지스트리 라벨이 없다 */
const GATE_SEARCH_LABELS = ['선행 배지 이름', '축 내 교차', '축 간 교차', '미션 보상 배지']

/** 조건 입력의 DOM id — 저장 시 첫 누락 필드로 포커스를 옮길 때 BadgeForm이 같은 규칙으로 찾는다 */
export function conditionControlDomId(field: string): string {
  return `cond-${field}`
}

/** 조건 그룹(<details>)의 DOM id */
export function conditionGroupDomId(section: ConditionFormSection): string {
  return `cond-group-${section}`
}

export interface BadgeConditionSectionProps {
  type: BadgeType
  isJam: boolean
  condFields: ConditionFormFields
  setCondField: (field: string, value: string | boolean) => void
  /** 저장될 condition_json(BadgeForm이 조립) */
  condPreview: BadgeCondition | null
  /** 아이템 배지에서 쓸 수 없는 조건 키(누적 조건) — 비활성화하고 안내한다 */
  blockedKeys: ReadonlySet<string>
  /** 필드 옆 빨간 한 줄 안내(짝 필드 누락 등) — 컨트롤 state 키 → 문구 */
  fieldErrors: Readonly<Record<string, string>>
  /** 저장 시 누락으로 표시할 컨트롤 state 키 */
  invalidFields: ReadonlySet<string>
  unsupportedConditionKeys: readonly string[]
  unrepresentableConditionKeys: readonly string[]
  pendingConditionKeys: readonly string[]
  progressIssue: ProgressUnsupportedReason | null
  themeContainer: HTMLElement | null
}

/** 그룹 안에서 값이 있는 조건 수 — 요약 칩과 같은 기준(저장될 JSON의 키) */
function countOf(section: ConditionFormSection, cond: BadgeCondition | null): number {
  if (!cond) return 0
  return Object.keys(cond).filter((key) => key !== 'mission_reward' && conditionFormSectionOf(key) === section).length
}

function includesQuery(text: string | undefined, q: string): boolean {
  return !!text && text.toLowerCase().includes(q)
}

export default function BadgeConditionSection({
  type,
  isJam,
  condFields,
  setCondField,
  condPreview,
  blockedKeys,
  fieldErrors,
  invalidFields,
  unsupportedConditionKeys,
  unrepresentableConditionKeys,
  pendingConditionKeys,
  progressIssue,
  themeContainer,
}: BadgeConditionSectionProps) {
  const jam = type === 'activity' && isJam
  // 발급 방식(자동/미션)은 일반 액티비티 배지에서만 고른다. 아이템·JAM!에서는 숨긴다.
  // JAM!에서는 missionReward 값을 폼 state에 그대로 둔다. 아이템으로 전환할 때는 BadgeForm의
  // changeType이 이 값을 비운다 — 아이템의 mission_reward는 영구 드랍 제외로 이어진다(티켓 20260911_0901 D-1).
  const showIssuance = type === 'activity' && !jam
  const missionMode = showIssuance && condFields.missionReward

  // JAM!은 사용량 지표(meta)만, 그 외는 meta를 뺀 8개 그룹
  const groups = useMemo<ConditionFormSection[]>(
    () => (jam ? ['meta'] : CONDITION_FORM_SECTIONS.filter((s) => s !== 'meta')),
    [jam]
  )

  const value = (field: string): string | boolean => (condFields as Record<string, string | boolean>)[field]
  const text = (field: string): string => {
    const raw = value(field)
    return typeof raw === 'string' ? raw : ''
  }

  // 값이 있는 그룹만 처음부터 펼친다. JAM!은 그룹이 하나뿐이라 늘 펼친다.
  const [openGroups, setOpenGroups] = useState<Set<ConditionFormSection>>(() => {
    const initial = new Set<ConditionFormSection>()
    for (const s of CONDITION_FORM_SECTIONS) if (countOf(s, condPreview) > 0) initial.add(s)
    initial.add('meta')
    return initial
  })
  const setGroupOpen = (section: ConditionFormSection, open: boolean) =>
    setOpenGroups((prev) => {
      if (prev.has(section) === open) return prev
      const next = new Set(prev)
      if (open) next.add(section)
      else next.delete(section)
      return next
    })

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const chips = conditionSummaryChips(condPreview)

  const jumpToGroup = (section: ConditionFormSection) => {
    setQuery('')
    setGroupOpen(section, true)
    // 펼침이 반영된 다음 프레임에 이동한다
    requestAnimationFrame(() => {
      const el = document.getElementById(conditionGroupDomId(section))
      if (!el) return
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' })
      el.querySelector<HTMLElement>('summary')?.focus({ preventScroll: true })
    })
  }

  /** 검색어에 걸리는 입력인가 — 컨트롤 라벨·짝 묶음 라벨·짝 상대 라벨을 본다 */
  const entryMatches = (entry: ConditionFormEntry, partner: ConditionFormEntry | undefined) =>
    includesQuery(entry.control.label ?? entry.meta.label, q) ||
    includesQuery(entry.control.pair?.label, q) ||
    (!!partner && includesQuery(partner.control.label ?? partner.meta.label, q))

  const groupMatches = (section: ConditionFormSection) =>
    includesQuery(CONDITION_FORM_SECTION_LABEL[section], q) || includesQuery(CONDITION_FORM_SECTION_DESCRIPTION[section], q)

  // ── 입력 1개 ──────────────────────────────────────────────────────────

  const pendingTag = (entry: ConditionFormEntry) =>
    entry.meta.evaluation === 'pending' ? (
      <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800">평가 대기</span>
    ) : null

  /** 필드 아래 줄(보조 설명·아이템 제한·필드 간 제약) */
  const messagesOf = (entry: ConditionFormEntry) => {
    const field = entry.control.field
    const domId = conditionControlDomId(field)
    const blocked = blockedKeys.has(entry.meta.key)
    const hasValue = entry.meta.key in (condPreview ?? {})
    const nodes: ReactNode[] = []
    const ids: string[] = []
    if (blocked) {
      ids.push(`${domId}-blocked`)
      nodes.push(
        hasValue ? (
          <FieldMessage key="blocked" id={`${domId}-blocked`} tone="error">
            아이템 배지에는 쓸 수 없어요. 값을 지워야 저장할 수 있어요.
          </FieldMessage>
        ) : (
          <FieldMessage key="blocked" id={`${domId}-blocked`}>
            아이템 배지에는 쓸 수 없어요.
          </FieldMessage>
        )
      )
    } else if (entry.control.help) {
      ids.push(`${domId}-help`)
      nodes.push(
        <FieldMessage key="help" id={`${domId}-help`}>
          {entry.control.help}
        </FieldMessage>
      )
    }
    const err = fieldErrors[field]
    if (err) {
      ids.push(`${domId}-error`)
      nodes.push(
        <FieldMessage key="error" id={`${domId}-error`} tone="error">
          {err}
        </FieldMessage>
      )
    }
    return { nodes, describedBy: ids.join(' ') || undefined }
  }

  /** 입력 컨트롤만(라벨 없이) — 짝 입력 안에서도 쓴다 */
  const renderInput = (entry: ConditionFormEntry, describedBy: string | undefined, ariaLabel?: string) => {
    const { control, meta } = entry
    const domId = conditionControlDomId(control.field)
    const blocked = blockedKeys.has(meta.key)
    const hasValue = meta.key in (condPreview ?? {})
    // 값이 이미 있는 제한 필드는 지울 수 있게 열어 둔다 — 잠그면 저장이 영영 막힌다
    const disabled = blocked && !hasValue
    const invalid = invalidFields.has(control.field) || !!fieldErrors[control.field] || (blocked && hasValue)

    if (control.kind === 'select') {
      const current = text(control.field) || NONE_VALUE
      return (
        <Select value={current} onValueChange={(v) => setCondField(control.field, v === NONE_VALUE ? '' : v)} disabled={disabled}>
          <SelectTrigger id={domId} aria-label={ariaLabel} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={themeContainer ?? undefined}>
            <SelectItem value={NONE_VALUE}>{control.noneLabel ?? '— 없음 —'}</SelectItem>
            {(control.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }

    const suffix = control.kind === 'time' ? null : (control.suffix ?? meta.unit)
    return (
      <SuffixInput
        id={domId}
        type={control.kind === 'number' ? 'number' : control.kind === 'time' ? 'time' : 'text'}
        inputMode={control.kind === 'number' ? 'decimal' : undefined}
        {...(control.kind === 'number' ? { min: meta.min, max: meta.max, step: meta.step } : {})}
        value={text(control.field)}
        onChange={(e) => setCondField(control.field, e.target.value)}
        placeholder={control.placeholder}
        suffix={suffix}
        describedBy={describedBy}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        autoComplete="off"
      />
    )
  }

  /** 단독 입력 1칸 */
  const renderField = (entry: ConditionFormEntry) => {
    const { control } = entry
    const domId = conditionControlDomId(control.field)
    const label = control.label ?? entry.meta.label
    const { nodes, describedBy } = messagesOf(entry)

    if (control.kind === 'checkbox') {
      return (
        <div key={control.field} className={cn('flex items-start gap-2.5', fieldSpanClass(control.span))}>
          <Checkbox
            id={domId}
            checked={value(control.field) === true}
            onCheckedChange={(v) => setCondField(control.field, v === true)}
            aria-describedby={describedBy}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <label htmlFor={domId} className="cursor-pointer text-sm font-medium text-foreground">
              {label}
              {pendingTag(entry)}
            </label>
            {nodes}
          </div>
        </div>
      )
    }

    return (
      <div key={control.field} className={cn('flex min-w-0 flex-col gap-1.5', fieldSpanClass(control.span))}>
        <FieldLabel htmlFor={domId}>
          {label}
          {pendingTag(entry)}
        </FieldLabel>
        {renderInput(entry, describedBy)}
        {nodes}
      </div>
    )
  }

  /** 짝 입력 한 줄(시간대 시작~끝, 기온, 기준 시간과 횟수) */
  const renderPair = (a: ConditionFormEntry, b: ConditionFormEntry) => {
    const pair = a.control.pair!
    const labelId = `${conditionControlDomId(a.control.field)}-pair`
    const ma = messagesOf(a)
    const mb = messagesOf(b)
    return (
      <div
        key={a.control.field}
        role="group"
        aria-labelledby={labelId}
        className={cn('flex min-w-0 flex-col gap-1.5', fieldSpanClass(a.control.span))}
      >
        <FieldLabel id={labelId}>
          {pair.label}
          {pendingTag(a)}
        </FieldLabel>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          {renderInput(a, ma.describedBy, a.control.label ?? a.meta.label)}
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            {pair.separator}
          </span>
          {renderInput(b, mb.describedBy, b.control.label ?? b.meta.label)}
        </div>
        {ma.nodes}
        {mb.nodes}
      </div>
    )
  }

  /** 그룹 본문 — 소제목·짝 입력·검색 필터를 적용해 그리드로 그린다 */
  const renderGroupFields = (section: ConditionFormSection, showAll: boolean) => {
    const entries = conditionFormEntriesOf(section)
    const byField = new Map(entries.map((e) => [e.control.field, e]))
    const partnerFields = new Set(entries.flatMap((e) => (e.control.pair ? [e.control.pair.with] : [])))
    const out: ReactNode[] = []
    let lastSub: string | undefined
    for (const entry of entries) {
      if (partnerFields.has(entry.control.field)) continue // 짝의 둘째 칸은 첫째 칸이 함께 그린다
      const partner = entry.control.pair ? byField.get(entry.control.pair.with) : undefined
      if (!showAll && !entryMatches(entry, partner)) continue
      if (!q && entry.subsection && entry.subsection !== lastSub) {
        out.push(
          <p key={`sub-${entry.subsection}`} className="col-span-full -mb-1 text-[11px] font-medium tracking-wide text-muted-foreground">
            {entry.subsection}
          </p>
        )
      }
      lastSub = entry.subsection
      out.push(partner ? renderPair(entry, partner) : renderField(entry))
    }
    return out
  }

  // ── 2단 게이트 전용 블록 ───────────────────────────────────────────────

  const renderGateRow = (prefix: string, title: string, help: string) => {
    const keysId = conditionControlDomId(`${prefix}FamilyKeys`)
    const rarityId = conditionControlDomId(`${prefix}MinRarity`)
    const countId = conditionControlDomId(`${prefix}MinCount`)
    return (
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <p className="col-span-full -mb-1 text-sm font-medium text-foreground">
            {title}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">{help}</span>
          </p>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor={keysId}>대상 계열 키</FieldLabel>
            <Input
              id={keysId}
              value={text(`${prefix}FamilyKeys`)}
              onChange={(e) => setCondField(`${prefix}FamilyKeys`, e.target.value)}
              placeholder="running:tempo, running:interval"
              aria-describedby={`${keysId}-help`}
              autoComplete="off"
            />
            <FieldMessage id={`${keysId}-help`}>쉼표로 구분해요.</FieldMessage>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor={rarityId}>최소 등급</FieldLabel>
            <Select
              value={text(`${prefix}MinRarity`) || NONE_VALUE}
              onValueChange={(v) => setCondField(`${prefix}MinRarity`, v === NONE_VALUE ? '' : v)}
            >
              <SelectTrigger id={rarityId} aria-label={`${title} 최소 등급`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={themeContainer ?? undefined}>
                <SelectItem value={NONE_VALUE}>제한 없음</SelectItem>
                {RARITIES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RARITY_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor={countId}>필요 계열 수</FieldLabel>
            <SuffixInput
              id={countId}
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={text(`${prefix}MinCount`)}
              onChange={(e) => setCondField(`${prefix}MinCount`, e.target.value)}
              placeholder="1"
              suffix="개"
              describedBy={`${countId}-help`}
            />
            <FieldMessage id={`${countId}-help`}>비우면 1개예요(OR).</FieldMessage>
          </div>
        </div>
      </div>
    )
  }

  const logicDivider = (label: string) => (
    <div className="flex items-center gap-2.5 text-[11px] font-medium tracking-wider text-muted-foreground" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  )

  const renderGateGroup = () => (
    <div className="flex flex-col gap-4">
      <div className="@container">
        <div className={FIELD_GRID_CLASS}>{conditionFormEntriesOf('gate').map(renderField)}</div>
      </div>
      <div className="flex flex-col gap-3.5 rounded-lg border border-border bg-muted/40 p-3.5">
        <p className="text-xs font-medium text-foreground/80">교차 게이트 — 둘 중 하나만 충족해도 통과해요 (OR)</p>
        {renderGateRow(CROSS_GATE_BLOCKS[0].prefix, CROSS_GATE_BLOCKS[0].title, CROSS_GATE_BLOCKS[0].help)}
        {logicDivider('또는')}
        {renderGateRow(CROSS_GATE_BLOCKS[1].prefix, CROSS_GATE_BLOCKS[1].title, CROSS_GATE_BLOCKS[1].help)}
      </div>
      {logicDivider('그리고 (AND)')}
      <div className="rounded-lg border border-border bg-muted/40 p-3.5">
        {renderGateRow(MISSION_GATE_BLOCK.prefix, MISSION_GATE_BLOCK.title, MISSION_GATE_BLOCK.help)}
      </div>
      <FieldMessage>레벨형 계열을 대상으로 삼을 때는 최소 등급을 비워 두세요. 등급이 없어 서열 비교가 성립하지 않아요.</FieldMessage>
    </div>
  )

  // ── 그룹 목록 ─────────────────────────────────────────────────────────

  /** 검색어에 걸리는 입력이 하나라도 있는 그룹인가 */
  const groupHasMatch = (section: ConditionFormSection) => {
    if (groupMatches(section)) return true
    if (section === 'gate') return GATE_SEARCH_LABELS.some((l) => includesQuery(l, q))
    const entries = conditionFormEntriesOf(section)
    const byField = new Map(entries.map((e) => [e.control.field, e]))
    return entries.some((e) => entryMatches(e, e.control.pair ? byField.get(e.control.pair.with) : undefined))
  }
  const visibleGroups = q ? groups.filter(groupHasMatch) : groups

  // 아이템 안내문의 누적 조건 이름 — 폼 입력 라벨(레지스트리)을 그대로 쓴다
  const blockedLabels = [...blockedKeys].map((key) => {
    const meta = getConditionField(key)
    return meta?.form?.controls?.[0]?.label ?? meta?.label ?? key
  })

  return (
    <>
      {/* JAM!은 발급 방식·필드 찾기가 모두 없어 도구 줄을 그리지 않는다 */}
      {!jam && (
      <div className="flex flex-wrap items-center justify-between gap-3">
        {showIssuance ? (
          <SegmentedControl
            label="발급 방식"
            value={condFields.missionReward ? 'mission' : 'auto'}
            options={[
              { value: 'auto', label: '조건 충족 시 자동 발급' },
              { value: 'mission', label: '미션 완료로만 지급' },
            ]}
            onChange={(v) => setCondField('missionReward', v === 'mission')}
          />
        ) : (
          <span />
        )}
        {/* 아이콘 자리를 비우려면 왼쪽 여백을 바꿔야 하는데 이 저장소의 `cn`은 클래스를 병합하지
            않아 shadcn Input의 px-3을 덮을 수 없다 — 같은 모양의 입력을 직접 칠한다 */}
        <div className="flex h-9 w-full max-w-[240px] items-center gap-2 rounded-md border border-neutral-300 bg-white px-2.5 ring-offset-white focus-within:ring-2 focus-within:ring-neutral-900 focus-within:ring-offset-2">
          <IconSearch className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="cond-field-search" className="sr-only">
            조건 필드 찾기
          </label>
          <input
            id="cond-field-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="필드 찾기 — 심박, 휴식"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
          />
        </div>
      </div>
      )}

      {missionMode && (
        <Alert variant="warning">
          <AlertDescription>
            <p className="text-xs">
              미션 보상 배지는 아래 조건과 관계없이 미션을 완료했을 때만 지급돼요. 입력한 조건은 저장되지만 발급 판정에는
              쓰이지 않아요.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {type === 'item' && (
        <Alert>
          <AlertDescription>
            <p className="text-xs text-muted-foreground">
              아이템 배지에는 누적 조건({blockedLabels.join('·')})을 쓸 수 없어요. 넣으면 드랍 후보에서 영구히 빠져요.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 요약 칩 — 문구는 어드민 목록과 같은 `formatConditionChips` 계열이다 */}
      <div className="flex flex-col gap-2 rounded-lg bg-muted px-3.5 py-3" aria-live="polite">
        <p className="text-xs text-foreground/80">
          설정한 조건 <strong className="font-medium tabular-nums text-foreground">{chips.length}</strong>개
          {chips.length > 0 && ' · 칩을 누르면 그 그룹으로 이동해요'}
        </p>
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const section = conditionFormSectionOf(chip.key)
              const reachable = section !== null && groups.includes(section)
              const cls = 'rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-foreground'
              return reachable ? (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => jumpToGroup(section)}
                  className={cn(cls, 'hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
                >
                  {chip.text}
                </button>
              ) : (
                <span key={chip.key} className={cls}>
                  {chip.text}
                </span>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">아직 설정한 조건이 없어요. 아래 그룹을 펼쳐 값을 넣어 보세요.</p>
        )}
      </div>

      {/* 조건 그룹 — 네이티브 <details>. 값이 있는 그룹만 처음부터 펼친다 */}
      {visibleGroups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
          &lsquo;{query.trim()}&rsquo;와 일치하는 필드가 없어요.
        </p>
      ) : (
        <div className={cn('overflow-hidden rounded-lg border border-border', missionMode && 'opacity-50')}>
          {visibleGroups.map((section) => {
            const count = countOf(section, condPreview)
            // 검색 중에는 걸린 그룹을 모두 펼친다
            const open = q ? true : openGroups.has(section)
            const showAll = !q || groupMatches(section) || section === 'gate'
            return (
              <details
                key={section}
                id={conditionGroupDomId(section)}
                open={open}
                onToggle={(e) => {
                  if (!q) setGroupOpen(section, (e.currentTarget as HTMLDetailsElement).open)
                }}
                className="group scroll-mt-20 border-b border-border last:border-b-0"
              >
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{CONDITION_FORM_SECTION_LABEL[section]}</span>
                    <span className="block text-xs text-muted-foreground">{CONDITION_FORM_SECTION_DESCRIPTION[section]}</span>
                  </span>
                  <SectionStatusBadge
                    status={count > 0 ? { tone: 'set', text: `${count}개 설정` } : { tone: 'idle', text: '비어 있음' }}
                  />
                  <IconChevronDown
                    className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </summary>
                <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
                  {section === 'meta' && (
                    <FieldMessage>
                      팔로우하거나 동기화한 직후 바로 판정해서 발급해요. 반복 획득과는 함께 쓸 수 없어요.
                    </FieldMessage>
                  )}
                  {section === 'gate' ? (
                    renderGateGroup()
                  ) : (
                    <div className="@container">
                      <div className={FIELD_GRID_CLASS}>{renderGroupFields(section, showAll)}</div>
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      )}

      {/* 평가 대기 — 저장은 되지만 엔진이 그 필드를 아직 평가하지 않아 발급이 막힌다
          (fail-closed). 티켓 20260905_0032 */}
      {!jam && pendingConditionKeys.length > 0 && (
        <Alert variant="warning">
          <AlertTitle className="text-sm">아직 평가되지 않는 조건 필드가 있어요</AlertTitle>
          <AlertDescription>
            <p className="text-xs text-amber-800/80">
              {pendingConditionKeys.map((k) => `${getConditionField(k)?.label ?? k}(${k})`).join(', ')}
              {' '}는 엔진이 아직 평가하지 않아요. 저장은 되지만 이 배지는 평가가 열릴 때까지 발급되지 않아요.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 폼 미지원 조건 필드 — 값은 저장 시 원본 그대로 보존된다(티켓 20260825_032) */}
      {unsupportedConditionKeys.length > 0 && (
        <Alert variant="warning">
          <AlertTitle className="text-sm">이 폼에서 다룰 수 없는 조건 필드가 있어요</AlertTitle>
          <AlertDescription>
            <p className="text-xs text-amber-800/80">
              {unsupportedConditionKeys.join(', ')} 값이 이미 설정돼 있어요. 이 화면에는 입력 항목이 없어 여기서 보거나 고칠 수
              없지만, 저장해도 값은 그대로 유지돼요.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 왕복 불가 값 — 저장하면 바뀌거나 사라진다. 저장을 막지는 않는다 */}
      {unrepresentableConditionKeys.length > 0 && (
        <Alert variant="warning">
          <AlertTitle className="text-sm">이 폼이 그대로 재현하지 못하는 값이 있어요</AlertTitle>
          <AlertDescription>
            <p className="text-xs text-amber-800/80">
              {unrepresentableConditionKeys.join(', ')} 값의 형태가 입력 항목과 맞지 않아요. 이대로 저장하면 값이 바뀌거나 사라져요.
              아래 「저장될 condition_json 보기」에서 실제 저장될 값을 확인해 주세요.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* 진행 미지원 조건 — 저장을 막지 않는다(§08 H 어드민 절반, 티켓 20260904_1426) */}
      {progressIssue && (
        <Alert variant="warning">
          <AlertTitle className="text-sm">이 조건은 배지 트리 화면에 진행률이 표시되지 않아요</AlertTitle>
          <AlertDescription className="space-y-0.5">
            <p className="text-xs text-amber-800/80">{progressIssue.reason}</p>
            {progressIssue.hiddenAxisLabels.length > 0 && (
              <p className="text-xs text-amber-800/80">화면에서 빠지는 축: {progressIssue.hiddenAxisLabels.join(', ')}</p>
            )}
            <p className="text-xs text-amber-800/80">배지 획득에는 영향이 없어요.</p>
          </AlertDescription>
        </Alert>
      )}

      {/* 저장될 JSON — 기본으로 접는다 */}
      <details className="group/json">
        <summary className="cursor-pointer text-[13px] font-medium text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          저장될 condition_json 보기
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-muted px-3.5 py-3 font-mono text-xs text-foreground/80">
          {condPreview ? JSON.stringify(condPreview, null, 2) : 'null (조건 없음)'}
        </pre>
      </details>

      {/* 판정 시뮬레이션 — 저장 전 실제 발급 엔진으로 미리 돌려본다(티켓 20260908_1554).
          JAM!은 usageBadges.ts가 판정해 엔진 시뮬레이션이 무의미하므로 숨긴다 */}
      {!jam && (
        <ConditionSimulationPanel condition={condPreview} apiPath="/api/admin/badges/simulate-condition" themeContainer={themeContainer} />
      )}
    </>
  )
}
