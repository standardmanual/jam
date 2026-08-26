'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MissionRow } from '@/types/database'
import { MISSION_TYPES, MISSION_TYPE_LABEL, missionTypeLabel } from '@/lib/admin/badge-labels'
import ImageUploadField from '@/components/admin/ImageUploadField'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface BadgeOption {
  id: string
  name: string
  point_reward: number
  rarity: string
}

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', rare: 'Rare', legend: 'Legend', mythic: 'Mythic',
}

interface Props {
  missions: MissionRow[]
  completionCounts: Map<string, number>
  badges: BadgeOption[]
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

export default function MissionList({ missions, completionCounts, badges }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [conditionError, setConditionError] = useState('')
  const [badgeQuery, setBadgeQuery] = useState('')
  const [gatedBadgeQuery, setGatedBadgeQuery] = useState('')
  const router = useRouter()

  // 보상 배지 다중 선택 관련 계산
  const selectedBadges = badges.filter((b) => form.reward_badge_ids.includes(b.id))
  const badgePointsSum = selectedBadges.reduce((sum, b) => sum + (b.point_reward ?? 0), 0)
  const missionPoints = Number(form.reward_points) || 0
  const totalPoints = badgePointsSum + missionPoints
  const filteredBadges = badgeQuery.trim()
    ? badges.filter((b) => b.name.toLowerCase().includes(badgeQuery.trim().toLowerCase()))
    : badges
  // 티켓 20260825_029: page.tsx의 절단(028)이 풀리며 badges가 최대 2172개까지 들어온다.
  // 검색어가 없을 때 전량을 DOM에 그대로 렌더하면 렌더량이 과도해지므로 상한을 둔다.
  const BADGE_LIST_RENDER_LIMIT = 50
  const visibleBadges = filteredBadges.slice(0, BADGE_LIST_RENDER_LIMIT)

  // 게이트 배지(이 미션을 완료해야 열리는 본 배지) 선택용 — 단일 선택
  const gatedBadge = badges.find((b) => b.id === form.gated_badge_id) ?? null
  const filteredGatedBadges = gatedBadgeQuery.trim()
    ? badges.filter((b) => b.name.toLowerCase().includes(gatedBadgeQuery.trim().toLowerCase()))
    : []

  function toggleBadge(id: string) {
    setForm((f) => ({
      ...f,
      reward_badge_ids: f.reward_badge_ids.includes(id)
        ? f.reward_badge_ids.filter((x) => x !== id)
        : [...f.reward_badge_ids, id],
    }))
  }

  // datetime-local input은 `YYYY-MM-DDTHH:mm` 형식을 요구 — ISO 문자열에서 초/타임존 부분 제거
  function toDatetimeLocalValue(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  function startEdit(m: MissionRow) {
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
    setBadgeQuery('')
    setGatedBadgeQuery('')
    setShowForm(true)
  }

  function cancelForm() {
    setForm(emptyForm)
    setEditingId(null)
    setBadgeQuery('')
    setGatedBadgeQuery('')
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

  async function handleDelete(id: string) {
    if (!confirm('미션을 삭제하시겠습니까?')) return
    await fetch(`/api/admin/missions/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  const now = new Date()

  return (
    <div className="space-y-6">
      <button
        onClick={() => (showForm ? cancelForm() : setShowForm(true))}
        className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm"
      >
        {showForm ? '취소' : '+ 미션 생성'}
      </button>

      {showForm && (
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6 space-y-4">
          <h2 className="font-bold">{editingId ? '미션 수정' : '새 미션'}</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-[#6b7280] mb-1 block">미션 이름</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm" placeholder="이번 주 100km 라이딩 챌린지" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#6b7280] mb-1 block">설명 (선택)</label>
              <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-xs text-[#6b7280] mb-1 block">미션 타입</label>
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
              <label className="text-xs text-[#6b7280] mb-1 block">미션 상황 표시 방식</label>
              <Select value={form.status_display_type} onValueChange={(v) => setForm((f) => ({ ...f, status_display_type: v }))}>
                <SelectTrigger className="w-full" aria-label="미션 상황 표시 방식">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusDisplayTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[#898989] text-xs mt-1">
                {form.mission_type === 'checkin' || form.mission_type === 'item_collect' ? '추천: 달성형' : '추천: 랭킹형'}
              </p>
            </div>

            <div>
              <label className="text-xs text-[#6b7280] mb-1 block">공개 인원 (빈칸=전체)</label>
              <input type="number" value={form.visible_rank_count} onChange={(e) => setForm((f) => ({ ...f, visible_rank_count: e.target.value }))}
                className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm" placeholder="상위 N명 (본인은 항상 표시)" />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-[#6b7280] mb-1 block">조건 JSON</label>
              <textarea value={form.condition_json} onChange={(e) => setForm((f) => ({ ...f, condition_json: e.target.value }))}
                rows={2} className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm font-mono" />
              {conditionError && <p className="text-red-600 text-xs mt-1">{conditionError}</p>}
              <p className="text-[#898989] text-xs mt-1">예: {`{"distance_km": 50, "activity_type": "cycling"}`}</p>
            </div>

            {/* 보상 구성 — 배지 복수 선택 + 포인트 */}
            <div className="col-span-2 border border-[#e5e7eb] rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-[#374151]">보상 구성</p>

              <div>
                <label className="text-xs text-[#6b7280] mb-1 block">미션 포인트 (선택, 0=없음)</label>
                <input type="number" value={form.reward_points} onChange={(e) => setForm((f) => ({ ...f, reward_points: Number(e.target.value) }))}
                  className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs text-[#6b7280] mb-1 block">보상 배지 (복수 선택 가능)</label>
                {selectedBadges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedBadges.map((b) => (
                      <button key={b.id} onClick={() => toggleBadge(b.id)}
                        className="text-xs bg-[#111111]/20 text-[#111111] border border-[#111111]/40 rounded-lg px-2 py-1 hover:bg-[#111111]/30">
                        {b.name}{b.point_reward > 0 ? ` (+${b.point_reward}P)` : ''} ✕
                      </button>
                    ))}
                  </div>
                )}
                <input type="text" value={badgeQuery} onChange={(e) => setBadgeQuery(e.target.value)}
                  placeholder="배지 이름 검색..." className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm mb-2" />
                <div className="max-h-44 overflow-y-auto border border-[#e5e7eb] rounded-xl divide-y divide-[#f3f4f6]">
                  {filteredBadges.length === 0 && <p className="text-[#898989] text-xs px-3 py-2">검색 결과 없음</p>}
                  {visibleBadges.map((b) => {
                    const checked = form.reward_badge_ids.includes(b.id)
                    return (
                      <button key={b.id} onClick={() => toggleBadge(b.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-[#f8f9fa] ${checked ? 'text-[#111111]' : 'text-[#374151]'}`}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-[#111111] border-[#111111] text-white' : 'border-[#e5e7eb]'}`}>
                          {checked ? '✓' : ''}
                        </span>
                        {b.name}{b.point_reward > 0 ? ` (+${b.point_reward}P)` : ''}
                      </button>
                    )
                  })}
                  {filteredBadges.length > BADGE_LIST_RENDER_LIMIT && (
                    <p className="text-[#898989] text-xs px-3 py-2">
                      {filteredBadges.length}개 중 {BADGE_LIST_RENDER_LIMIT}개 표시 — 검색으로 좁혀보세요
                    </p>
                  )}
                </div>
              </div>

              {/* 총 지급 포인트 미리보기 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-amber-600 text-xs leading-relaxed">
                총 지급 포인트 미리보기: <b>{totalPoints.toLocaleString('ko-KR')}P</b>
                {' '}(미션 {missionPoints.toLocaleString('ko-KR')}P + 배지 자체 포인트 {badgePointsSum.toLocaleString('ko-KR')}P)
                {badgePointsSum > 0 && ' — 선택한 배지의 자동 포인트가 합산 지급됩니다.'}
              </div>
            </div>

            {/* 게이트 배지 — 이 미션을 완료해야 열리는 본 배지 (티켓 20260825_028) */}
            <div className="col-span-2 border border-[#e5e7eb] rounded-2xl p-4 space-y-2">
              <p className="text-xs font-bold text-[#374151]">게이트 배지 (선택)</p>
              <p className="text-[#898989] text-xs">
                이 미션을 완료해야 획득 조건이 열리는 <b>본 배지</b>를 지정합니다. 지정하면 미션 목록에서
                &quot;본 배지 등급 = 유저 보유 등급 + 1&quot;인 단계만 참가 가능하고, 그 다음 1단계는 잠금 카드로,
                그 위 단계는 숨김 처리됩니다. 비워두면 게이팅 없는 일반 미션입니다.
              </p>
              {gatedBadge ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#111111]">
                    {gatedBadge.name} <span className="text-[#6b7280] text-xs">({RARITY_LABEL[gatedBadge.rarity] ?? gatedBadge.rarity})</span>
                  </span>
                  <button
                    onClick={() => { setForm((f) => ({ ...f, gated_badge_id: '' })); setGatedBadgeQuery('') }}
                    className="text-xs bg-[#111111]/20 text-[#111111] border border-[#111111]/40 rounded-lg px-2 py-1 hover:bg-[#111111]/30"
                  >
                    해제 ✕
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={gatedBadgeQuery}
                    onChange={(e) => setGatedBadgeQuery(e.target.value)}
                    placeholder="본 배지 이름 검색..."
                    className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm"
                  />
                  {gatedBadgeQuery.trim() && (
                    <div className="max-h-44 overflow-y-auto border border-[#e5e7eb] rounded-xl divide-y divide-[#f3f4f6]">
                      {filteredGatedBadges.length === 0 && <p className="text-[#898989] text-xs px-3 py-2">검색 결과 없음</p>}
                      {filteredGatedBadges.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => { setForm((f) => ({ ...f, gated_badge_id: b.id })); setGatedBadgeQuery('') }}
                          className="w-full text-left px-3 py-2 text-sm text-[#374151] hover:bg-[#f8f9fa] flex items-center gap-2"
                        >
                          {b.name}
                          <span className="text-[#6b7280] text-xs ml-auto">{RARITY_LABEL[b.rarity] ?? b.rarity}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label className="text-xs text-[#6b7280] mb-1 block">시작 일시</label>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-[#6b7280] mb-1 block">종료 일시</label>
              <input type="datetime-local" value={form.ends_at} disabled={form.is_permanent}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm disabled:bg-[#f3f4f6] disabled:text-[#898989]" />
              <label className="flex items-center gap-1.5 mt-1.5 text-xs text-[#6b7280]">
                <input type="checkbox" checked={form.is_permanent}
                  onChange={(e) => setForm((f) => ({ ...f, is_permanent: e.target.checked }))} />
                상시 미션 (종료일 없음)
              </label>
            </div>

            <div>
              <label className="text-xs text-[#6b7280] mb-1 block">선착순 인원 (빈칸=무제한)</label>
              <input type="number" value={form.max_completions} onChange={(e) => setForm((f) => ({ ...f, max_completions: e.target.value }))}
                className="w-full bg-white border border-[#e5e7eb] rounded-xl px-3 py-2 text-sm" placeholder="무제한" />
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
            className="bg-[#111111] text-white font-bold px-4 py-2 rounded-xl hover:bg-[#242424] transition-colors text-sm">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {/* 미션 목록 */}
      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] text-[#6b7280] text-left">
              <th className="px-5 py-3 font-medium">미션</th>
              <th className="px-5 py-3 font-medium">타입</th>
              <th className="px-5 py-3 font-medium">기간</th>
              <th className="px-5 py-3 font-medium">달성</th>
              <th className="px-5 py-3 font-medium">상태</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {missions.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-[#898989]">미션 없음</td></tr>
            )}
            {missions.map((m) => {
              // ends_at이 null이면 상시 미션 — 시작만 지났으면 항상 진행 중, 종료 없음
              const isEnded = m.ends_at !== null && new Date(m.ends_at) < now
              const isActive = new Date(m.starts_at) <= now && !isEnded
              const count = completionCounts.get(m.id) ?? 0
              return (
                <tr key={m.id} className="border-b border-[#f3f4f6] hover:bg-[#f8f9fa]">
                  <td className="px-5 py-3 font-medium">{m.title}</td>
                  <td className="px-5 py-3 text-[#374151]">{missionTypeLabel(m.mission_type)}</td>
                  <td className="px-5 py-3 text-[#6b7280] text-xs">
                    {new Date(m.starts_at).toLocaleDateString('ko-KR')} ~<br />
                    {m.ends_at ? new Date(m.ends_at).toLocaleDateString('ko-KR') : '상시'}
                  </td>
                  <td className="px-5 py-3 text-[#374151]">
                    {count}{m.max_completions ? `/${m.max_completions}` : ''}명
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-[#111111]/20 text-[#111111]' : isEnded ? 'bg-[#f3f4f6] text-[#898989]' : 'bg-amber-50 text-amber-600'}`}>
                      {isActive ? '진행 중' : isEnded ? '종료' : '예정'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(m)} className="text-[#111111] hover:opacity-70 text-xs">수정</button>
                      <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:text-red-700 text-xs">삭제</button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
