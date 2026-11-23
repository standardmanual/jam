'use client'

/**
 * 투데이 카드 작성·수정 화면의 「카드 모양」 섹션 — 홈피드 개편 5회차-2 (티켓 20261121_1316, 상위 20261120_2026).
 *
 * 유형(8개)·박스 모양(5개)과 용도·배경/칩/박스 색(9색)·설명 문장 노출·도장과 자리·제목 속 칩 낱말을 값으로 정한다.
 * 칸마다 «자동»이 기본이고, 비워 두면 저장할 때 자동 규칙이 정한다(값 의미는 `lib/admin/feedCardFields.ts` 머리 주석).
 * 칩·목록 항목·컬렉션 모션 입력 칸은 5-3(티켓 20261121_1317)이 만든 `FeedChipsEditor`·`FeedListItemsEditor`·`FeedBurstEditor`가 맡고, 이 섹션은 유형에 맞는 것만 렌더한다.
 *
 * 값(`FeedCardFormValues`)과 변경 함수만 props로 받는다. 폼 상태·저장은 `TodayCardForm.tsx`가 맡는다.
 * 유형별로 어떤 칸이 보이는지는 새 표를 만들지 않고 기존 상수에서 읽는다:
 * 칩 자리 명세(`feedChipSlots.ts`)·칩 자리 이름→모서리(`feedChipLayout.ts`)·설명 기본 노출(`feedLook.ts`의 `DESCRIPTION_DEFAULT`).
 * 박스 칸이 있는 유형은 `feedChipSlots.ts`의 `BOX_FEED_TYPES`·`BOX_KIND_FEED_TYPES`다(홈 컴포넌트와의 일치는 시험이 지킨다, 티켓 20261121_2113).
 * 공용 조각(`ChoiceField`·`ChoiceOption`·`stampSlotLabel`)은 `FeedFieldParts.tsx`에 있고 아래에서 다시 내보낸다(`FeedChipsEditor.tsx`와의 순환을 끊으려고 옮겼다).
 */
import { Input } from '@/components/admin/ui/input'
import { FieldLabel, FieldMessage, SegmentedControl, type SegmentOption } from '@/app/admin/badges/BadgeFormControls'
import { FIELD_GRID_CLASS } from '@/components/admin/today/TodayEditorLayout'
import {
  COLOR_RULE_REASON,
  colorRuleWarnings,
  type FeedCardFormValues,
  type FeedDescriptionMode,
  type FeedStampMode,
} from '@/lib/admin/feedCardFields'
import { currentColorChoice, FEED_COLOR_LABELS, feedColorChoices, type FeedColorRole } from '@/lib/admin/feedColorLabels'
import { FEED_TYPE_LABELS, FEED_TYPE_FALLBACK_TEXT, feedTypeDisplayName } from '@/lib/admin/feedTypeLabels'
import { cornerOfSlot } from '@/lib/today/feedChipLayout'
import {
  BOX_FEED_TYPES,
  BOX_KIND_FEED_TYPES,
  chipLimitOf,
  diagonalOf,
  FEED_CHIP_SLOT_SPECS,
  FEED_TYPES,
  isFeedType,
  type FeedType,
} from '@/lib/today/feedChipSlots'
import { violatesImageColorRule } from '@/lib/today/feedColorRules'
import { imageColorsForCard, type FeedImageColorInput } from '@/lib/today/feedImageColors'
import { FEED_COLORS, type FeedColorKey } from '@/lib/today/feedConstants'
import { DESCRIPTION_DEFAULT } from '@/lib/today/feedLook'
import { BOX_SHAPES } from '@/lib/today/boxShape'
import type { ExcludedColorPair } from '@/lib/today/feedAssign'
import { MAX_TITLE_CHIPS } from '@/lib/today/titleChips'
import type { TodayBoxKind, TodayBoxShape, TodayCardTemplateType } from '@/types/database'
import { cn } from '@/lib/utils'
import FeedBurstEditor from './FeedBurstEditor'
import FeedChipsEditor from './FeedChipsEditor'
import FeedListItemsEditor from './FeedListItemsEditor'
import { AUTO_HINT, ChoiceField, TEXT_CLASS, stampSlotLabel, type ChoiceOption } from './FeedFieldParts'

