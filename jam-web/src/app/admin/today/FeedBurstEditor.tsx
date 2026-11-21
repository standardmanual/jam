'use client'

/**
 * 「카드 모양」 섹션의 컬렉션 모션 입력 칸(컬렉션 소개 `collection_intro` 전용) — 홈피드 개편 5회차-3 (티켓 20261121_1317, 상위 20261120_2026).
 *
 * «자동»(저장 칸 NULL, 카드 시드로 홈이 정한다)과 «직접». 직접이면 배지 4개(`FEED_BURST.count`)마다 도착 위치 x·y(−1~1, 가운데에서 카드 가장자리까지를 1로 본 값)·
 * 크기(68~84px)·기울기(−45~45도)·시작 지연(70~210ms)을 숫자 칸으로 입력한다. 범위는 5-1의 `BURST_RANGE`가 정본이라 화면과 저장 검증이 같다.
 * «자동 값 불러오기»는 카드 시드로 `generateCollectionBurst`가 만든 값을 칸에 채운다(채운 뒤 고친다).
 * 폼에는 모드 칸이 없어 «배지 행이 하나라도 있으면 직접»으로 본다.
 */
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { FieldLabel, FieldMessage, SegmentedControl, type SegmentOption } from '@/app/admin/badges/BadgeFormControls'
import {
  BURST_RANGE,
  buildFeedCardColumns,
  createFeedSeed,
  EMPTY_FEED_CARD_FORM_VALUES,
  validateFeedCardColumns,
  type FeedBurstFormValue,
  type FeedCardFormValues,
  type FeedCardValidation,
} from '@/lib/admin/feedCardFields'
import { FEED_BURST } from '@/lib/today/feedConstants'
import { generateCollectionBurst } from '@/lib/today/feedLook'
import { cn } from '@/lib/utils'

const TEXT_CLASS = 'break-keep wrap-break-word'
const AUTO_HINT = '홈이 카드마다 정해 줘요'

type BurstMode = 'auto' | 'custom'

const MODE_OPTIONS: readonly SegmentOption<BurstMode>[] = [
  { value: 'auto', label: '자동' },
  { value: 'custom', label: '직접' },
]

// ── 칸 정의 ────────────────────────────────────────────────────

interface BurstFieldSpec {
  key: keyof FeedBurstFormValue
  label: string
  range: { readonly min: number; readonly max: number }
  /** 비우면 그 칸만 홈이 정한다(x·y는 필수) */
  required: boolean
  step: string
}

export const BURST_FIELDS: readonly BurstFieldSpec[] = [
  { key: 'x', label: '가로 위치', range: BURST_RANGE.xy, required: true, step: '0.01' },
  { key: 'y', label: '세로 위치', range: BURST_RANGE.xy, required: true, step: '0.01' },
  { key: 'size', label: '크기(px)', range: BURST_RANGE.size, required: false, step: '1' },
  { key: 'tilt', label: '기울기(도)', range: BURST_RANGE.tilt, required: false, step: '1' },
  { key: 'delayMs', label: '시작 지연(ms)', range: BURST_RANGE.delayMs, required: false, step: '1' },
]

// ── 순수 함수 ──────────────────────────────────────────────────

/** 칸 값이 범위 밖(또는 숫자가 아님)인가. 빈 칸은 필수 칸일 때만 오류다. */
export function burstFieldInvalid(field: BurstFieldSpec, text: string): boolean {
  if (text.trim().length === 0) return field.required
  const value = Number(text)
  return !Number.isFinite(value) || value < field.range.min || value > field.range.max
}

/** 모든 칸이 빈 행. 저장할 때 떨어지므로(`buildFeedCardColumns`) 오류로 보지 않는다. */
export function isBlankBurstRow(row: FeedBurstFormValue): boolean {
  return BURST_FIELDS.every((field) => row[field.key].trim().length === 0)
}

/** 입력 칸의 시드 글자를 시드 숫자로. 비었거나 올바르지 않으면 난수 공급 함수로 임시 시드를 만든다(저장되는 시드가 아니다). */
export function burstSeedOf(seedText: string, randomUint32: () => number = () => Math.random() * 2 ** 32): number {
  const text = seedText.trim()
  const value = Number(text)
  if (text.length > 0 && Number.isInteger(value) && value >= 0 && value <= 2 ** 32 - 1) return value
  return createFeedSeed(randomUint32)
}

/** 카드 시드로 홈이 정하는 배지 4개 자리를 폼 값(글자)으로 만든다. */
export function burstRowsFromSeed(seed: number): FeedBurstFormValue[] {
  return generateCollectionBurst(seed).map((point) => ({
    x: String(point.x),
    y: String(point.y),
    tilt: String(point.tilt),
    size: String(point.size),
    delayMs: String(point.delayMs),
  }))
}

