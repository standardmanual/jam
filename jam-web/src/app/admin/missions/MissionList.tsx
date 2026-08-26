'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MissionRow } from '@/types/database'
import { MISSION_TYPES, MISSION_TYPE_LABEL } from '@/lib/admin/badge-labels'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/admin/ui/select'
import BadgeSearchSelect, { type BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
import BadgeMultiSearchSelect from '@/components/admin/BadgeMultiSearchSelect'
import { MissionTable } from './MissionTable'

interface Props {
  missions: MissionRow[]
  completionCounts: Map<string, number>
  /** 이미 미션에 연결된(reward_badge_ids/gated_badge_id) 배지의 이름 등 표시용 라벨 —
   *  전체 배지 프리로드가 아니라 실제로 참조되는 id만 bounded 조회한 결과 (20260826_011 A2).
   *  신규로 검색해 추가하는 배지는 BadgeMultiSearchSelect/BadgeSearchSelect의 검색 결과
   *  객체를 그대로 캐시에 얹는다. */
  badgeLabels: BadgeSearchResult[]
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

const emptyForm = {
  title: '',
  description: '',
  mission_type: 'distance' as string,
  condition_json: '{"distance_km": 50}',
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
}

export default function MissionList({ missions, completionCounts, badgeLabels }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [conditionError, setConditionError] = useState('')
  // 배지 id → 검색 결과 객체 캐시. badgeLabels(초기 참조 배지)로 시작해 새로 검색·선택한
  // 배지가 추가되면서 자라난다. reward_badge_ids/gated_badge_id 자체(제출 대상)와는 분리해
  // 표시용 라벨을 못 찾아도 이미 선택된 id가 저장 시 유실되지 않는다.
  const [badgeLabelCache, setBadgeLabelCache] = useState(
    () => new Map(badgeLabels.map((b) => [b.id, b]))
  )
  const router = useRouter()

  const rewardBadgeChips = form.reward_badge_ids
    .map((id) => badgeLabelCache.get(id))
    .filter((b): b is BadgeSearchResult => !!b)
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

  // datetime-local input은 `YYYY-MM-DDTHH:mm` 형식을 요구 — ISO 문자열에서 초/타임존 부분 제거
  function toDatetimeLocalValue(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const startEdit = useCallback((m: MissionRow) => {
    setForm({
      title: m.title,
      description: m.description ?? '',
      mission_type: m.mission_type,
      condition_json: JSON.stringify(m.condition_json),
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
    })
    setEditingId(m.id)
    setConditionError('')
    setShowForm(true)
  }, [])

  function cancelForm() {
    setForm(emptyForm)
    setEditingId(null)
    setConditionError('')
    setShowForm(false)
  }

  async function handleSave() {
    try {
      JSON.parse(form.condition_json)
    } catch {
      setConditionError('조건 JSON 형식이 올바르지 않아요.')
      return
    }
    setConditionError('')
    setSaving(true)

    const body = {
      title: form.title,
      description: form.description || null,
      mission_type: form.mission_type,
      condition_json: JSON.parse(form.condition_json),
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
    }

    await fetch(editingId ? `/api/admin/missions/${editingId}` : '/api/admin/missions', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    cancelForm()
    router.refresh()
  }

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('미션을 삭제하시겠습니까?')) return
    await fetch(`/api/admin/missions/${id}`, { method: 'DELETE' })
    router.refresh()
  }, [router])

  return (
    <div className="space-y-6">
      <button
        onClick={() => (showForm ? cancelForm() : setShowForm(true))}
        className="bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm"
      >
        {showForm ? '취소' : '+ 미션 생성'}
      </button>

      {showForm && (
        <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-bold">{editingId ? '미션 수정' : '새 미션'}</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">미션 이름</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" placeholder="이번 주 100km 라이딩 챌린지" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">설명 (선택)</label>
              <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" />
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
                  {statusDisplayTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs mt-1">
                {form.mission_type === 'checkin' || form.mission_type === 'item_collect' ? '추천: 달성형' : '추천: 랭킹형'}
              </p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">공개 인원 (빈칸=전체)</label>
              <input type="number" value={form.visible_rank_count} onChange={(e) => setForm((f) => ({ ...f, visible_rank_count: e.target.value }))}
                className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm" placeholder="상위 N명 (본인은 항상 표시)" />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-muted-foreground mb-1 block">조건 JSON</label>
              <textarea value={form.condition_json} onChange={(e) => setForm((f) => ({ ...f, condition_json: e.target.value }))}
                rows={2} className="w-full bg-white border border-border rounded-xl px-3 py-2 text-sm font-mono" />
              {conditionError && <p className="text-red-600 text-xs mt-1">{conditionError}</p>}
              <p className="text-muted-foreground text-xs mt-1">예: {`{"distance_km": 50, "activity_type": "cycling"}`}</p>
            </div>

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
                  placeholder="배지 이름 검색..."
                />
              </div>

              {/* 총 지급 포인트 미리보기 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-600 text-xs leading-relaxed">
                총 지급 포인트 미리보기: <b>{totalPoints.toLocaleString('ko-KR')}P</b>
                {' '}(미션 {missionPoints.toLocaleString('ko-KR')}P + 배지 자체 포인트 {badgePointsSum.toLocaleString('ko-KR')}P)
                {badgePointsSum > 0 && ' — 선택한 배지의 자동 포인트가 합산 지급됩니다.'}
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
                key={editingId ?? 'new'}
                value={form.gated_badge_id}
                initialLabel={formatBadgeLabel(badgeLabelCache.get(form.gated_badge_id))}
                placeholder="본 배지 이름 검색..."
                onChange={setGatedBadge}
              />
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

          <button onClick={handleSave} disabled={saving}
            className="bg-primary text-white font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors text-sm">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {/* 미션 목록 */}
      <MissionTable missions={missions} completionCounts={completionCounts} onEdit={startEdit} onDelete={handleDelete} />
    </div>
  )
}