// 기존 가져오기 경로(`TodayCardForm`·시험)가 깨지지 않게 공용 조각을 다시 내보낸다.
export { ChoiceField, stampSlotLabel, type ChoiceOption }

// ── 이름 표 ────────────────────────────────────────────────────

// 유형 이름 표는 서버 모듈도 쓰도록 순수 파일(`lib/admin/feedTypeLabels.ts`)로 옮겼다(티켓 20261122_1239). 기존 가져오기 경로를 위해 다시 내보낸다.
export { FEED_TYPE_LABELS, FEED_TYPE_FALLBACK_TEXT, feedTypeDisplayName }

/** 박스 모양 이름(PRD «박스 모양 5가지» 표). */
export const BOX_SHAPE_LABELS: Readonly<Record<TodayBoxShape, string>> = {
  round: '둥근 모서리',
  ticket: '티켓',
  stamp: '우표',
  wave: '물결',
  bump: '돌출',
}

export const BOX_KIND_LABELS: Readonly<Record<TodayBoxKind, string>> = {
  text: '글자 박스',
  image_mask: '이미지 마스크',
}

// 색 이름 표는 서버 모듈도 쓰도록 순수 파일(`lib/admin/feedColorLabels.ts`)로 옮겼다(티켓 20261122_2224 회차 9). 기존 가져오기 경로를 위해 다시 내보낸다.
export { FEED_COLOR_LABELS }

// ── 유형별로 보이는 칸 ──────────────────────────────────────────

export interface FeedFieldVisibility {
  /** 박스 모양 */
  boxShape: boolean
  /** 박스 용도 */
  boxKind: boolean
  /** 칩 색 — 칩을 둘 수 있는 유형만 */
  chipColor: boolean
  /** 박스 색 */
  boxColor: boolean
  /** 설명 문장 노출을 고를 수 있는가(보이지 않는 유형은 비활성) */
  description: boolean
  /** 도장을 둘 수 있는 자리(없으면 도장 칸이 비활성) */
  stampSlots: readonly string[]
}

/** 유형이 쓰는 칸. 유형이 없으면 아무 칸도 쓰지 않는다. */
export function feedFieldVisibility(feedType: FeedType): FeedFieldVisibility {
  return {
    boxShape: BOX_FEED_TYPES.includes(feedType),
    boxKind: BOX_KIND_FEED_TYPES.includes(feedType),
    chipColor: chipLimitOf(feedType) > 0,
    boxColor: BOX_FEED_TYPES.includes(feedType),
    description: DESCRIPTION_DEFAULT[feedType],
    stampSlots: FEED_CHIP_SLOT_SPECS[feedType].slots.filter((slot) => cornerOfSlot(slot) !== null),
  }
}

/**
 * 값이 없으면 홈이 텍스트 박스로 그리는 유형의 안내(`lib/today/feedType.ts`의 `resolveFeedType`과 같은 조건).
 * 사용자가 값 없이 이 유형을 골라 미리보기가 텍스트 박스로 보여도 이유를 알 수 있게 한다. 해당하지 않는 유형은 null이다.
 */
export const FEED_TYPE_VALUE_NOTES: Readonly<Partial<Record<FeedType, string>>> = {
  collection_intro: '컬렉션 소개는 커버 미디어에 대표 그림을 넣어야 새 모습으로 보여요. 비어 있으면 텍스트 박스로 보여요.',
  drop_pickup: '드랍·픽업은 참조 컨텐츠에서 배지를 하나 이상 연결해야 새 모습으로 보여요. 비어 있으면 텍스트 박스로 보여요.',
  gallery_list: '목록형은 항목을 하나 이상 적어야 새 모습으로 보여요. 비어 있으면 텍스트 박스로 보여요.',
}

