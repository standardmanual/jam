'use client'

/**
 * 미션 「달성 조건」 섹션 — 원시 JSON textarea 대신 조건 필드를 골라 채우는 UI (티켓 20260911_2118)
 *
 * 배지 폼의 `BadgeConditionSection`과 같은 원칙이다 — **이 컴포넌트는 값을 만들지 않는다.**
 * 저장될 `condition_json`은 `MissionForm`이 `buildMissionConditionJson`으로 조립해
 * `conditionPreview`로 넘긴다. mission_type이 바뀌어도 각 필드의 state는 그대로 남는다(다른
 * 타입으로 잠깐 바꿨다 되돌려도 입력이 사라지지 않는다) — 실제로 저장되는 값은 그 시점의
 * mission_type이 쓰는 필드만 골라 조립한다.
 */
import { useState, type ReactElement } from 'react'
import type { MissionCondition, MissionType } from '@/types/database'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import PoiSearchSelect from '@/components/admin/PoiSearchSelect'
import { getConditionField, ACTIVITY_TYPE_FORM_OPTIONS, type ConditionFormEntry } from '@/lib/badge-engine/conditionRegistry'
import { FieldLabel, FieldMessage, SuffixInput } from '@/app/admin/badges/BadgeFormControls'
import { cn } from '@/lib/utils'
import {
  JAM_PERIOD_EARNED_INPUT,
  MISSION_DB_FORM_GROUPS,
  MISSION_DB_HELP_OVERRIDES,
  MISSION_DB_OBJECT_COUNT_FIELDS,
  MISSION_DB_OBJECT_COUNT_RANGE,
  MISSION_ENGINE_DELEGATED_KEYS,
  filledMissionDbKeys,
  missionTypeUsesActivityTypeFilter,
  selectOptionsWithCurrent,
  type MissionConditionFormFields,
} from './missionConditionFields'

const NONE_VALUE = '__none__'

const DAY_OF_WEEK_OPTIONS: { value: string; label: string }[] = [
  { value: 'monday', label: '월' },
  { value: 'tuesday', label: '화' },
  { value: 'wednesday', label: '수' },
  { value: 'thursday', label: '목' },
  { value: 'friday', label: '금' },
  { value: 'saturday', label: '토' },
  { value: 'sunday', label: '일' },
]

/** 한국어 줄바꿈 — 새로 만들거나 고치는 문구에 붙인다(UX_WRITING_GUIDELINE §3.2) */
const KO_TEXT = 'break-keep wrap-break-word'
const KO_HELP = 'break-keep wrap-break-word text-balance'

