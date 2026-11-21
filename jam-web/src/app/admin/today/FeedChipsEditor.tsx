'use client'

/**
 * 「카드 모양」 섹션의 칩 입력 칸 — 홈피드 개편 5회차-3 (티켓 20261121_1317, 상위 20261120_2026).
 *
 * 모드 «자동»(저장 칸 NULL, 홈이 시드로 정한다)·«칩 없음»(`[]`)·«직접»(1~2개). 직접이면 칩마다 종류(문구·값·구분)·자리·기울기를 고른다.
 * 값 모양·검증은 5-1(`lib/admin/feedCardFields.ts`)이 정본이고 이 파일은 입력 칸과 폼 상태만 다룬다. 색은 5-2의 칩 색 칸이 정한다.
 * 칩 개수 한도·허용 자리·대각선 짝은 새 표 없이 `feedChipSlots.ts`에서 읽고, 값 칩의 자원별 선택지는 `feedValueChips.ts`의 규칙표에서 읽는다.
 *
 * 칩이 2개이면 두 번째 칩의 자리는 첫 칩의 대각선 짝으로 고정된다(선택지가 하나). 첫 칩 자리가 «자동»이면 두 번째도 «자동»이다.
 */
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { FieldLabel, FieldMessage, SegmentedControl, type SegmentOption } from '@/app/admin/badges/BadgeFormControls'
import { FIELD_GRID_CLASS } from '@/components/admin/today/TodayEditorLayout'
import {
  buildFeedCardColumns,
  EMPTY_FEED_CARD_FORM_VALUES,
  validateFeedCardColumns,
  type FeedCardFormValues,
  type FeedChipFormValue,
  type FeedChipsMode,
  type FeedCardValidation,
} from '@/lib/admin/feedCardFields'
import { chipLimitOf, diagonalOf, FEED_CHIP_SLOT_SPECS, type FeedType } from '@/lib/today/feedChipSlots'
import { FEED_TILTS } from '@/lib/today/feedConstants'
import { checkChipTextLength, FEED_VALUE_CHIP_RULES, type ValueChipKind, type ValueChipResource } from '@/lib/today/feedValueChips'
import { resourceOfTemplate } from '@/lib/today/shape'
import type { TodayCardTemplateType } from '@/types/database'
import { cn } from '@/lib/utils'
import { ChoiceField, stampSlotLabel, type ChoiceOption } from './FeedCardSection'

const TEXT_CLASS = 'break-keep wrap-break-word'
const AUTO_HINT = '저장할 때 자동으로 정해져요'

// ── 이름 표 ────────────────────────────────────────────────────

const MODE_OPTIONS: readonly SegmentOption<FeedChipsMode>[] = [
  { value: 'auto', label: '자동' },
  { value: 'none', label: '칩 없음' },
  { value: 'custom', label: '직접' },
]

const KIND_OPTIONS: readonly SegmentOption<FeedChipFormValue['kind']>[] = [
  { value: 'phrase', label: '문구' },
  { value: 'value', label: '값' },
  { value: 'label', label: '구분' },
]

/** 값 칩 종류 이름. 키는 `ValueChipKind`와 같다. */
const VALUE_KIND_LABELS: Readonly<Record<ValueChipKind, string>> = {
  remaining: '남은 기간',
  'reward-points': '보상 포인트',
  condition: '미션 조건 값',
  criteria: '배지 달성 기준',
  level: '배지 레벨',
  'item-count': '아이템 수',
  'required-badges': '필요한 배지 수',
  'place-name': '장소 이름',
}

const TILT_OPTIONS: readonly ChoiceOption[] = FEED_TILTS.map((tilt) => ({ value: String(tilt), label: `${tilt}도` }))

// ── 순수 함수 ──────────────────────────────────────────────────

/** 새 칩 한 개(빈 문구 칩). 자리·기울기는 «자동»이다. */
export function blankChip(): FeedChipFormValue {
  return { kind: 'phrase', source: '', text: '', slot: '', tilt: '' }
}