export function feedTypeValueNote(feedType: FeedType | null): string | null {
  return feedType ? (FEED_TYPE_VALUE_NOTES[feedType] ?? null) : null
}

/**
 * 유형을 바꿀 때 폼 값에 함께 적용할 변경. 새 유형이 허용하지 않는 도장 자리는 비우고(저장 검증이 막는 값이라서),
 * 도장을 둘 수 있는 자리가 아예 없는 유형으로 바꾸면 도장 «사용»을 «자동»으로 되돌린다(막힌 칸에 `stamp_enabled=true`가 남아 저장되지 않게).
 */
export function typeChangePatch(values: FeedCardFormValues, next: string): Partial<FeedCardFormValues> {
  const patch: Partial<FeedCardFormValues> = { feedType: next as FeedCardFormValues['feedType'] }
  if (!isFeedType(next)) return patch
  const { stampSlots } = feedFieldVisibility(next)
  if (values.stampSlot && !stampSlots.includes(values.stampSlot)) patch.stampSlot = ''
  if (stampSlots.length === 0 && values.stampMode === 'on') patch.stampMode = 'auto'
  // 5-3: 새 유형이 놓을 수 없는 칩 자리는 «자동»으로 되돌리고, 칩 개수 한도를 넘는 칩은 뒤에서부터 덜어낸다(저장 검증이 막는 값이라서).
  if (values.chips.length > 0) {
    const spec = FEED_CHIP_SLOT_SPECS[next]
    const kept = values.chips.slice(0, chipLimitOf(next))
    const fixed = kept.map((chip) => (chip.slot && !spec.slots.includes(chip.slot) ? { ...chip, slot: '' } : chip))
    const second = fixed[1]
    // 두 칩이 새 유형에서 대각선 짝이 아니면 두 번째 칩의 자리를 «자동»으로 풀어 둔다.
    if (second && fixed[0].slot && second.slot && diagonalOf(next, fixed[0].slot) !== second.slot) fixed[1] = { ...second, slot: '' }
    if (kept.length !== values.chips.length || fixed.some((chip, i) => chip !== values.chips[i])) patch.chips = fixed
  }
  // 목록 항목·컬렉션 모션 값은 그 유형만 쓰므로 다른 유형으로 바꾸면 비운다(숨은 칸 값이 저장되지 않게).
  if (next !== 'gallery_list' && (values.listItems.length > 0 || values.listMoreHref)) {
    patch.listItems = []
    patch.listMoreHref = ''
  }
  if (next !== 'collection_intro' && values.collectionBurst.length > 0) patch.collectionBurst = []
  return patch
}

// ── 색 경고 ────────────────────────────────────────────────────

const colorName = (key: FeedColorKey): string => FEED_COLOR_LABELS[key]

/**
 * 고른 색 조합이 규칙에 걸리거나 사용자가 제외한 조합이면 경고 문구를 돌려준다. 막지 않고 알리기만 한다(PRD «수동 지정»).
 * 칩의 배제 표 위반·바탕–박스 같은 색·글자 박스에 짙은 초록 박스는 서버 검증 경고와 같은 함수(`colorRuleWarnings`)가 판정한다(티켓 20261122_2224 회차 9).
 * 두 칸 다 고른 짝만 본다. 보이지 않는 칸(`show`가 거짓)이 낀 짝은 건너뛴다.
 * 이미지 색 경고는 `FEED_COLORS`의 hex로 겹침을 판정한다.
 */