/** 위임 키 그리드(`sm` 2열 → `lg` 3열)에서 입력이 차지하는 칸 수 — 레지스트리 `span`을 이 그리드 기준으로 옮긴다 */
const GRID_SPAN_CLASS = { 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3' } as const

/** 「기록으로 세는 조건」 구역의 한 줄 설명 (티켓 20261021_1114 2회, 사용자 결정) */
const DB_CONDITION_SECTION_HELP = '참가한 뒤 미션 기간 안의 기록만 세요.'

/** 미션 타입을 「복합 조건」이 아닌 것으로 바꿨는데 기록으로 세는 조건이 입력돼 있을 때 보이는 경고 (사용자 결정) */
const DB_CONDITION_DROPPED_NOTICE =
  '이 미션 타입에서는 기록으로 세는 조건이 저장되지 않아요. 저장하면 지금 입력한 조건이 지워져요. 조건을 남기려면 타입을 원래대로 되돌려 주세요.'

const DISTINCT_MONTHS_METRIC_OPTIONS = [
  { value: 'distance_km', label: '누적 거리' },
  { value: 'elevation_gain_m', label: '누적 고도' },
] as const

export interface MissionConditionSectionProps {
  missionType: MissionType
  fields: MissionConditionFormFields
  setField: (field: keyof MissionConditionFormFields, value: string | boolean) => void
  /** 저장될 condition_json(MissionForm이 조립) */
  conditionPreview: MissionCondition | null
  /** 이 폼이 입력 UI를 주지 않는 조건 키(`time_band_counts`) — 값이 있으면 보존 안내를 띄운다 */
  unsupportedKeys: readonly string[]
  /** 「기록으로 세는 조건」의 장소 카테고리 선택지(`poi_categories`) — DB 테이블 기준이라 레지스트리에 정적으로 선언할 수 없어 주입한다 */
  poiCategories: readonly { slug: string; label: string }[]
  /** 아이템 픽업(badge_id) 초기 라벨 — 수정 화면에서 기존 값을 보여준다 */
  badgeIdInitialLabel?: string
  /** 체크인(poi_id) 초기 라벨 — 수정 화면에서 기존 값을 보여준다 */
  poiIdInitialLabel?: string
}

export default function MissionConditionSection({
  missionType,
  fields,
  setField,
  conditionPreview,
  unsupportedKeys,
  poiCategories,
  badgeIdInitialLabel,
  poiIdInitialLabel,
}: MissionConditionSectionProps) {
  const [jsonOpen, setJsonOpen] = useState(false)

  const activityTypeSelect = (id: string) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id}>종목 (선택)</FieldLabel>
      <Select
        value={fields.activityType || NONE_VALUE}
        onValueChange={(v) => setField('activityType', v === NONE_VALUE ? '' : v)}
      >
        <SelectTrigger id={id} aria-label="종목">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>전체 종목</SelectItem>
          {ACTIVITY_TYPE_FORM_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldMessage>비우면 모든 종목의 활동을 센다.</FieldMessage>
    </div>
  )

  // ── 단순 타입(7종) — 필드 1~2개 ──────────────────────────────────────────
  if (missionType !== 'engine_condition') {
    const withActivityType = missionTypeUsesActivityTypeFilter(missionType)
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {missionType === 'distance' && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-distance-km">목표 누적 거리</FieldLabel>
            <SuffixInput
              id="mc-distance-km"
              type="number"
              inputMode="decimal"
              value={fields.distanceKm}
              onChange={(e) => setField('distanceKm', e.target.value)}
              placeholder="50"
              suffix="km"
            />
          </div>
        )}
        {missionType === 'activity_count' && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-count">목표 활동 횟수</FieldLabel>
            <SuffixInput
              id="mc-count"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.count}
              onChange={(e) => setField('count', e.target.value)}
              placeholder="10"
              suffix="회"
            />
          </div>
        )}
        {missionType === 'streak_days' && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-streak-days">목표 연속 활동 일수</FieldLabel>
            <SuffixInput
              id="mc-streak-days"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.streakDays}
              onChange={(e) => setField('streakDays', e.target.value)}
              placeholder="7"
              suffix="일"
            />
          </div>
        )}
        {missionType === 'duration_minutes' && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-duration">목표 단일 활동 시간</FieldLabel>
            <SuffixInput
              id="mc-duration"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.durationMinutes}
              onChange={(e) => setField('durationMinutes', e.target.value)}
              placeholder="60"
              suffix="분"
            />
          </div>
        )}
        {missionType === 'elevation_gain_m' && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-elevation">목표 누적 고도</FieldLabel>
            <SuffixInput
              id="mc-elevation"
              type="number"
              inputMode="decimal"
              value={fields.elevationM}
              onChange={(e) => setField('elevationM', e.target.value)}
              placeholder="500"
              suffix="m"
            />
          </div>
        )}
        {missionType === 'checkin' && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <FieldLabel htmlFor="mc-poi">목표 장소</FieldLabel>
            <PoiSearchSelect
              value={fields.poiId}
              initialLabel={poiIdInitialLabel}
              placeholder="장소 이름 검색..."
              onChange={(id) => setField('poiId', id)}
            />
            <FieldMessage>이 장소에 체크인(매칭 배지 발급)하면 달성돼요.</FieldMessage>
          </div>
        )}
        {missionType === 'item_collect' && (
          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <FieldLabel htmlFor="mc-badge">목표 배지</FieldLabel>
            <BadgeSearchSelect
              value={fields.badgeId}
              initialLabel={badgeIdInitialLabel}
              placeholder="배지 이름 검색..."
              onChange={(id) => setField('badgeId', id)}
            />
            <FieldMessage>이 배지를 보유하면(인벤토리 포함) 달성돼요.</FieldMessage>
          </div>
        )}
        {withActivityType && activityTypeSelect('mc-activity-type')}

        {/* 기록으로 세는 조건이 입력돼 있는데 이 타입으로는 저장되지 않는다. 값은 지우지 않고 알리기만 한다(티켓 20261021_1114 2회) */}
        {filledMissionDbKeys(fields).length > 0 && (
          <div className="sm:col-span-2">
            <Alert variant="warning">
              <AlertDescription>
                <p className={cn('text-xs text-amber-800/80 text-pretty', KO_TEXT)}>{DB_CONDITION_DROPPED_NOTICE}</p>
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="sm:col-span-2">
          <ConditionJsonPreview open={jsonOpen} onOpenChange={setJsonOpen} conditionPreview={conditionPreview} />
        </div>
      </div>
    )
  }

  // ── 복합 조건(engine_condition) — 다중 조건 빌더 ─────────────────────────
  // 키마다 컨트롤을 전부 그린다 — 짝이 있는 `time_range`(시작·끝)는 한 줄로 묶는다(티켓 20261021_1114 1회).
  const delegatedNodes = MISSION_ENGINE_DELEGATED_KEYS.flatMap((key): ReactElement[] => {
    // 레지스트리에 입력 칸 정의가 없는 키 — 미션 쪽에서 정한 칸을 그린다
    if (key === 'day_of_week') return [renderDayOfWeekField(fields, setField)]
    const meta = getConditionField(key)
    const entries = (meta?.form?.controls ?? []).map(
      (control) => ({ meta, control, section: meta!.form!.section }) as ConditionFormEntry
    )
    return renderDelegatedEntries(entries, fields, setField)
  })

  // 「기록으로 세는 조건」은 소제목 6개로 묶는다. 장소 카테고리 선택지는 DB 값이라 여기서 주입한다
  const dbExtras: RenderExtras = {
    selectOptions: { checkinCategoryCountCategory: poiCategories.map((c) => ({ value: c.slug, label: c.label })) },
    helpOverrides: MISSION_DB_HELP_OVERRIDES,
    numberRanges: Object.fromEntries(MISSION_DB_OBJECT_COUNT_FIELDS.map((field) => [field, MISSION_DB_OBJECT_COUNT_RANGE])),
  }
  const dbGroupNodes = MISSION_DB_FORM_GROUPS.map((group, index) => {
    const nodes = group.keys.flatMap((key): ReactElement[] => {
      if (key === 'jam_period_earned') return [renderJamPeriodEarnedField(fields, setField)]
      const meta = getConditionField(key)
      const entries = (meta?.form?.controls ?? []).map(
        (control) => ({ meta, control, section: meta!.form!.section }) as ConditionFormEntry
      )
      return renderDelegatedEntries(entries, fields, setField, dbExtras)
    })
    const titleId = `mc-db-group-${index}`
    return (
      <div key={group.title} role="group" aria-labelledby={titleId} className="flex flex-col gap-2">
        <p id={titleId} className={cn('text-xs font-medium text-foreground/80', KO_TEXT)}>
          {group.title}
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{nodes}</div>
      </div>
    )
  })

  return (
    <div className="flex flex-col gap-5">
      <Alert>
        <AlertDescription>
          <p className="text-xs text-muted-foreground">
            아래 필드는 값을 채우는 만큼 전부 AND로 결합돼요 — 여러 필드를 함께 채우면 그 조건을 모두
            만족해야 달성돼요.
          </p>
        </AlertDescription>
      </Alert>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-bold text-foreground">배지엔진 조건</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {delegatedNodes}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3.5">
        <p className="text-xs font-bold text-foreground">미션 전용 조건 — 주기 · 요일 · 달력</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-weekly-streak">연속 주(월~일) 수</FieldLabel>
            <SuffixInput
              id="mc-weekly-streak"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.weeklyStreak}
              onChange={(e) => setField('weeklyStreak', e.target.value)}
              placeholder="4"
              suffix="주"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-weekly-streak-min">주간 최소 활동 횟수</FieldLabel>
            <SuffixInput
              id="mc-weekly-streak-min"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.weeklyStreakMinCount}
              onChange={(e) => setField('weeklyStreakMinCount', e.target.value)}
              placeholder="2"
              suffix="회"
              disabled={!fields.weeklyStreak}
            />
            <FieldMessage>비우면 1회 이상(존재만 확인)이에요. 연속 주 수를 채워야 의미가 있어요.</FieldMessage>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-monthly-streak">연속 개월 수</FieldLabel>
            <SuffixInput
              id="mc-monthly-streak"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.monthlyStreak}
              onChange={(e) => setField('monthlyStreak', e.target.value)}
              placeholder="3"
              suffix="개월"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-monthly-streak-min">월간 최소 활동 횟수</FieldLabel>
            <SuffixInput
              id="mc-monthly-streak-min"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.monthlyStreakMinCount}
              onChange={(e) => setField('monthlyStreakMinCount', e.target.value)}
              placeholder="4"
              suffix="회"
              disabled={!fields.monthlyStreak}
            />
            <FieldMessage>비우면 1회 이상(존재만 확인)이에요. 연속 개월 수를 채워야 의미가 있어요.</FieldMessage>
          </div>
        </div>

        {(fields.weeklyStreak || fields.monthlyStreak) && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3">
            <p className="text-xs font-medium text-foreground/80">
              주기 안 부분집합 — 그 기간(주/달) 안에서 추가로 만족해야 하는 조건(선택)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DAY_OF_WEEK_OPTIONS.map((d) => {
                const days = fields.streakSubsetDayOfWeek.split(',').map((s) => s.trim()).filter(Boolean)
                const checked = days.includes(d.value)
                return (
                  <label
                    key={d.value}
                    className="flex cursor-pointer items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = v === true ? [...days, d.value] : days.filter((x) => x !== d.value)
                        setField('streakSubsetDayOfWeek', next.join(', '))
                      }}
                    />
                    {d.label}
                  </label>
                )
              })}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldLabel htmlFor="mc-subset-start">시작 시각</FieldLabel>
                <Input
                  id="mc-subset-start"
                  type="time"
                  value={fields.streakSubsetTimeStart}
                  onChange={(e) => setField('streakSubsetTimeStart', e.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldLabel htmlFor="mc-subset-end">끝 시각</FieldLabel>
                <Input
                  id="mc-subset-end"
                  type="time"
                  value={fields.streakSubsetTimeEnd}
                  onChange={(e) => setField('streakSubsetTimeEnd', e.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <FieldLabel htmlFor="mc-subset-min">부분집합 최소 횟수</FieldLabel>
                <SuffixInput
                  id="mc-subset-min"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={fields.streakSubsetMinCount}
                  onChange={(e) => setField('streakSubsetMinCount', e.target.value)}
                  placeholder="1"
                  suffix="회"
                />
              </div>
            </div>
            <FieldMessage>
              요일 또는 시간대 중 하나 이상과 최소 횟수를 함께 채워야 적용돼요(예: 주말 1회 이상).
            </FieldMessage>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-distinct-weekday">서로 다른 요일 수</FieldLabel>
            <SuffixInput
              id="mc-distinct-weekday"
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              max="7"
              value={fields.distinctWeekdayCount}
              onChange={(e) => setField('distinctWeekdayCount', e.target.value)}
              placeholder="3"
              suffix="일"
            />
            <FieldMessage>특정 요일을 지정하지 않고 며칠에 나눠 했는지만 세요.</FieldMessage>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-distinct-months">서로 다른 달 수</FieldLabel>
            <SuffixInput
              id="mc-distinct-months"
              type="number"
              inputMode="numeric"
              step="1"
              value={fields.distinctMonthsRequired}
              onChange={(e) => setField('distinctMonthsRequired', e.target.value)}
              placeholder="2"
              suffix="개월"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-distinct-months-metric">기준 지표</FieldLabel>
            <Select
              value={fields.distinctMonthsMetric || NONE_VALUE}
              onValueChange={(v) => setField('distinctMonthsMetric', v === NONE_VALUE ? '' : v)}
              disabled={!fields.distinctMonthsRequired}
            >
              <SelectTrigger id="mc-distinct-months-metric" aria-label="기준 지표">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>누적 거리(기본값)</SelectItem>
                {DISTINCT_MONTHS_METRIC_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <FieldLabel htmlFor="mc-distinct-months-threshold">달성 문턱값</FieldLabel>
            <SuffixInput
              id="mc-distinct-months-threshold"
              type="number"
              inputMode="decimal"
              value={fields.distinctMonthsThreshold}
              onChange={(e) => setField('distinctMonthsThreshold', e.target.value)}
              placeholder="30"
              disabled={!fields.distinctMonthsRequired}
            />
            <FieldMessage>그 달의 지표 합계가 이 값을 넘어야 「그 달을 채웠다」로 세요.</FieldMessage>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-3.5">
        <div className="flex flex-col gap-1">
          <p className={cn('text-xs font-bold text-foreground', KO_TEXT)}>기록으로 세는 조건</p>
          <p className={cn('text-xs text-muted-foreground', KO_HELP)}>{DB_CONDITION_SECTION_HELP}</p>
        </div>
        {dbGroupNodes}
      </div>

      {unsupportedKeys.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <p className="text-xs text-amber-800/80">
              {unsupportedKeys.join(', ')} 값이 이미 설정돼 있어요. 이 화면에는 입력 항목이 없어 여기서 보거나
              고칠 수 없지만, 저장해도 값은 그대로 유지돼요.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <ConditionJsonPreview open={jsonOpen} onOpenChange={setJsonOpen} conditionPreview={conditionPreview} />
    </div>
  )
}

type SetField = (field: keyof MissionConditionFormFields, value: string | boolean) => void

/**
 * 레지스트리 컨트롤 정의만으로 그릴 수 없는 칸을 위한 보충. 칸 이름(`control.field`)이 키다. 「기록으로 세는 조건」 구역만 넘기고,
 * 넘기지 않으면 위임 키 칸은 1회와 똑같이 그려진다.
 */
interface RenderExtras {
  /** 선택지가 DB 값이라 레지스트리에 비어 있는 선택 칸의 선택지 */
  selectOptions?: Readonly<Record<string, readonly { value: string; label: string }[]>>
  /** 미션에서는 뜻이 달라지는 레지스트리 도움말을 바꾼다 */
  helpOverrides?: Readonly<Record<string, string>>
  /** 레지스트리 메타에 범위가 없는 수치 칸의 범위 */
  numberRanges?: Readonly<Record<string, { min: number; max: number; step: number }>>
}

/** 한 키의 컨트롤들 — 짝의 둘째 칸은 첫째 칸이 함께 그린다 */
function renderDelegatedEntries(
  entries: readonly ConditionFormEntry[],
  fields: MissionConditionFormFields,
  setField: SetField,
  extras?: RenderExtras
): ReactElement[] {
  const byField = new Map(entries.map((e) => [e.control.field, e]))
  const partnerFields = new Set(entries.flatMap((e) => (e.control.pair ? [e.control.pair.with] : [])))
  return entries.flatMap((entry) => {
    if (partnerFields.has(entry.control.field)) return []
    const partner = entry.control.pair ? byField.get(entry.control.pair.with) : undefined
    return [
      partner ? renderDelegatedPair(entry, partner, fields, setField) : renderDelegatedField(entry, fields, setField, extras),
    ]
  })
}

/** 수치·글자·시각 입력 칸 하나 — 수치는 레지스트리의 범위(min·max·step)를 그대로 건다 */
function renderDelegatedInput(
  entry: ConditionFormEntry,
  fields: MissionConditionFormFields,
  setField: SetField,
  ariaLabel?: string,
  range?: { min: number; max: number; step: number }
) {
  const { control, meta } = entry
  const field = control.field as keyof MissionConditionFormFields
  const suffix = control.kind === 'time' ? null : (control.suffix ?? meta.unit)
  return (
    <SuffixInput
      id={`mc-eng-${control.field}`}
      type={control.kind === 'number' ? 'number' : control.kind === 'time' ? 'time' : 'text'}
      inputMode={control.kind === 'number' ? 'decimal' : undefined}
      {...(control.kind === 'number'
        ? { min: range?.min ?? meta.min, max: range?.max ?? meta.max, step: range?.step ?? meta.step }
        : {})}
      value={fields[field] as string}
      onChange={(e) => setField(field, e.target.value)}
      placeholder={control.placeholder}
      suffix={suffix}
      aria-label={ariaLabel}
      autoComplete="off"
    />
  )
}

/** 짝 입력 한 줄(시간대 시작~끝) — 묶음 라벨 아래에 두 입력을 구분 글자로 잇는다 */
function renderDelegatedPair(
  a: ConditionFormEntry,
  b: ConditionFormEntry,
  fields: MissionConditionFormFields,
  setField: SetField
) {
  const pair = a.control.pair!
  const labelId = `mc-eng-${a.control.field}-pair`
  return (
    <div
      key={a.control.field}
      role="group"
      aria-labelledby={labelId}
      className={cn('flex min-w-0 flex-col gap-1.5', a.control.span && GRID_SPAN_CLASS[a.control.span])}
    >
      <FieldLabel id={labelId} className={KO_TEXT}>
        {pair.label}
      </FieldLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        {renderDelegatedInput(a, fields, setField, a.control.label ?? a.meta.label)}
        <span className="text-xs text-muted-foreground" aria-hidden="true">
          {pair.separator}
        </span>
        {renderDelegatedInput(b, fields, setField, b.control.label ?? b.meta.label)}
      </div>
      {a.control.help && <FieldMessage className={KO_HELP}>{a.control.help}</FieldMessage>}
      {b.control.help && <FieldMessage className={KO_HELP}>{b.control.help}</FieldMessage>}
    </div>
  )
}

/**
 * 활동 요일(`day_of_week`) — 레지스트리에 입력 칸 정의가 없어 미션 쪽에서 정했다(티켓 20261021_1114 1회).
 * 월~일 칩을 체크해 고른다. 값 모양(한 요일은 문자열, 여러 요일은 배열)은 `readDayOfWeek`가 정한다.
 */
function renderDayOfWeekField(fields: MissionConditionFormFields, setField: SetField) {
  const days = fields.dayOfWeek.split(',').map((s) => s.trim()).filter(Boolean)
  return (
    <div key="day_of_week" className={cn('flex min-w-0 flex-col gap-1.5', GRID_SPAN_CLASS[3])}>
      <FieldLabel id="mc-eng-day-of-week-label" className={KO_TEXT}>
        활동 요일
      </FieldLabel>
      <div role="group" aria-labelledby="mc-eng-day-of-week-label" className="flex flex-wrap gap-1.5">
        {DAY_OF_WEEK_OPTIONS.map((d) => (
          <label
            key={d.value}
            className="flex cursor-pointer items-center gap-1 whitespace-nowrap break-keep wrap-break-word rounded-full border border-border bg-white px-2.5 py-1 text-xs"
          >
            <Checkbox
              checked={days.includes(d.value)}
              onCheckedChange={(v) => {
                const next = v === true ? [...days, d.value] : days.filter((x) => x !== d.value)
                setField('dayOfWeek', next.join(', '))
              }}
            />
            {d.label}
          </label>
        ))}
      </div>
      <FieldMessage className={KO_HELP}>
        활동을 시작한 요일(한국 시간)로 좁혀요. 한 요일만 고르면 그 요일의 활동만 세고, 여러 요일은 「연속 주(월~일)
        수」와 함께 쓸 때만 반영돼요. 요일만으로는 달성을 판정할 수 없어서 거리나 횟수 같은 값을 함께 채워야 해요.
      </FieldMessage>
    </div>
  )
}

/** 배지엔진 위임 필드 하나 — 컨트롤 종류(number/text/time/checkbox/select)에 맞게 그린다 */
function renderDelegatedField(
  entry: ConditionFormEntry,
  fields: MissionConditionFormFields,
  setField: SetField,
  extras?: RenderExtras
) {
  const { control, meta } = entry
  const field = control.field as keyof MissionConditionFormFields
  const domId = `mc-eng-${control.field}`
  const label = control.label ?? meta.label
  const help = extras?.helpOverrides?.[control.field] ?? control.help

  if (control.kind === 'checkbox') {
    return (
      <div key={control.field} className="flex items-start gap-2.5 sm:col-span-2">
        <Checkbox
          id={domId}
          checked={fields[field] === true}
          onCheckedChange={(v) => setField(field, v === true)}
          className="mt-0.5"
        />
        <label htmlFor={domId} className={cn('cursor-pointer text-sm font-medium text-foreground', KO_TEXT)}>
          {label}
        </label>
      </div>
    )
  }

  if (control.kind === 'select') {
    const current = (fields[field] as string) || NONE_VALUE
    const injected = extras?.selectOptions?.[control.field]
    // 주입한 선택지에 없는 저장값(지워진 카테고리 등)은 값 그대로 보여 준다. 안 그러면 선택 칸이 비어 보이는 채로 저장된다
    const options = injected ? selectOptionsWithCurrent(injected, fields[field] as string) : (control.options ?? [])
    return (
      <div key={control.field} className={cn('flex min-w-0 flex-col gap-1.5', control.span && GRID_SPAN_CLASS[control.span])}>
        <FieldLabel htmlFor={domId} className={KO_TEXT}>
          {label}
        </FieldLabel>
        <Select value={current} onValueChange={(v) => setField(field, v === NONE_VALUE ? '' : v)}>
          <SelectTrigger id={domId} aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{control.noneLabel ?? '— 없음 —'}</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help && <FieldMessage className={KO_HELP}>{help}</FieldMessage>}
      </div>
    )
  }

  return (
    <div key={control.field} className={cn('flex min-w-0 flex-col gap-1.5', control.span && GRID_SPAN_CLASS[control.span])}>
      <FieldLabel htmlFor={domId} className={KO_TEXT}>
        {label}
      </FieldLabel>
      {renderDelegatedInput(entry, fields, setField, undefined, extras?.numberRanges?.[control.field])}
      {help && <FieldMessage className={KO_HELP}>{help}</FieldMessage>}
    </div>
  )
}

/**
 * 기간 동안 모은 잼(`jam_period_earned`). 배지 조건 레지스트리에 없는 미션 전용 키라 입력 칸 정의를 미션 쪽에서 정했다
 * (`JAM_PERIOD_EARNED_INPUT`, 티켓 20261021_1114 2회). 1 이상 정수 칸이고 도움말은 참가 전에 모은 잼이 세어지지 않는다는 말이다.
 */
function renderJamPeriodEarnedField(fields: MissionConditionFormFields, setField: SetField) {
  const input = JAM_PERIOD_EARNED_INPUT
  const domId = `mc-eng-${input.field}`
  return (
    <div key="jam_period_earned" className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={domId} className={KO_TEXT}>
        {input.label}
      </FieldLabel>
      <SuffixInput
        id={domId}
        type="number"
        inputMode="numeric"
        min={input.min}
        max={input.max}
        step={input.step}
        value={fields.jamPeriodEarned}
        onChange={(e) => setField('jamPeriodEarned', e.target.value)}
        placeholder={input.placeholder}
        suffix={input.unit}
        autoComplete="off"
      />
      <FieldMessage className={KO_HELP}>{input.help}</FieldMessage>
    </div>
  )
}

function ConditionJsonPreview({
  open,
  onOpenChange,
  conditionPreview,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conditionPreview: MissionCondition | null
}) {
  return (
    <details open={open} onToggle={(e) => onOpenChange((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[13px] font-medium text-foreground/80">
        저장될 condition_json 보기
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-muted px-3.5 py-3 font-mono text-xs text-foreground/80">
        {conditionPreview ? JSON.stringify(conditionPreview, null, 2) : 'null (조건 없음)'}
      </pre>
    </details>
  )
}