/**
 * 템플릿에서 고를 수 있는 값 칩의 자원. 값을 읽는 쪽(`cardView.ts`의 `feedValueSourceOf`)의 대응을 따른다:
 * 미션 소개·미션을 가리키는 자동 카드 → 미션, 배지 소개 → 액티비티 배지, 컬렉션 소식 → 컬렉션, 지역 트렌드 → 체크인. 드랍 알림은 값 칩이 없고 나머지 자원은 칩을 내지 않는다.
 * 템플릿을 모르면(생략) 폼이 아는 자원 전부다.
 */
export function valueChipResourcesOf(templateType?: TodayCardTemplateType): readonly ValueChipResource[] {
  if (!templateType) return ['mission', 'activity_badge', 'collection', 'checkin']
  if (templateType === 'location_trend') return ['checkin']
  switch (resourceOfTemplate(templateType)) {
    case 'mission':
    case 'auto':
      return ['mission']
    case 'badge':
      return ['activity_badge']
    case 'collection':
      return ['collection']
    default:
      return []
  }
}

/** 값 칩 출처 키(`mission.reward_points` 형식 — 홈이 읽는 이름, `feedLook.ts`의 `valueChipTextOf`)와 한국어 이름. */
export function valueChipSourceOptions(templateType?: TodayCardTemplateType): ChoiceOption[] {
  const options: ChoiceOption[] = []
  for (const resource of valueChipResourcesOf(templateType)) {
    const rule = FEED_VALUE_CHIP_RULES[resource]
    for (const kind of rule.values) {
      options.push({ value: `${resource}.${kind.replace(/-/g, '_')}`, label: `${rule.divider} · ${VALUE_KIND_LABELS[kind]}` })
    }
  }
  return options
}

export interface ChipSlotChoice {
  options: ChoiceOption[]
  /** 두 번째 칩의 자리가 첫 칩의 대각선 짝으로 고정된 상태인가 */
  followsFirst: boolean
  /** 두 번째 칩인데 첫 칩 자리가 «자동»이라 고를 자리가 없는 상태인가 */
  waitingForFirst: boolean
}

/**
 * 칩의 자리 선택지(«자동»은 칸이 따로 붙인다). 칩이 하나이거나 첫 칩이면 그 유형의 허용 자리 전부,
 * 칩이 2개일 때 두 번째 칩이면 첫 칩의 대각선 짝 하나뿐이다.
 */
export function chipSlotChoice(feedType: FeedType, chips: readonly FeedChipFormValue[], index: number): ChipSlotChoice {
  const label = (slot: string): ChoiceOption => ({ value: slot, label: stampSlotLabel(slot) })
  if (chips.length >= 2 && index === 1) {
    const first = chips[0].slot.trim()
    const diagonal = first ? diagonalOf(feedType, first) : null
    return { options: diagonal ? [label(diagonal)] : [], followsFirst: true, waitingForFirst: !diagonal }
  }
  return { options: FEED_CHIP_SLOT_SPECS[feedType].slots.map(label), followsFirst: false, waitingForFirst: false }
}

/** 칩 `index`의 자리를 바꾼 칩 목록. 칩이 2개이면 두 번째 칩의 자리를 새 첫 칩 자리의 대각선 짝에 맞춘다(없으면 «자동»). */
export function chipsWithSlot(feedType: FeedType, chips: readonly FeedChipFormValue[], index: number, slot: string): FeedChipFormValue[] {
  const next = chips.map((chip, i) => (i === index ? { ...chip, slot } : { ...chip }))
  if (index === 0 && next.length >= 2) {
    next[1] = { ...next[1], slot: slot ? (diagonalOf(feedType, slot) ?? '') : '' }
  }
  return next
}

/** 칩 한 개를 고친 목록. 종류를 바꾸면 그 종류에 맞지 않는 문구·출처 입력은 비운다. */
export function chipsWithPatch(chips: readonly FeedChipFormValue[], index: number, patch: Partial<FeedChipFormValue>): FeedChipFormValue[] {
  return chips.map((chip, i) => {
    if (i !== index) return { ...chip }
    const merged = { ...chip, ...patch }
    if (patch.kind && patch.kind !== chip.kind) {
      if (patch.kind !== 'phrase') merged.text = ''
      if (patch.kind !== 'value') merged.source = ''
    }
    return merged
  })
}