export function feedColorWarnings(
  values: Pick<FeedCardFormValues, 'bgColorKey' | 'chipColorKey' | 'boxColorKey'> & Partial<Pick<FeedCardFormValues, 'feedType' | 'boxKind'>>,
  show: { chip: boolean; box: boolean },
  excludedPairs: readonly ExcludedColorPair[] = [],
  imageColors?: FeedImageColorInput,
): string[] {
  const warnings = colorRuleWarnings({
    bg: values.bgColorKey,
    chip: values.chipColorKey,
    box: values.boxColorKey,
    feedType: values.feedType,
    boxKind: values.boxKind,
    show,
    excludedPairs,
  })
  warnings.push(...imageColorWarnings(values, show, imageColors))
  return warnings
}

/**
 * 직접 고른 배경색(규칙 ⑤)·칩 색(규칙 ⑥)이 이미지 대표 색과 겹치면 경고 문구를 돌려준다(티켓 20261121_1829, 상위 20261120_2026 7회차-7).
 * 이미지 대표 색을 아는 경우(`imageHexes`가 비어 있지 않을 때)만 본다 — 알 수 없으면 조용히 건너뛴다. 칩은 이미지 위에 걸치는 유형(`chipOnImage`)일 때만 본다.
 * 비워 둔 «자동» 칸은 검사하지 않는다(자동은 저장할 때 이미지 규칙을 지켜서 정한다). 판정은 `violatesImageColorRule`이고 이유 문구는 `COLOR_RULE_REASON.image`다.
 */
function imageColorWarnings(
  values: Pick<FeedCardFormValues, 'bgColorKey' | 'chipColorKey'>,
  show: { chip: boolean },
  imageColors: FeedImageColorInput | undefined,
): string[] {
  if (!imageColors || imageColors.imageHexes.length === 0) return []
  const candidates: ReadonlyArray<readonly [string, FeedColorKey | '', boolean]> = [
    ['배경색', values.bgColorKey, true],
    ['칩 색', values.chipColorKey, show.chip && imageColors.chipOnImage],
  ]
  const warnings: string[] = []
  for (const [label, key, applies] of candidates) {
    if (!applies || !key) continue
    // 저장된 값이 9키에 없으면(옛 키) 색을 모르니 건너뛴다
    const hex = (FEED_COLORS as Readonly<Record<string, { hex: string } | undefined>>)[key]?.hex
    if (!hex || !violatesImageColorRule(hex, imageColors.imageHexes)) continue
    warnings.push(`${label}(${colorName(key)})이 색 규칙에 걸려요. ${COLOR_RULE_REASON.image}. 저장은 되지만 다른 색을 골라 보세요.`)
  }
  return warnings
}

/** 제목 속 칩 낱말이 제목에 그대로 들어 있지 않으면 오류 문구를 돌려준다(저장 막힘, `validateFeedCardColumns`와 같은 규칙·문구). */
export function titleChipWordError(word: string, title: string): string | null {
  const trimmed = word.trim()
  if (trimmed.length === 0 || title.includes(trimmed)) return null
  return `제목에 「${trimmed}」가 그대로 들어 있지 않아요. 제목 속 낱말만 칩으로 만들 수 있으니 제목이나 낱말을 고쳐 주세요.`
}

// ── 부품 ──────────────────────────────────────────────────────

/** 색 고르기 선택지: 자리마다 쓰임 표(`FEED_COLOR_USAGE`)의 색만 보인다(`feedColorChoices`). 비워 두면 «자동»이다. */
const COLOR_OPTIONS: Readonly<Record<FeedColorRole, readonly ChoiceOption[]>> = {
  bg: feedColorChoices('bg'),
  chip: feedColorChoices('chip'),
  box: feedColorChoices('box'),
}

const BOX_SHAPE_OPTIONS: readonly ChoiceOption[] = BOX_SHAPES.map((shape) => ({
  value: shape,
  label: BOX_SHAPE_LABELS[shape],
}))

