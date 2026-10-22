'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { MissionRow, MissionType } from '@/types/database'
import { checkMissionCondition, usesNightCondition } from '@/lib/missions/condition-keys'
import { MISSION_SCOPE_LABEL, type MissionScope } from '@/lib/admin/mission-tribes'
import { MISSION_TYPES, MISSION_TYPE_LABEL } from '@/lib/admin/badge-labels'
import { contentImageSourceLabel } from '@/lib/admin/contentImageSource'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import BadgeSearchSelect, { type BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
import BadgeMultiSearchSelect from '@/components/admin/BadgeMultiSearchSelect'
import { Checkbox } from '@/components/admin/ui/checkbox'
// 판정 시뮬레이션 패널 — 배지 폼과 공용 컴포넌트(티켓 20260908_1554, 20260908_1632).
// mission_type='engine_condition'일 때만 붙인다 — 나머지 5종은 checker.ts의 boolean-only
// 판정 경로라 사유·실제값 대 필요값 표시가 불가능하다.
import ConditionSimulationPanel from '@/components/admin/ConditionSimulationPanel'
// 달성 조건 필드 빌더 — 원시 JSON textarea 대체 (티켓 20260911_2118)
import MissionConditionSection from './MissionConditionSection'
import {
  buildMissionConditionJson,
  missionConditionFieldsFrom,
  unsupportedMissionConditionKeys,
  type MissionConditionFormFields,
} from './missionConditionFields'
import {
  NIGHT_SAFETY_NOTICE,
  buildMissionTribePayload,
  findMissionFormSaveError,
  lockedRewardBadgeNames,
  lockedRewardNotice,
  missionFormTribeLabel,
  missionScopeFrom,
  rankingBlockReason,
  rankingFrameNotice,
  sortMissionFormTribes,
  type MissionFormTribe,
} from './missionFormRules'

interface Props {
  /** 수정 대상 — 없으면 생성 모드 */
  mission?: MissionRow
  /** 이미 미션에 연결된(reward_badge_ids/gated_badge_id/condition_json.badge_id) 배지의 이름 등
   *  표시용 라벨 — 전체 배지 프리로드가 아니라 실제로 참조되는 id만 bounded 조회한 결과
   *  (20260826_011 A2). */
  badgeLabels: BadgeSearchResult[]
  /** 체크인 타입(condition_json.poi_id)의 표시용 지점 이름 — 없으면 미지정(생성 모드 등)
   *  (티켓 20260911_2118) */
  poiLabel?: string
  /** 참가할 수 있는 트라이브 체크 목록 — DB의 트라이브 전체(비활성 포함, 티켓 20261019_1318) */
  tribes: MissionFormTribe[]
  /** 수정 대상이 지금 참가를 허용하는 트라이브 id. 없거나 비어 있으면 공통 미션 */
  allowedTribeIds?: string[]
}

function formatBadgeLabel(b?: BadgeSearchResult): string {
  return b ? `${b.name} [${b.type}/${b.rarity}]` : ''
}

// 유효값·라벨은 lib/admin/badge-labels.ts 한 곳에서 관리한다(20260826_004) —
// 이 화면은 원래 한글 라벨 맵이 없어 목록·저작 폼에 원시값(`poi_visit`)이 그대로 노출됐다.
const statusDisplayTypes = [
  { value: 'ranking', label: '랭킹형 (등수/진행값)' },
  { value: 'achievement', label: '달성형 (완료 여부)' },
  { value: 'individual', label: '개인형 (본인 진행상황만)' },
] as const

// 미션 노출 옵션 (티켓 20260912_0139) — MissionTable.tsx 노출 컬럼에서도 재사용
export const exposureModes = [
  { value: 'hidden', label: '숨김' },
  { value: 'start_date', label: '시작일 노출' },
  { value: 'scheduled', label: '노출일 지정' },
] as const

const emptyForm = {
  title: '',
  description: '',
  conditionText: '',
  mission_type: 'distance' as string,
  reward_badge_ids: [] as string[],
  reward_points: 100,
  status_display_type: 'ranking' as string,
  visible_rank_count: '' as string, // 빈값 = 전체 공개
  gated_badge_id: '' as string, // 빈값 = 게이팅 없음 (일반 미션)
  starts_at: '',
  ends_at: '',
  is_permanent: false, // 상시 미션(종료일 없음)
  max_completions: '',
  image_url: '',
  exposure_mode: 'start_date' as string, // 티켓 20260912_0139: 미션 노출 옵션 (기본값: 시작일 노출)
  exposure_at: '',
  scope: 'common' as MissionScope, // 티켓 20261019_1318: 공통 미션 / 트라이브 미션
  allowed_tribe_ids: [] as string[], // scope='tribe'일 때 참가할 수 있는 트라이브
}

// 종류 선택지 — 라벨은 서버 모듈(`mission-tribes.ts`)과 같은 사전을 쓴다
const scopeOptions: { value: MissionScope; label: string }[] = [
  { value: 'common', label: `${MISSION_SCOPE_LABEL.common} (모든 유저)` },
  { value: 'tribe', label: `${MISSION_SCOPE_LABEL.tribe} (고른 트라이브만)` },
]

// datetime-local input은 `YYYY-MM-DDTHH:mm` 형식을 요구 — ISO 문자열에서 초/타임존 부분 제거
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formFromMission(m: MissionRow, allowedTribeIds: string[]): typeof emptyForm {
  return {
    title: m.title,
    description: m.description ?? '',
    conditionText: m.condition_text ?? '',
    mission_type: m.mission_type,
    reward_badge_ids: m.reward_badge_ids ?? [],
    reward_points: m.reward_points ?? 0,
    status_display_type: m.status_display_type,
    visible_rank_count: m.visible_rank_count != null ? String(m.visible_rank_count) : '',
    gated_badge_id: m.gated_badge_id ?? '',
    starts_at: toDatetimeLocalValue(m.starts_at),
    ends_at: m.ends_at ? toDatetimeLocalValue(m.ends_at) : '',
    is_permanent: m.ends_at === null,
    max_completions: m.max_completions != null ? String(m.max_completions) : '',
    image_url: m.image_url ?? '',
    exposure_mode: m.exposure_mode ?? 'start_date',
    exposure_at: m.exposure_at ? toDatetimeLocalValue(m.exposure_at) : '',
    scope: missionScopeFrom(allowedTribeIds),
    allowed_tribe_ids: allowedTribeIds,
  }
}

/**
 * 미션 생성/수정 폼(티켓 20260911_2035) — 목록 내부 토글이 아니라
 * `/admin/missions/new`, `/admin/missions/[id]` 별도 페이지로 이동해 연다. 폼 자체(입력
 * 필드·검증 로직)는 예전 목록 컴포넌트(현재는 삭제됨)에서 그대로 옮겨왔다.
 */
export default function MissionForm({ mission, badgeLabels, poiLabel, tribes, allowedTribeIds = [] }: Props) {
  const editingId = mission?.id ?? null
  const [form, setForm] = useState(mission ? formFromMission(mission, allowedTribeIds) : emptyForm)
  const [saving, setSaving] = useState(false)
  const [conditionError, setConditionError] = useState('')
  // 저장 버튼 옆에 보이는 오류 — 저장 전 검사와 서버의 충돌(409) 안내. 달성 조건 구역은 화면 중간이라 저장을 누른 자리에서 보이지 않는다.
  const [saveError, setSaveError] = useState('')
  const [badgeLabelCache, setBadgeLabelCache] = useState(
    () => new Map(badgeLabels.map((b) => [b.id, b]))
  )
  // 달성 조건 필드 빌더 state (티켓 20260911_2118) — 원본 condition_json은 engine_condition의
  // time_band_counts(이 폼이 다루지 않는 필드) 보존에 계속 쓴다.
  const initCondition = mission?.condition_json ?? null
  const [conditionFields, setConditionFields] = useState<MissionConditionFormFields>(() =>
    missionConditionFieldsFrom(initCondition)
  )
  const router = useRouter()

  const setConditionField = (field: keyof MissionConditionFormFields, value: string | boolean) => {
    setConditionFields((f) => ({ ...f, [field]: value }))
  }

  // 저장될 condition_json — 필드 빌더가 채운 값만으로 조립한다(폼은 값을 만들지 않는다).
  const missionConditionPreview = buildMissionConditionJson(
    form.mission_type as MissionType,
    conditionFields,
    initCondition
  )

  // 저장을 막지는 않지만 달성 판정에 아무 영향도 주지 않는 조건 필드 고지 (티켓 20260905_1141).
  // 서버 검증과 같은 순수 함수를 그대로 써서 판정 기준이 갈리지 않게 한다.
  const conditionWarning = missionConditionPreview
    ? checkMissionCondition(form.mission_type as MissionType, missionConditionPreview).warning
    : null

  // 순위형 제한 안내와 밤 조건 안전 안내 (티켓 20261019_1318) — 판정은 서버 저장 검사와 같은 함수다.
  const rankingBlocked = rankingBlockReason(missionConditionPreview) !== null
  const frameNotice = rankingFrameNotice(form.status_display_type, missionConditionPreview)
  const showNightNotice = usesNightCondition(missionConditionPreview)
  const sortedTribes = sortMissionFormTribes(tribes)

  function toggleTribe(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      allowed_tribe_ids: checked
        ? f.allowed_tribe_ids.includes(id)
          ? f.allowed_tribe_ids
          : [...f.allowed_tribe_ids, id]
        : f.allowed_tribe_ids.filter((x) => x !== id),
    }))
  }

  const rewardBadgeChips = form.reward_badge_ids
    .map((id) => badgeLabelCache.get(id))
    .filter((b): b is BadgeSearchResult => !!b)
  const lockedNotice = lockedRewardNotice(lockedRewardBadgeNames(rewardBadgeChips))
  const badgePointsSum = rewardBadgeChips.reduce((sum, b) => sum + (b.point_reward ?? 0), 0)
  const missionPoints = Number(form.reward_points) || 0
  const totalPoints = badgePointsSum + missionPoints

  function addRewardBadge(b: BadgeSearchResult) {
    setForm((f) => (f.reward_badge_ids.includes(b.id) ? f : { ...f, reward_badge_ids: [...f.reward_badge_ids, b.id] }))
    setBadgeLabelCache((prev) => new Map(prev).set(b.id, b))
  }

  function removeRewardBadge(id: string) {
    setForm((f) => ({ ...f, reward_badge_ids: f.reward_badge_ids.filter((x) => x !== id) }))
  }

  function setGatedBadge(id: string, badge?: BadgeSearchResult) {
    setForm((f) => ({ ...f, gated_badge_id: id }))
    if (badge) setBadgeLabelCache((prev) => new Map(prev).set(badge.id, badge))
  }

  async function handleSave() {
    setConditionError('')
    setSaveError('')

    // 종류·틀 저장 전 검사 — 서버가 같은 검사를 하지만, 서버 거절은 무엇을 고칠지 늦게 알려 준다(티켓 20261019_1318).
    const formError = findMissionFormSaveError({
      scope: form.scope,
      allowedTribeIds: form.allowed_tribe_ids,
      statusDisplayType: form.status_display_type,
      condition: missionConditionPreview,
    })
    if (formError) {
      setSaveError(formError)
      return
    }

    // '노출일 지정'은 노출 시각이 없으면 fail-closed로 항상 숨겨진다(lib/missions/visibility.ts)
    // — 저장 전에 막아 관리자가 의도치 않게 미션을 영구히 숨기지 않도록 한다.
    if (form.exposure_mode === 'scheduled' && !form.exposure_at) {
      setConditionError('노출일 지정을 선택하면 노출 일시를 입력해야 해요')
      return
    }

    setSaving(true)

    const body = {
      title: form.title,
      description: form.description || null,
      condition_text: form.conditionText.trim() || null,
      mission_type: form.mission_type,
      condition_json: missionConditionPreview,
      reward_badge_ids: form.reward_badge_ids,
      reward_points: missionPoints > 0 ? missionPoints : null,
      status_display_type: form.status_display_type,
      visible_rank_count: form.visible_rank_count ? Number(form.visible_rank_count) : null,
      gated_badge_id: form.gated_badge_id || null,
      starts_at: new Date(form.starts_at).toISOString(),
      // 상시 미션(종료일 없음) — ends_at null
      ends_at: form.is_permanent ? null : new Date(form.ends_at).toISOString(),
      max_completions: form.max_completions ? Number(form.max_completions) : null,
      image_url: form.image_url || null,
      exposure_mode: form.exposure_mode,
      exposure_at: form.exposure_mode === 'scheduled' ? new Date(form.exposure_at).toISOString() : null,
      ...buildMissionTribePayload(form.scope, form.allowed_tribe_ids),
    }

    const res = await fetch(editingId ? `/api/admin/missions/${editingId}` : '/api/admin/missions', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)

    // 응답을 확인하지 않으면 서버가 400(조건 JSON 키 오류 등)을 줘도 폼이 «저장됨»처럼 닫힌다
    // — 검증을 붙인 의미가 사라진다 (티켓 20260905_1141).
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      const message = typeof payload?.error === 'string' ? payload.error : null
      // 409는 «이미 참가한 유저가 있어서 트라이브를 줄일 수 없다» 같은 충돌 안내라 저장 버튼 옆에 보인다.
      if (res.status === 409 && message) {
        setSaveError(message)
        return
      }
      setConditionError(message ?? '미션을 저장하지 못했어요. 잠시 후 다시 시도해 주세요')
      return
    }

    router.push('/admin/missions')
    router.refresh()
  }

  return (
    <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold">{editingId ? '미션 수정' : '새 미션'}</h2>
        {/* 제작 경로 라벨(티켓 20260925_1407) — 수정 화면(mission 존재)에서만 보인다. 신규
            작성 화면은 아직 image_source가 없다(적용 탭에서 반영해야 생긴다). */}
        {mission && (
          <span className="inline-flex w-fit items-center whitespace-nowrap rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs font-semibold text-neutral-600">
            제작 경로 · {contentImageSourceLabel(mission.image_source)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">미션 이름</label>
          <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" placeholder="이번 주 100km 라이딩 챌린지" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">설명 (선택)</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={3}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm resize-none" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground mb-1 block">달성 조건 문장 (선택)</label>
          <textarea value={form.conditionText} onChange={(e) => setForm((f) => ({ ...f, conditionText: e.target.value }))}
            rows={2}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm resize-none" />
          <p className="text-xs text-muted-foreground mt-1">미션 상세의 달성 조건 카드 첫 줄에 보여요. 비우면 목표 유형에 맞는 기본 문구가 나와요.</p>
        </div>

        {/* 참가 대상 — 공통 미션 / 트라이브 미션 (티켓 20261019_1318, 운영 로직 13.2절) */}
        <div className="col-span-2 border border-border rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-foreground break-keep wrap-break-word">참가 대상</p>
          <Select
            value={form.scope}
            onValueChange={(v) => setForm((f) => ({ ...f, scope: v as MissionScope }))}
          >
            <SelectTrigger className="w-full" aria-label="미션 종류">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs break-keep wrap-break-word text-pretty">
            {form.scope === 'common'
              ? '모든 유저가 보고 참가해요.'
              : '고른 트라이브의 유저만 미션을 보고 참가해요. 트라이브를 정하지 않은 유저에게는 보이지 않아요.'}
          </p>
          {form.scope === 'tribe' && (
            <div role="group" aria-label="참가할 수 있는 트라이브" className="grid grid-cols-2 gap-x-4 gap-y-2">
              {sortedTribes.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={form.allowed_tribe_ids.includes(t.id)}
                    onCheckedChange={(v) => toggleTribe(t.id, v === true)}
                    aria-label={`${missionFormTribeLabel(t)} 참가 허용`}
                  />
                  <span className={`break-keep wrap-break-word ${t.isActive ? '' : 'text-muted-foreground'}`}>
                    {missionFormTribeLabel(t)}
                  </span>
                </label>
              ))}
              {sortedTribes.length === 0 && (
                <p className="col-span-2 text-xs text-muted-foreground break-keep wrap-break-word">
                  등록된 트라이브가 없어요. 트라이브를 먼저 만들어 주세요.
                </p>
              )}
            </div>
          )}
          {editingId && (
            <p className="text-muted-foreground text-xs break-keep wrap-break-word text-pretty">
              이미 참가하거나 완료한 유저가 있으면 참가할 수 있는 트라이브를 줄일 수 없어요. 더하는 변경만 저장돼요.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">미션 타입</label>
          <Select value={form.mission_type} onValueChange={(v) => setForm((f) => ({ ...f, mission_type: v }))}>
            <SelectTrigger className="w-full" aria-label="미션 타입">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MISSION_TYPES.map((t) => <SelectItem key={t} value={t}>{MISSION_TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">미션 상황 표시 방식</label>
          <Select value={form.status_display_type} onValueChange={(v) => setForm((f) => ({ ...f, status_display_type: v }))}>
            <SelectTrigger className="w-full" aria-label="미션 상황 표시 방식">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusDisplayTypes.map((t) => (
                // 밤 조건·캡슐 연 횟수가 있으면 랭킹형을 고를 수 없다(서버 저장 검사와 같은 판정, 티켓 20261019_1318)
                <SelectItem key={t.value} value={t.value} disabled={t.value === 'ranking' && rankingBlocked}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {frameNotice ? (
            <p
              className={`text-xs mt-1 break-keep wrap-break-word text-pretty ${form.status_display_type === 'ranking' ? 'text-red-600' : 'text-amber-600'}`}
            >
              {frameNotice}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs mt-1">
              {form.mission_type === 'checkin' || form.mission_type === 'item_collect' ? '추천: 달성형' : '추천: 랭킹형'}
            </p>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">공개 인원 (빈칸=전체)</label>
          <input type="number" value={form.visible_rank_count} onChange={(e) => setForm((f) => ({ ...f, visible_rank_count: e.target.value }))}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" placeholder="상위 N명 (본인은 항상 표시)" />
        </div>

        <div className="col-span-2 border border-border rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-foreground">달성 조건</p>
          <MissionConditionSection
            missionType={form.mission_type as MissionType}
            fields={conditionFields}
            setField={setConditionField}
            conditionPreview={missionConditionPreview}
            unsupportedKeys={unsupportedMissionConditionKeys(initCondition)}
            badgeIdInitialLabel={formatBadgeLabel(badgeLabelCache.get(conditionFields.badgeId))}
            poiIdInitialLabel={poiLabel}
          />
          {showNightNotice && (
            <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs break-keep wrap-break-word text-pretty">
              {NIGHT_SAFETY_NOTICE}
            </p>
          )}
          {conditionError && <p className="text-red-600 text-xs mt-1">{conditionError}</p>}
          {!conditionError && conditionWarning && <p className="text-amber-600 text-xs mt-1">{conditionWarning}</p>}
        </div>

        {/* 판정 시뮬레이션 — mission_type='engine_condition' 전용 (티켓 20260908_1632).
            나머지 5종은 checker.ts의 boolean-only 판정이라 사유 표시가 불가능해 제외한다. */}
        {form.mission_type === 'engine_condition' && (
          <div className="col-span-2">
            <ConditionSimulationPanel
              condition={missionConditionPreview}
              apiPath="/api/admin/missions/simulate-condition"
              passVerb="달성"
            />
          </div>
        )}

        {/* 보상 구성 — 배지 복수 선택 + 포인트 */}
        <div className="col-span-2 border border-border rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-foreground">보상 구성</p>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">미션 포인트 (선택, 0=없음)</label>
            <input type="number" value={form.reward_points} onChange={(e) => setForm((f) => ({ ...f, reward_points: Number(e.target.value) }))}
              className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">보상 배지 (복수 선택 가능)</label>
            <BadgeMultiSearchSelect
              selected={rewardBadgeChips}
              onSelect={addRewardBadge}
              onRemove={removeRewardBadge}
              excludeHidden
              markAlwaysLocked
              placeholder="배지 이름 검색..."
            />
            {/* 읽기 전용 — 잠금은 배지 양식에서 정하고, 이 미션에서만 일반 배지를 잠가서 주는 지정은 지원하지 않는다(5-3 결정 2) */}
            {lockedNotice && (
              <p className="text-amber-700 text-xs mt-1.5 break-keep wrap-break-word text-pretty">{lockedNotice}</p>
            )}
          </div>

          {/* 총 지급 포인트 미리보기 */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-600 text-xs leading-relaxed">
            총 지급 포인트 미리보기: <b>{totalPoints.toLocaleString('ko-KR')}P</b>
            {' '}(미션 {missionPoints.toLocaleString('ko-KR')}P + 배지 자체 포인트 {badgePointsSum.toLocaleString('ko-KR')}P)
            {badgePointsSum > 0 && ' — 선택한 배지의 기본 포인트가 함께 지급돼요'}
          </div>
        </div>

        {/* 게이트 배지 — 이 미션을 완료해야 열리는 본 배지 (티켓 20260825_028) */}
        <div className="col-span-2 border border-border rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-foreground">게이트 배지 (선택)</p>
          <p className="text-muted-foreground text-xs">
            이 미션을 완료해야 획득 조건이 열리는 <b>본 배지</b>를 지정합니다. 지정하면 미션 목록에서
            &quot;본 배지 등급 = 유저 보유 등급 + 1&quot;인 단계만 참가 가능하고, 그 다음 1단계는 잠김 카드로,
            그 위 단계는 숨김 처리됩니다. 비워두면 게이팅 없는 일반 미션입니다.
          </p>
          <BadgeSearchSelect
            value={form.gated_badge_id}
            initialLabel={formatBadgeLabel(badgeLabelCache.get(form.gated_badge_id))}
            placeholder="본 배지 이름 검색..."
            onChange={setGatedBadge}
            excludeHidden
          />
        </div>

        {/* 미션 노출 — 티켓 20260912_0139 */}
        <div className="col-span-2 border border-border rounded-2xl p-4 space-y-2">
          <p className="text-xs font-bold text-foreground">미션 노출</p>
          <Select value={form.exposure_mode} onValueChange={(v) => setForm((f) => ({ ...f, exposure_mode: v }))}>
            <SelectTrigger className="w-full" aria-label="미션 노출">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {exposureModes.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {form.exposure_mode === 'hidden' && '서비스 어디에도 노출되지 않아요.'}
            {form.exposure_mode === 'start_date' && '아래 시작 일시에 노출돼요.'}
            {form.exposure_mode === 'scheduled' && '지정한 일시에 노출돼요. 시작 일시와는 별개예요.'}
          </p>
          {form.exposure_mode === 'scheduled' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">노출 일시</label>
              <input type="datetime-local" value={form.exposure_at}
                onChange={(e) => setForm((f) => ({ ...f, exposure_at: e.target.value }))}
                className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">시작 일시</label>
          <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">종료 일시</label>
          <input type="datetime-local" value={form.ends_at} disabled={form.is_permanent}
            onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm disabled:bg-muted disabled:text-muted-foreground" />
          <label className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={form.is_permanent}
              onChange={(e) => setForm((f) => ({ ...f, is_permanent: e.target.checked }))} />
            상시 미션 (종료일 없음)
          </label>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">선착순 인원 (빈칸=무제한)</label>
          <input type="number" value={form.max_completions} onChange={(e) => setForm((f) => ({ ...f, max_completions: e.target.value }))}
            className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" placeholder="무제한" />
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

      {saveError && (
        <p role="alert" className="text-red-600 text-sm break-keep wrap-break-word text-pretty">
          {saveError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving}
          className="bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm">
          {saving ? '저장 중...' : '저장'}
        </button>
        <Link href="/admin/missions" className="text-muted-foreground hover:text-foreground text-sm transition-colors">
          취소
        </Link>
      </div>
    </div>
  )
}