export function burstRowWithPatch(rows: readonly FeedBurstFormValue[], index: number, patch: Partial<FeedBurstFormValue>): FeedBurstFormValue[] {
  return rows.map((row, i) => (i === index ? { ...row, ...patch } : { ...row }))
}

/** 모션 칸에 보일 검증 결과. 저장 때 쓰는 `validateFeedCardColumns`를 모션 칸만 넣어 호출하므로 문구가 저장 오류와 같다. */
export function burstValidation(rows: readonly FeedBurstFormValue[]): FeedCardValidation {
  const columns = buildFeedCardColumns({ ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'collection_intro', collectionBurst: [...rows] })
  return validateFeedCardColumns({ feed_type: columns.feed_type, collection_burst: columns.collection_burst }, { title: '' })
}

// ── 편집기 ─────────────────────────────────────────────────────

export interface FeedBurstEditorProps {
  rows: FeedBurstFormValue[]
  /** 카드 시드 글자(`FeedCardFormValues.feedSeed`). 새 카드는 비어 있고 이때는 임시 시드로 불러온다 */
  seed: string
  /** 바꾼 칸만 넘긴다 */
  onChange: (patch: Partial<Pick<FeedCardFormValues, 'collectionBurst'>>) => void
}

export default function FeedBurstEditor({ rows, seed, onChange }: FeedBurstEditorProps) {
  const mode: BurstMode = rows.length > 0 ? 'custom' : 'auto'
  const validation = burstValidation(rows)
  const loadFromSeed = () => onChange({ collectionBurst: burstRowsFromSeed(burstSeedOf(seed)) })

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="feed-burst-editor">
      <div className="flex min-w-0 flex-col gap-1.5">
        <FieldLabel id="feed-card-burst-label" className={TEXT_CLASS}>
          컬렉션 모션
        </FieldLabel>
        <SegmentedControl
          label="컬렉션 모션 입력 방식"
          value={mode}
          options={MODE_OPTIONS}
          onChange={(next) => onChange({ collectionBurst: next === 'custom' ? burstRowsFromSeed(burstSeedOf(seed)) : [] })}
        />
        <FieldMessage className={TEXT_CLASS}>
          {mode === 'auto'
            ? AUTO_HINT
            : '배지 4개가 도착할 위치를 정해요. 가로·세로 위치는 가운데가 0, 카드 가장자리가 −1과 1이에요'}
        </FieldMessage>
      </div>

      {mode === 'custom' && (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={loadFromSeed}>
              자동 값 불러오기
            </Button>
            <FieldMessage className={TEXT_CLASS}>지금 시드로 홈이 정할 값을 칸에 채워요. 채운 뒤 고쳐 주세요</FieldMessage>
          </div>

          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {Array.from({ length: FEED_BURST.count }, (_, index) => {
              const no = index + 1
              const row = rows[index] ?? { x: '', y: '', tilt: '', size: '', delayMs: '' }
              return (
                <li key={`feed-card-burst-${no}`} className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
                  <span className={cn('text-[13px] font-medium text-foreground', TEXT_CLASS)}>배지 {no}</span>
                  <div className="grid grid-cols-1 gap-x-3.5 gap-y-3 @sm:grid-cols-2 @lg:grid-cols-3">
                    {BURST_FIELDS.map((field) => {
                      const id = `feed-card-burst-${no}-${field.key}`
                      const invalid = burstFieldInvalid(field, row[field.key]) && !isBlankBurstRow(row)
                      return (
                        <div key={id} className="flex min-w-0 flex-col gap-1.5">
                          <FieldLabel htmlFor={id} className={TEXT_CLASS}>
                            배지 {no} {field.label}
                          </FieldLabel>
                          <Input
                            id={id}
                            type="number"
                            inputMode="decimal"
                            step={field.step}
                            min={field.range.min}
                            max={field.range.max}
                            value={row[field.key]}
                            onChange={(e) => {
                              const next = rows.length > 0 ? [...rows] : []
                              while (next.length < FEED_BURST.count) next.push({ x: '', y: '', tilt: '', size: '', delayMs: '' })
                              onChange({ collectionBurst: burstRowWithPatch(next, index, { [field.key]: e.target.value }) })
                            }}
                            aria-invalid={invalid ? true : undefined}
                            aria-describedby={`${id}-help`}
                            className="aria-invalid:border-destructive"
                          />
                          <FieldMessage id={`${id}-help`} tone={invalid ? 'error' : 'help'} className={TEXT_CLASS}>
                            {field.range.min}~{field.range.max}
                            {field.required ? '' : ' · 비우면 홈이 정해요'}
                          </FieldMessage>
                        </div>
                      )
                    })}
                  </div>
                </li>
              )
            })}
          </ul>

          {(validation.errors.length > 0 || validation.warnings.length > 0) && (
            <ul role="status" className="m-0 flex list-none flex-col gap-1 p-0" data-testid="feed-burst-messages">
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