const BOX_KIND_OPTIONS: readonly ChoiceOption[] = (Object.keys(BOX_KIND_LABELS) as TodayBoxKind[]).map((kind) => ({
  value: kind,
  label: BOX_KIND_LABELS[kind],
}))

const TYPE_OPTIONS: readonly ChoiceOption[] = FEED_TYPES.map((type) => ({ value: type, label: FEED_TYPE_LABELS[type] }))

const DESCRIPTION_OPTIONS: readonly SegmentOption<FeedDescriptionMode>[] = [
  { value: 'auto', label: '자동' },
  { value: 'show', label: '보임' },
  { value: 'hide', label: '숨김' },
]

const STAMP_OPTIONS: readonly SegmentOption<FeedStampMode>[] = [
  { value: 'auto', label: '자동' },
  { value: 'off', label: '사용 안 함' },
  { value: 'on', label: '사용' },
]

// ── 섹션 ──────────────────────────────────────────────────────

export interface FeedCardSectionProps {
  values: FeedCardFormValues
  /** 바꾼 칸만 넘긴다 */
  onChange: (patch: Partial<FeedCardFormValues>) => void
  /** 카드 제목. 제목 속 칩 낱말이 제목에 들어 있는지 본다. */
  title: string
  /** 카드 템플릿. 값 칩의 출처를 카드 템플릿에 맞는 것만 보여 준다(생략하면 전부). */
  templateType?: TodayCardTemplateType
  /** Radix Select 포털 컨테이너(어드민 테마 스코프) */
  themeContainer?: HTMLElement | null
  /** 사용자가 검수표에서 제외한 색 조합. 아직 저장 자리가 없어(6회차) 생략하면 규칙 판정만 한다. */
  excludedColorPairs?: readonly ExcludedColorPair[]
  /** 카드의 저장된 커버 대표 색(`today_cards.cover_colors`). 모르면(새 카드·커버를 바꾼 뒤·아직 안 뽑음) 생략한다 — 그러면 이미지 규칙 경고를 하지 않는다. */
  coverColors?: unknown
  /** 카드가 가리키는 배지들의 대표 색(`badges.bg_colors`), `badge_ids` 순서 그대로. 모르는 배지는 `undefined`로 둔다. 생략하면 배지 색을 모르는 것이다. */
  badgeColors?: readonly unknown[]
  /** 커버 대표 색이 저장 전이라 아직 없다(새 카드이거나 커버 이미지를 바꿨다). 커버 색 규칙을 쓰는 유형에서 안내 한 줄을 보인다. */
  coverColorsPending?: boolean
}

/** 커버 이미지 대표 색으로 이미지 규칙을 판정하는 유형인가 — 규칙 표(`imageColorsForCard`)를 그대로 읽어 따로 목록을 만들지 않는다. */
function usesCoverColorRule(feedType: FeedType, boxKind: string): boolean {
  return imageColorsForCard({ feedType, boxKind, coverColors: ['#000000'], badgeColors: [] }).imageHexes.length > 0
}

