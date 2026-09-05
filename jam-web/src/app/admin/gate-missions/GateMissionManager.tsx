'use client'

/**
 * 게이트 미션 — 축 × 단계 매트릭스 + 구조화 입력 폼 (티켓 20260905_0033)
 *
 * ## 왜 «구조화 입력»인가
 * 기존 미션 폼은 `condition_json`을 **생짜 JSON 텍스트에어리어**로 받고 `JSON.parse` 성공
 * 여부만 봤다. 게이트 미션은 여기에 축·단계·노출 조건까지 손으로 적어야 하는데, 노출
 * 조건은 형태가 한 글자만 어긋나도 `visibility.ts`가 fail-closed로 잠근다 —
 * 「저장은 되는데 아무에게도 안 보이는 미션」이 된다. 그래서 네 가지(여는 축 / 게이트 단계 /
 * 보상 배지 / 노출 조건)를 전부 선택 UI로 받는다.
 *
 * 저장 검증은 `findGateMissionSaveError`(순수 함수)를 **API와 함께 쓴다** — 폼에만 두면
 * API 직접 호출로 새어 들어오고, API에만 두면 저장 버튼을 눌러야 오류를 알 수 있다.
 */
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BadgeRarity, MissionGateStage, MissionRow, MissionVisibilityRule } from '@/types/database'
import { MISSION_GATE_STAGES } from '@/types/database'
import {
  GATE_STAGE_LABEL,
  buildGateMatrix,
  describeVisibilityRule,
  findGateMissionSaveError,
  gateAxisLabel,
  isGateMission,
  parseVisibilityRule,
} from '@/lib/missions/gateMissions'
import { buildFamilyKey } from '@/lib/admin/badge-families'
import { MISSION_CONDITION_VALUE_RULE } from '@/lib/missions/condition-keys'
import { MISSION_TYPE_LABEL } from '@/lib/admin/badge-labels'
import { RARITY_LABEL } from '@/lib/rarity'
import { TREE_ACTIVITY_ORDER } from '@/lib/badgeTree'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import { Input } from '@/components/admin/ui/input'
import { Textarea } from '@/components/admin/ui/textarea'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Button } from '@/components/admin/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import BadgeMultiSearchSelect from '@/components/admin/BadgeMultiSearchSelect'
import type { BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
import ImageUploadField from '@/components/admin/ImageUploadField'

/** 노출 조건에서 고를 수 있는 계열 — **계열 키가 발급된 계열만** 들어온다 */
export interface GateFamilyOption {
  familyKey: string
  name: string
  activityType: string | null
  kind: 'graded' | 'leveled' | 'mixed'
  topLabel: string
}

interface Props {
  /** 게이트 미션 + 폐기 대상(레거시 게이트 미션) */
  missions: MissionRow[]
  families: GateFamilyOption[]
  rewardBadgeLabels: BadgeSearchResult[]
  activityTypeLabels: Record<string, string>
}

/**
 * 게이트 미션이 쓸 수 있는 미션 타입 — **수치형만.**
 * `checkin`(지점)·`item_collect`(배지 수집)는 대상 선택 UI가 따로 필요하고, 축은 종목 안에서만
 * 공유되므로 게이트 미션에는 쓰이지 않는다. 그 두 타입이 필요하면 미션 관리 화면에서 만든다.
 */
const GATE_MISSION_TYPES = ['distance', 'activity_count', 'streak_days', 'duration_minutes', 'elevation_gain_m'] as const
type GateMissionType = (typeof GATE_MISSION_TYPES)[number]

const STATUS_DISPLAY_TYPES = [
  { value: 'individual', label: '개인형 (본인 진행상황만)' },
  { value: 'achievement', label: '달성형 (완료 여부)' },
  { value: 'ranking', label: '랭킹형 (등수/진행값)' },
] as const

const RARITY_OPTIONS: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/** 폼이 다루는 계열 요구 한 덩어리 */
interface RequirementForm {
  familyKeys: string[]
  minRarity: '' | BadgeRarity
  minCount: string
}

const emptyRequirement: RequirementForm = { familyKeys: [], minRarity: '', minCount: '1' }

const emptyForm = {
  title: '',
  description: '',
  axisExisting: '__new__',
  axisActivityType: 'walking',
  axisName: '',
  gate_stage: 'epic_to_mystic' as MissionGateStage,
  mission_type: 'activity_count' as GateMissionType,
  target: '10',
  conditionActivityType: 'walking',
  reward_badge_ids: [] as string[],
  status_display_type: 'individual' as string,
  require: { ...emptyRequirement },
  hide: { ...emptyRequirement },
  unmet_visibility: 'locked' as 'locked' | 'hidden',
  starts_at: '',
  is_permanent: true,
  ends_at: '',
  image_url: '',
}

type FormState = typeof emptyForm

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 폼 상태 → 저장할 축 키 (`{종목}:{축이름}`) */
function axisKeyOf(form: FormState): string {
  if (form.axisExisting !== '__new__') return form.axisExisting
  const name = form.axisName.trim()
  if (!name) return ''
  return buildFamilyKey(form.axisActivityType, name)
}

/** 폼 상태 → 저장할 노출 규칙. 아무 요구도 없으면 null(노출 제한 없음) */
function visibilityRuleOf(form: FormState): MissionVisibilityRule | null {
  const build = (req: RequirementForm) => {
    if (req.familyKeys.length === 0) return undefined
    const value: { family_keys: string[]; min_rarity?: BadgeRarity; min_count?: number } = {
      family_keys: [...req.familyKeys],
    }
    if (req.minRarity) value.min_rarity = req.minRarity
    const count = Number(req.minCount)
    if (Number.isInteger(count) && count > 1) value.min_count = count
    return value
  }
  const require_owned = build(form.require)
  const hide_when_owned = build(form.hide)
  if (!require_owned && !hide_when_owned) return null

  const rule: MissionVisibilityRule = {}
  if (require_owned) rule.require_owned = require_owned
  if (hide_when_owned) rule.hide_when_owned = hide_when_owned
  if (require_owned && form.unmet_visibility === 'hidden') rule.unmet_visibility = 'hidden'
  return rule
}

/** 저장된 미션 → 폼 상태 (수정 진입) */
function formFromMission(m: MissionRow): FormState {
  const parsed = parseVisibilityRule(m.visibility_rule_json)
  const rule = m.visibility_rule_json ?? {}
  const toRequirement = (key: 'require_owned' | 'hide_when_owned'): RequirementForm => {
    const raw = rule[key]
    if (!raw || !Array.isArray(raw.family_keys)) return { ...emptyRequirement }
    return {
      familyKeys: raw.family_keys.filter((k): k is string => typeof k === 'string'),
      minRarity: (raw.min_rarity ?? '') as '' | BadgeRarity,
      minCount: String(raw.min_count ?? 1),
    }
  }
  const missionType = (GATE_MISSION_TYPES as readonly string[]).includes(m.mission_type)
    ? (m.mission_type as GateMissionType)
    : 'activity_count'
  const valueKey = MISSION_CONDITION_VALUE_RULE[missionType].key
  const condition = (m.condition_json ?? {}) as Record<string, unknown>

  return {
    title: m.title,
    description: m.description ?? '',
    axisExisting: m.gate_axis ?? '__new__',
    axisActivityType: 'walking',
    axisName: '',
    gate_stage: m.gate_stage ?? 'epic_to_mystic',
    mission_type: missionType,
    target: String(condition[valueKey] ?? ''),
    conditionActivityType: typeof condition.activity_type === 'string' ? condition.activity_type : 'walking',
    reward_badge_ids: m.reward_badge_ids ?? [],
    status_display_type: m.status_display_type,
    require: toRequirement('require_owned'),
    hide: toRequirement('hide_when_owned'),
    unmet_visibility: (parsed.ok && parsed.value?.unmetVisibility) || 'locked',
    starts_at: toDatetimeLocalValue(m.starts_at),
    is_permanent: m.ends_at === null,
    ends_at: m.ends_at ? toDatetimeLocalValue(m.ends_at) : '',
    image_url: m.image_url ?? '',
  }
}

// ── 계열 선택기 ──────────────────────────────────────────────────────────────

function FamilyPicker({
  families,
  selected,
  onToggle,
  activityTypeLabels,
}: {
  families: GateFamilyOption[]
  selected: string[]
  onToggle: (familyKey: string) => void
  activityTypeLabels: Record<string, string>
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return families
    return families.filter(
      (f) => f.name.toLowerCase().includes(q) || f.familyKey.toLowerCase().includes(q)
    )
  }, [families, query])

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="계열 이름 또는 계열 키로 검색..."
        aria-label="계열 검색"
      />
      <div className="max-h-52 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            조건에 맞는 계열이 없어요. 계열 키가 발급된 계열만 고를 수 있어요.
          </p>
        )}
        {filtered.map((family) => (
          <label key={family.familyKey} className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40">
            <Checkbox
              checked={selected.includes(family.familyKey)}
              onCheckedChange={() => onToggle(family.familyKey)}
              aria-label={`${family.name} 계열 선택`}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-sm">
                {family.name}
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {family.activityType ? activityTypeLabels[family.activityType] ?? family.activityType : '종목 없음'} ·{' '}
                  {family.kind === 'leveled' ? '레벨형' : family.kind === 'graded' ? '등급형' : '혼재'} · 최고{' '}
                  {family.topLabel}
                </span>
              </span>
              <span className="block font-mono text-[11px] text-muted-foreground truncate">{family.familyKey}</span>
            </span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          선택 {selected.length}개 — <span className="font-mono">{selected.join(', ')}</span>
        </p>
      )}
    </div>
  )
}