/** 모드를 바꿀 때 폼에 적용할 변경. «직접»으로 바꿨는데 칩이 하나도 없으면 빈 문구 칩 하나를 둔다(칩 0개는 «칩 없음»과 저장이 같아서). */
export function chipsModePatch(mode: FeedChipsMode, chips: readonly FeedChipFormValue[]): Pick<FeedCardFormValues, 'chipsMode' | 'chips'> {
  return { chipsMode: mode, chips: mode === 'custom' && chips.length === 0 ? [blankChip()] : chips.map((chip) => ({ ...chip })) }
}

/** 칩 칸에 보일 검증 결과. 저장 때 쓰는 `validateFeedCardColumns`를 칩 칸만 넣어 호출하므로 문구가 저장 오류와 같다. */
export function chipValidation(feedType: FeedType, mode: FeedChipsMode, chips: readonly FeedChipFormValue[]): FeedCardValidation {
  const columns = buildFeedCardColumns({ ...EMPTY_FEED_CARD_FORM_VALUES, feedType, chipsMode: mode, chips: [...chips] })
  return validateFeedCardColumns({ feed_type: columns.feed_type, chips: columns.chips }, { title: '' })
}

// ── 편집기 ─────────────────────────────────────────────────────

export interface FeedChipsEditorProps {
  feedType: FeedType
  /** 값 칩 출처를 카드 템플릿에 맞춰 좁힌다. 생략하면 폼이 아는 자원 전부 */
  templateType?: TodayCardTemplateType
  mode: FeedChipsMode
  chips: FeedChipFormValue[]
  /** 바꾼 칸만 넘긴다 */
  onChange: (patch: Partial<Pick<FeedCardFormValues, 'chipsMode' | 'chips'>>) => void
  themeContainer?: HTMLElement | null
}