/** 「카드 모양」 섹션의 안쪽(섹션 카드 껍데기는 `TodayCardForm`이 감싼다). */
export default function FeedCardSection({
  values,
  onChange,
  title,
  templateType,
  themeContainer,
  excludedColorPairs,
  coverColors,
  badgeColors,
  coverColorsPending,
}: FeedCardSectionProps) {
  const feedType: FeedType | null = isFeedType(values.feedType) ? values.feedType : null
  const visible = feedType ? feedFieldVisibility(feedType) : null

  function changeType(next: string) {
    onChange(typeChangePatch(values, next))
  }

  const imageColors = feedType
    ? imageColorsForCard({ feedType, boxKind: values.boxKind, coverColors, badgeColors })
    : undefined
  const colorWarnings = visible
    ? feedColorWarnings(values, { chip: visible.chipColor, box: visible.boxColor }, excludedColorPairs, imageColors)
    : []
  const showCoverColorsNotice = Boolean(coverColorsPending && feedType && usesCoverColorRule(feedType, values.boxKind))

  const words = Array.from({ length: MAX_TITLE_CHIPS }, (_, index) => values.titleChipWords[index] ?? '')
  function changeWord(index: number, word: string) {
    onChange({ titleChipWords: words.map((w, i) => (i === index ? word : w)) })
  }

  const stampSlotOptions: readonly ChoiceOption[] = (visible?.stampSlots ?? []).map((slot) => ({
    value: slot,
    label: stampSlotLabel(slot),
  }))

  return (
    <div className="@container flex flex-col gap-4">
      <div className={FIELD_GRID_CLASS}>
        <ChoiceField
          id="feed-card-type"
          label="카드 유형"
          value={values.feedType}
          options={TYPE_OPTIONS}
          autoLabel="유형을 골라 주세요"
          required
          onChange={(v) => changeType(v)}
          themeContainer={themeContainer}
          help="유형을 고르면 그 유형이 쓰는 칸만 보여요."
        />
      </div>
      {feedTypeValueNote(feedType) && (
        <p role="note" className="m-0 text-sm text-muted-foreground break-keep wrap-break-word">
          {feedTypeValueNote(feedType)}
        </p>
      )}

      {visible && feedType && (
        <>
          <div className={FIELD_GRID_CLASS}>
            {visible.boxShape && (
              <ChoiceField
                id="feed-card-box-shape"
                label="박스 모양"
                value={values.boxShape}
                options={BOX_SHAPE_OPTIONS}
                onChange={(v) => onChange({ boxShape: v as FeedCardFormValues['boxShape'] })}
                themeContainer={themeContainer}
              />
            )}
            {visible.boxKind && (
              <ChoiceField
                id="feed-card-box-kind"
                label="박스 용도"
                value={values.boxKind}
                options={BOX_KIND_OPTIONS}
                onChange={(v) => onChange({ boxKind: v as FeedCardFormValues['boxKind'] })}
                themeContainer={themeContainer}
              />
            )}
            <ChoiceField
              id="feed-card-bg-color"
              label="배경색"
              value={values.bgColorKey}
              options={COLOR_OPTIONS.bg}
              currentValueOption={currentColorChoice('bg', values.bgColorKey)}
              onChange={(v) => onChange({ bgColorKey: v as FeedCardFormValues['bgColorKey'] })}
              themeContainer={themeContainer}
            />
            {visible.chipColor && (
              <ChoiceField
                id="feed-card-chip-color"
                label="칩 색"
                value={values.chipColorKey}
                options={COLOR_OPTIONS.chip}
                currentValueOption={currentColorChoice('chip', values.chipColorKey)}
                onChange={(v) => onChange({ chipColorKey: v as FeedCardFormValues['chipColorKey'] })}
                themeContainer={themeContainer}
              />
            )}
            {visible.boxColor && (
              <ChoiceField
                id="feed-card-box-color"
                label="박스 색"
                value={values.boxColorKey}
                options={COLOR_OPTIONS.box}
                currentValueOption={currentColorChoice('box', values.boxColorKey)}
                onChange={(v) => onChange({ boxColorKey: v as FeedCardFormValues['boxColorKey'] })}
                themeContainer={themeContainer}
              />
            )}
          </div>

          {colorWarnings.length > 0 && (
            <ul role="status" className="flex flex-col gap-1" data-testid="feed-color-warnings">
              {colorWarnings.map((warning) => (
                <li key={warning} className={cn('text-xs text-amber-700', TEXT_CLASS)}>
                  {warning}
                </li>
              ))}
            </ul>
          )}

          {showCoverColorsNotice && (
            <p role="note" className="m-0 text-xs text-muted-foreground break-keep wrap-break-word" data-testid="feed-cover-colors-notice">
              커버 이미지를 저장하면 색이 겹치는지 알려 드려요.
            </p>
          )}

          <div className={FIELD_GRID_CLASS}>
            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel id="feed-card-description-label" className={TEXT_CLASS}>
                설명 문장 노출
              </FieldLabel>
              <fieldset disabled={!visible.description} className="m-0 min-w-0 border-0 p-0 disabled:opacity-50">
                <SegmentedControl
                  label="설명 문장 노출"
                  value={values.descriptionMode}
                  options={DESCRIPTION_OPTIONS}
                  onChange={(mode) => onChange({ descriptionMode: mode })}
                />
              </fieldset>
              <FieldMessage className={TEXT_CLASS}>
                {!visible.description
                  ? '이 유형은 설명을 보이지 않아요'
                  : values.descriptionMode === 'auto'
                    ? AUTO_HINT
                    : '고른 값으로 보여요'}
              </FieldMessage>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <FieldLabel id="feed-card-stamp-label" className={TEXT_CLASS}>
                도장
              </FieldLabel>
              <fieldset disabled={visible.stampSlots.length === 0} className="m-0 min-w-0 border-0 p-0 disabled:opacity-50">
                <SegmentedControl
                  label="도장 사용"
                  value={values.stampMode}
                  options={STAMP_OPTIONS}
                  onChange={(mode) => onChange({ stampMode: mode })}
                />
              </fieldset>
              <FieldMessage className={TEXT_CLASS}>
                {visible.stampSlots.length === 0
                  ? '이 유형은 도장을 쓰지 않아요'
                  : values.stampMode === 'auto'
                    ? AUTO_HINT
                    : values.stampMode === 'off'
                      ? '도장 없이 보여요'
                      : '아래에서 자리를 골라요'}
              </FieldMessage>
            </div>

            {visible.stampSlots.length > 0 && values.stampMode === 'on' && (
              <ChoiceField
                id="feed-card-stamp-slot"
                label="도장 자리"
                value={values.stampSlot}
                options={stampSlotOptions}
                onChange={(v) => onChange({ stampSlot: v })}
                themeContainer={themeContainer}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel id="feed-card-title-chip-label" className={TEXT_CLASS}>
              제목 속 칩 낱말
            </FieldLabel>
            <div className={FIELD_GRID_CLASS}>
              {words.map((word, index) => {
                const error = titleChipWordError(word, title)
                const inputId = `feed-card-title-chip-word-${index + 1}`
                return (
                  <div key={inputId} className={'flex min-w-0 flex-col gap-1.5'}>
                    <Input
                      id={inputId}
                      value={word}
                      onChange={(e) => changeWord(index, e.target.value)}
                      autoComplete="off"
                      aria-label={`제목 속 칩 낱말 ${index + 1}`}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? `${inputId}-error` : undefined}
                      className="aria-invalid:border-destructive"
                    />
                    {error && (
                      <FieldMessage id={`${inputId}-error`} tone="error" className={TEXT_CLASS}>
                        {error}
                      </FieldMessage>
                    )}
                  </div>
                )
              })}
            </div>
            <FieldMessage className={TEXT_CLASS}>
              제목에 그대로 들어 있는 낱말을 최대 {MAX_TITLE_CHIPS}개까지 적어요. 비워 두면 제목이 글자로만 보여요.
            </FieldMessage>
          </div>

          {chipLimitOf(feedType) > 0 && (
            <FeedChipsEditor
              feedType={feedType}
              templateType={templateType}
              mode={values.chipsMode}
              chips={values.chips}
              onChange={onChange}
              themeContainer={themeContainer}
            />
          )}
          {feedType === 'gallery_list' && (
            <FeedListItemsEditor items={values.listItems} moreHref={values.listMoreHref} onChange={onChange} />
          )}
          {feedType === 'collection_intro' && (
            <FeedBurstEditor rows={values.collectionBurst} seed={values.feedSeed} onChange={onChange} />
          )}
        </>
      )}
    </div>
  )
}