function RequirementFields({
  label,
  hint,
  value,
  onChange,
  families,
  activityTypeLabels,
}: {
  label: string
  hint: string
  value: RequirementForm
  onChange: (next: RequirementForm) => void
  families: GateFamilyOption[]
  activityTypeLabels: Record<string, string>
}) {
  // 레벨형 계열에 등급 조건을 걸면 «영원히 미충족»이다 — 저장 전에 화면에서 먼저 알린다
  // (같은 판정을 정합성 검사가 목록에서도 한다).
  const leveledSelected = value.familyKeys.filter(
    (key) => families.find((f) => f.familyKey === key)?.kind === 'leveled'
  )
  const rarityOnLeveled = !!value.minRarity && leveledSelected.length > 0

  return (
    <div className="border border-border rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-xs font-bold text-foreground">{label}</p>
        <p className="text-muted-foreground text-xs mt-0.5">{hint}</p>
      </div>

      <FamilyPicker
        families={families}
        selected={value.familyKeys}
        activityTypeLabels={activityTypeLabels}
        onToggle={(familyKey) =>
          onChange({
            ...value,
            familyKeys: value.familyKeys.includes(familyKey)
              ? value.familyKeys.filter((k) => k !== familyKey)
              : [...value.familyKeys, familyKey],
          })
        }
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">최소 등급</label>
          <Select
            value={value.minRarity || '__any__'}
            onValueChange={(v) => onChange({ ...value, minRarity: v === '__any__' ? '' : (v as BadgeRarity) })}
          >
            <SelectTrigger className="w-full" aria-label={`${label} 최소 등급`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">등급 무관 (하나라도 보유)</SelectItem>
              {RARITY_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {RARITY_LABEL[r]} 이상
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">필요 계열 수 (1 = 하나만 만족해도 됨)</label>
          <Input
            type="number"
            min={1}
            value={value.minCount}
            onChange={(e) => onChange({ ...value, minCount: e.target.value })}
            aria-label={`${label} 필요 계열 수`}
          />
        </div>
      </div>

      {rarityOnLeveled && (
        <p className="text-amber-600 text-xs">
          레벨형 계열({leveledSelected.join(', ')})에 등급 조건을 걸었어요. 레벨형은 등급이 없어서 이 조건은
          영원히 충족되지 않아요 — 「등급 무관」으로 바꿔주세요.
        </p>
      )}
    </div>
  )
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export default function GateMissionManager({ missions, families, rewardBadgeLabels, activityTypeLabels }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [badgeLabelCache, setBadgeLabelCache] = useState(() => new Map(rewardBadgeLabels.map((b) => [b.id, b])))

  const gateMissions = useMemo(() => missions.filter(isGateMission), [missions])
  const legacyMissions = useMemo(() => missions.filter((m) => !isGateMission(m)), [missions])
  const matrix = useMemo(() => buildGateMatrix(gateMissions), [gateMissions])
  const existingAxes = useMemo(() => matrix.map((r) => r.axis), [matrix])
  const missionById = useMemo(() => new Map(missions.map((m) => [m.id, m])), [missions])

  const axisKey = axisKeyOf(form)
  const rule = visibilityRuleOf(form)
  const parsedRule = parseVisibilityRule(rule)
  const saveError = findGateMissionSaveError({
    gate_axis: axisKey || null,
    gate_stage: axisKey ? form.gate_stage : null,
    visibility_rule_json: rule,
    gated_badge_id: null,
  })

  const rewardChips = form.reward_badge_ids
    .map((id) => badgeLabelCache.get(id))
    .filter((b): b is BadgeSearchResult => !!b)

  function startCreate() {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(true)
  }

  function startEdit(mission: MissionRow) {
    setForm(formFromMission(mission))
    setEditingId(mission.id)
    setError('')
    setShowForm(true)
  }

  function cancelForm() {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowForm(false)
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setError('미션 이름을 입력해주세요.')
      return
    }
    if (!axisKey) {
      setError('여는 축을 고르거나 새로 입력해주세요.')
      return
    }
    if (saveError) {
      setError(saveError)
      return
    }
    const target = Number(form.target)
    if (!Number.isFinite(target) || target <= 0) {
      setError('목표값은 0보다 큰 숫자여야 해요.')
      return
    }
    if (!form.starts_at) {
      setError('시작 일시를 입력해주세요.')
      return
    }
    if (!form.is_permanent && !form.ends_at) {
      setError('종료 일시를 입력하거나 상시 미션으로 설정해주세요.')
      return
    }

    const valueKey = MISSION_CONDITION_VALUE_RULE[form.mission_type].key
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      mission_type: form.mission_type,
      condition_json: { [valueKey]: target, activity_type: form.conditionActivityType },
      reward_badge_ids: form.reward_badge_ids,
      // v5는 포인트 지급이 전면 없다(마스터 티켓 20260905_0026 §포인트)
      reward_points: null,
      status_display_type: form.status_display_type,
      visible_rank_count: null,
      // 게이트 미션은 예전 방식의 게이트 배지를 쓰지 않는다(마이그레이션 135 CHECK)
      gated_badge_id: null,
      gate_axis: axisKey,
      gate_stage: form.gate_stage,
      visibility_rule_json: rule,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.is_permanent ? null : new Date(form.ends_at).toISOString(),
      max_completions: null,
      image_url: form.image_url || null,
    }

    setSaving(true)
    const res = await fetch(editingId ? `/api/admin/missions/${editingId}` : '/api/admin/missions', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)

    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      setError(typeof payload?.error === 'string' ? payload.error : '미션을 저장하지 못했어요. 잠시 후 다시 시도해주세요.')
      return
    }
    cancelForm()
    router.refresh()
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 미션을 삭제할까요? 참가·완료 기록도 함께 사라져요.`)) return
    const res = await fetch(`/api/admin/missions/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      setError(typeof payload?.error === 'string' ? payload.error : '미션을 삭제하지 못했어요.')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Button onClick={() => (showForm ? cancelForm() : startCreate())}>
        {showForm ? '취소' : '+ 게이트 미션 만들기'}
      </Button>

      {showForm && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-bold">{editingId ? '게이트 미션 수정' : '새 게이트 미션'}</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">미션 이름</label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="밤의 보행자 — 축을 여는 미션"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">설명 (선택)</label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>

            {/* 여는 축 */}
            <div className="col-span-2 border border-border rounded-2xl p-4 space-y-3">
              <div>
                <p className="text-xs font-bold text-foreground">여는 축</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  축은 같은 종목 안에서만 공유돼요. 축 키는 계열 키와 같은 「종목:이름」 형태예요.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">축 선택</label>
                  <Select
                    value={form.axisExisting}
                    onValueChange={(v) => setForm((f) => ({ ...f, axisExisting: v }))}
                  >
                    <SelectTrigger className="w-full" aria-label="여는 축">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">새 축 만들기</SelectItem>
                      {existingAxes.map((axis) => (
                        <SelectItem key={axis} value={axis}>
                          {axis}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">게이트 단계</label>
                  <Select
                    value={form.gate_stage}
                    onValueChange={(v) => setForm((f) => ({ ...f, gate_stage: v as MissionGateStage }))}
                  >
                    <SelectTrigger className="w-full" aria-label="게이트 단계">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MISSION_GATE_STAGES.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {GATE_STAGE_LABEL[stage]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.axisExisting === '__new__' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">종목</label>
                    <Select
                      value={form.axisActivityType}
                      onValueChange={(v) => setForm((f) => ({ ...f, axisActivityType: v, conditionActivityType: v }))}
                    >
                      <SelectTrigger className="w-full" aria-label="축 종목">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TREE_ACTIVITY_ORDER.map((t) => (
                          <SelectItem key={t} value={t}>
                            {activityTypeLabels[t] ?? t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">축 이름</label>
                    <Input
                      value={form.axisName}
                      onChange={(e) => setForm((f) => ({ ...f, axisName: e.target.value }))}
                      placeholder="거리"
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                저장될 축 키: <span className="font-mono">{axisKey || '—'}</span>
              </p>
            </div>

            {/* 달성 조건 */}
            <div className="col-span-2 border border-border rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-foreground">달성 조건</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">미션 타입</label>
                  <Select
                    value={form.mission_type}
                    onValueChange={(v) => setForm((f) => ({ ...f, mission_type: v as GateMissionType }))}
                  >
                    <SelectTrigger className="w-full" aria-label="미션 타입">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GATE_MISSION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {MISSION_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">활동 종목</label>
                  <Select
                    value={form.conditionActivityType}
                    onValueChange={(v) => setForm((f) => ({ ...f, conditionActivityType: v }))}
                  >
                    <SelectTrigger className="w-full" aria-label="활동 종목">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TREE_ACTIVITY_ORDER.map((t) => (
                        <SelectItem key={t} value={t}>
                          {activityTypeLabels[t] ?? t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">목표값</label>
                  <Input
                    type="number"
                    min={1}
                    value={form.target}
                    onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                    aria-label="목표값"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                저장될 조건: <span className="font-mono">{JSON.stringify({ [MISSION_CONDITION_VALUE_RULE[form.mission_type].key]: Number(form.target) || 0, activity_type: form.conditionActivityType })}</span>
              </p>
            </div>

            {/* 보상 배지 */}
            <div className="col-span-2 border border-border rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-foreground">보상 배지</p>
              <p className="text-muted-foreground text-xs">
                이 배지가 Mystic을 여는 열쇠예요. 배지 쪽 조건에 <span className="font-mono">mission_reward</span>가
                켜져 있고, Mystic 배지가 <span className="font-mono">gate_mission_badge</span>로 이 계열을 가리켜야
                게이트가 이어져요. v5는 포인트를 지급하지 않아요.
              </p>
              <BadgeMultiSearchSelect
                selected={rewardChips}
                placeholder="배지 이름 검색..."
                onSelect={(b) => {
                  setForm((f) =>
                    f.reward_badge_ids.includes(b.id) ? f : { ...f, reward_badge_ids: [...f.reward_badge_ids, b.id] }
                  )
                  setBadgeLabelCache((prev) => new Map(prev).set(b.id, b))
                }}
                onRemove={(id) =>
                  setForm((f) => ({ ...f, reward_badge_ids: f.reward_badge_ids.filter((x) => x !== id) }))
                }
              />
            </div>

            {/* 노출 조건 */}
            <div className="col-span-2 space-y-3">
              <RequirementFields
                label="노출 조건 — 이 계열을 보유해야 미션이 보여요"
                hint="예: 이 축의 Epic 계열을 보유해야 Epic → Mystic 미션이 열려요."
                value={form.require}
                onChange={(next) => setForm((f) => ({ ...f, require: next }))}
                families={families}
                activityTypeLabels={activityTypeLabels}
              />
              <RequirementFields
                label="숨김 조건 — 이 계열을 보유하면 미션을 숨겨요"
                hint="예: 이미 Mystic을 받았다면 이 미션의 역할은 끝났어요."
                value={form.hide}
                onChange={(next) => setForm((f) => ({ ...f, hide: next }))}
                families={families}
                activityTypeLabels={activityTypeLabels}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">노출 조건 미충족일 때</label>
                  <Select
                    value={form.unmet_visibility}
                    onValueChange={(v) => setForm((f) => ({ ...f, unmet_visibility: v as 'locked' | 'hidden' }))}
                  >
                    <SelectTrigger className="w-full" aria-label="노출 조건 미충족일 때">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="locked">잠금 카드로 보여주기</SelectItem>
                      <SelectItem value="hidden">목록에서 감추기</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">미션 상황 표시 방식</label>
                  <Select
                    value={form.status_display_type}
                    onValueChange={(v) => setForm((f) => ({ ...f, status_display_type: v }))}
                  >
                    <SelectTrigger className="w-full" aria-label="미션 상황 표시 방식">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_DISPLAY_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="rounded-xl bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                저장될 노출 조건: {describeVisibilityRule(parsedRule.ok ? parsedRule.value : null)}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">시작 일시</label>
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">종료 일시</label>
              <Input
                type="datetime-local"
                value={form.ends_at}
                disabled={form.is_permanent}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
              />
              <label className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={form.is_permanent}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, is_permanent: checked === true }))}
                  aria-label="상시 미션"
                />
                상시 미션 (종료일 없음) — 게이트 미션은 보통 상시예요
              </label>
            </div>

            <div className="col-span-2">
              <ImageUploadField
                label="썸네일 이미지 (선택)"
                value={form.image_url}
                onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
                folder="mission-images"
              />
            </div>
          </div>

          {(error || saveError) && <p className="text-red-600 text-xs">{error || saveError}</p>}

          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </div>
      )}

      {/* 매트릭스 — 축 × 단계 */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold">축 × 단계 매트릭스</h2>
        <div className="bg-white border border-border rounded-2xl overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>축</TableHead>
                {MISSION_GATE_STAGES.map((stage) => (
                  <TableHead key={stage}>{GATE_STAGE_LABEL[stage]}</TableHead>
                ))}
                <TableHead className="text-right">커버리지</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matrix.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    아직 게이트 미션이 없어요. 「+ 게이트 미션 만들기」로 첫 미션을 추가해보세요.
                  </TableCell>
                </TableRow>
              )}
              {matrix.map((row) => (
                <TableRow key={row.axis}>
                  <TableCell className="align-top whitespace-nowrap">
                    <span className="font-medium">{gateAxisLabel(row.axis)}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{row.axis}</span>
                  </TableCell>
                  {MISSION_GATE_STAGES.map((stage) => (
                    <TableCell key={stage} className="align-top">
                      {row.cells[stage].length === 0 ? (
                        <span className="rounded bg-red-100 px-1.5 py-px text-[11px] font-medium text-red-700">
                          비어 있음
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          {row.cells[stage].map((m) => {
                            const full = missionById.get(m.id)
                            return (
                              <li key={m.id} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm">{m.title}</span>
                                {full && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => startEdit(full)}
                                      className="text-xs text-primary underline underline-offset-2"
                                    >
                                      수정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(full.id, full.title)}
                                      className="text-xs text-red-600 underline underline-offset-2"
                                    >
                                      삭제
                                    </button>
                                  </>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </TableCell>
                  ))}
                  <TableCell className="text-right align-top whitespace-nowrap">
                    {row.complete ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-px text-[11px] font-medium text-emerald-700">
                        두 단계 채움
                      </span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
                        구멍 있음
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 노출 조건 요약 */}
      {gateMissions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold">노출 조건</h2>
          <div className="bg-white border border-border rounded-2xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>미션</TableHead>
                  <TableHead>축 / 단계</TableHead>
                  <TableHead>노출 조건</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gateMissions.map((m) => {
                  const parsed = parseVisibilityRule(m.visibility_rule_json)
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{m.title}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {m.gate_axis} · {m.gate_stage ? GATE_STAGE_LABEL[m.gate_stage] : '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {parsed.ok ? (
                          describeVisibilityRule(parsed.value)
                        ) : (
                          <span className="text-red-600">형태 오류 — {parsed.error} (아무에게도 열리지 않아요)</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* 폐기 대상 */}
      {legacyMissions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold">폐기 대상 — 예전 방식(게이트 배지)으로 게이팅하는 미션</h2>
          <p className="text-xs text-muted-foreground">
            v5 카탈로그 시딩(티켓 20260905_0035)과 <b>같은 시점에</b> 폐기해요. 먼저 지우면 그동안 게이트가 열린
            채로 남아요.
          </p>
          <div className="bg-white border border-border rounded-2xl overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>미션</TableHead>
                  <TableHead>게이트 배지 id</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legacyMissions.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.title}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">{m.gated_badge_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