export default function FeedChipsEditor({ feedType, templateType, mode, chips, onChange, themeContainer }: FeedChipsEditorProps) {
  const limit = chipLimitOf(feedType)
  const sourceOptions = valueChipSourceOptions(templateType)
  const validation = mode === 'custom' ? chipValidation(feedType, mode, chips) : { errors: [], warnings: [] }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="feed-chips-editor">
      <div className="flex min-w-0 flex-col gap-1.5">
        <FieldLabel id="feed-card-chips-label" className={TEXT_CLASS}>
          칩
        </FieldLabel>
        <SegmentedControl label="칩 입력 방식" value={mode} options={MODE_OPTIONS} onChange={(next) => onChange(chipsModePatch(next, chips))} />
        <FieldMessage className={TEXT_CLASS}>
          {mode === 'auto'
            ? AUTO_HINT
            : mode === 'none'
              ? '칩 없이 보여요'
              : `이 유형은 칩을 ${limit}개까지 놓을 수 있어요`}
        </FieldMessage>
      </div>

      {mode === 'custom' && (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {chips.map((chip, index) => {
              const no = index + 1
              const idBase = `feed-card-chip-${no}`
              const slotChoice = chipSlotChoice(feedType, chips, index)
              const textCheck = chip.kind === 'phrase' ? checkChipTextLength(chip.text) : null
              return (
                <li key={idBase} className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <span className={cn('text-[13px] font-medium text-foreground', TEXT_CLASS)}>{no}번째 칩</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`${no}번째 칩 삭제`}
                      disabled={chips.length <= 1}
                      onClick={() => onChange({ chips: chips.filter((_, i) => i !== index) })}
                    >
                      삭제
                    </Button>
                  </div>

                  <div className="flex min-w-0 flex-col gap-1.5">
                    <FieldLabel id={`${idBase}-kind-label`} className={TEXT_CLASS}>
                      {no}번째 칩 종류
                    </FieldLabel>
                    <SegmentedControl
                      label={`${no}번째 칩 종류`}
                      value={chip.kind}
                      options={KIND_OPTIONS}
                      onChange={(kind) => onChange({ chips: chipsWithPatch(chips, index, { kind }) })}
                    />
                    <FieldMessage className={TEXT_CLASS}>
                      {chip.kind === 'phrase'
                        ? '직접 적은 문구가 칩에 보여요'
                        : chip.kind === 'value'
                          ? '카드가 가리키는 값(남은 기간·보상 등)을 칩 문구로 보여요'
                          : '카드가 가리키는 자원 이름(미션·컬렉션 등)을 칩에 보여요'}
                    </FieldMessage>
                  </div>

                  {chip.kind === 'phrase' && (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <FieldLabel htmlFor={`${idBase}-text`} className={TEXT_CLASS}>
                        {no}번째 칩 문구
                      </FieldLabel>
                      <Input
                        id={`${idBase}-text`}
                        value={chip.text}
                        onChange={(e) => onChange({ chips: chipsWithPatch(chips, index, { text: e.target.value }) })}
                        autoComplete="off"
                        aria-describedby={`${idBase}-text-help`}
                      />
                      <FieldMessage id={`${idBase}-text-help`} className={TEXT_CLASS}>
                        {textCheck?.warning ?? `${textCheck?.max}자 이내를 권해요`}
                      </FieldMessage>
                    </div>
                  )}

                  {chip.kind === 'value' && (
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <FieldLabel htmlFor={`${idBase}-source`} className={TEXT_CLASS}>
                        {no}번째 칩 값 출처
                      </FieldLabel>
                      <Select value={chip.source || undefined} onValueChange={(source) => onChange({ chips: chipsWithPatch(chips, index, { source }) })}>
                        <SelectTrigger id={`${idBase}-source`} aria-describedby={`${idBase}-source-help`}>
                          <SelectValue placeholder="출처를 골라 주세요" />
                        </SelectTrigger>
                        <SelectContent container={themeContainer ?? undefined}>
                          {sourceOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldMessage id={`${idBase}-source-help`} className={TEXT_CLASS}>
                        {sourceOptions.length === 0
                          ? '이 카드 템플릿에는 쓸 수 있는 값이 없어요. 문구나 구분 칩을 골라 주세요'
                          : '값이 비어 있으면 그 칩은 홈에서 보이지 않아요'}
                      </FieldMessage>
                    </div>
                  )}

                  <div className={FIELD_GRID_CLASS}>
                    <ChoiceField
                      id={`${idBase}-slot`}
                      label={`${no}번째 칩 자리`}
                      value={slotChoice.followsFirst && slotChoice.waitingForFirst ? '' : chip.slot}
                      options={slotChoice.options}
                      onChange={(slot) => onChange({ chips: chipsWithSlot(feedType, chips, index, slot) })}
                      themeContainer={themeContainer}
                      help={slotChoice.followsFirst ? '대각선 자리에 놓여요.' : undefined}
                      disabled={slotChoice.waitingForFirst}
                    />
                    <ChoiceField
                      id={`${idBase}-tilt`}
                      label={`${no}번째 칩 기울기`}
                      value={chip.tilt}
                      options={TILT_OPTIONS}
                      onChange={(tilt) => onChange({ chips: chipsWithPatch(chips, index, { tilt }) })}
                      themeContainer={themeContainer}
                    />
                  </div>
                  {slotChoice.waitingForFirst && (
                    <FieldMessage className={TEXT_CLASS}>첫 번째 칩의 자리를 고르면 이 칩이 대각선 자리에 놓여요</FieldMessage>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={chips.length >= limit}
              onClick={() => onChange({ chips: [...chips, blankChip()] })}
            >
              칩 추가
            </Button>
            <FieldMessage className={TEXT_CLASS}>
              {chips.length >= limit ? `이 유형은 칩을 ${limit}개까지만 놓을 수 있어요` : `${chips.length}/${limit}개`}
            </FieldMessage>
          </div>

          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <ul role="status" className="m-0 flex list-none flex-col gap-1 p-0" data-testid="feed-chips-messages">
              {validation.errors.map((message) => (
                <li key={message} className={cn('text-xs text-destructive', TEXT_CLASS)}>
                  {message}
                </li>
              ))}
              {validation.warnings.map((message) => (
                <li key={message} className={cn('text-xs text-amber-700', TEXT_CLASS)}>
                  {message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
