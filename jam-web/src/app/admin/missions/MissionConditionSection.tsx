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
import { useState } from 'react'
import type { MissionCondition, MissionType } from '@/types/database'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Input } from '@/components/admin/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import BadgeSearchSelect from '@/components/admin/BadgeSearchSelect'
import PoiSearchSelect from '@/components/admin/PoiSearchSelect'
import { getConditionField, ACTIVITY_TYPE_FORM_OPTIONS, type ConditionFormEntry } from '@/lib/badge-engine/conditionRegistry'
import { FieldLabel, FieldMessage, SuffixInput } from '@/app/admin/badges/BadgeFormControls'
import {
  MISSION_ENGINE_DELEGATED_KEYS,
  missionTypeUsesActivityTypeFilter,
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
            <FieldLabel htmlFor="mc-elevation">목표 단일 활동 고도</FieldLabel>
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
            <FieldLabel htmlFor="mc-poi">목표 지점</FieldLabel>
            <PoiSearchSelect
              value={fields.poiId}
              initialLabel={poiIdInitialLabel}
              placeholder="지점 이름 검색..."
              onChange={(id) => setField('poiId', id)}
            />
            <FieldMessage>이 지점에 체크인(매칭 배지 발급)하면 달성돼요.</FieldMessage>
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

        <div className="sm:col-span-2">
          <ConditionJsonPreview open={jsonOpen} onOpenChange={setJsonOpen} conditionPreview={conditionPreview} />
        </div>
      </div>
    )
  }

  // ── 복합 조건(engine_condition) — 다중 조건 빌더 ─────────────────────────
  const delegatedEntries = MISSION_ENGINE_DELEGATED_KEYS
    .map((key) => {
      const meta = getConditionField(key)
      const control = meta?.form?.controls?.[0]
      return meta && control ? ({ meta, control, section: meta.form!.section } as ConditionFormEntry) : null
    })
    .filter((e): e is ConditionFormEntry => e !== null)

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
          {delegatedEntries.map((entry) => renderDelegatedField(entry, fields, setField))}
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

/** 배지엔진 위임 필드 하나 — 컨트롤 종류(number/text/time/checkbox/select)에 맞게 그린다 */
function renderDelegatedField(
  entry: ConditionFormEntry,
  fields: MissionConditionFormFields,
  setField: (field: keyof MissionConditionFormFields, value: string | boolean) => void
) {
  const { control, meta } = entry
  const field = control.field as keyof MissionConditionFormFields
  const domId = `mc-eng-${control.field}`
  const label = control.label ?? meta.label

  if (control.kind === 'checkbox') {
    return (
      <div key={control.field} className="flex items-start gap-2.5 sm:col-span-2">
        <Checkbox
          id={domId}
          checked={fields[field] === true}
          onCheckedChange={(v) => setField(field, v === true)}
          className="mt-0.5"
        />
        <label htmlFor={domId} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
      </div>
    )
  }

  if (control.kind === 'select') {
    const current = (fields[field] as string) || NONE_VALUE
    return (
      <div key={control.field} className="flex min-w-0 flex-col gap-1.5">
        <FieldLabel htmlFor={domId}>{label}</FieldLabel>
        <Select value={current} onValueChange={(v) => setField(field, v === NONE_VALUE ? '' : v)}>
          <SelectTrigger id={domId} aria-label={label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>{control.noneLabel ?? '— 없음 —'}</SelectItem>
            {(control.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {control.help && <FieldMessage>{control.help}</FieldMessage>}
      </div>
    )
  }

  const suffix = control.kind === 'time' ? null : (control.suffix ?? meta.unit)
  return (
    <div key={control.field} className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={domId}>{label}</FieldLabel>
      <SuffixInput
        id={domId}
        type={control.kind === 'number' ? 'number' : control.kind === 'time' ? 'time' : 'text'}
        inputMode={control.kind === 'number' ? 'decimal' : undefined}
        value={fields[field] as string}
        onChange={(e) => setField(field, e.target.value)}
        placeholder={control.placeholder}
        suffix={suffix}
        autoComplete="off"
      />
      {control.help && <FieldMessage>{control.help}</FieldMessage>}
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
