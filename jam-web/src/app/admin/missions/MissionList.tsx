'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MissionRow } from '@/types/database'

interface BadgeOption {
  id: string
  name: string
  point_reward: number
}

interface Props {
  missions: MissionRow[]
  completionCounts: Map<string, number>
  badges: BadgeOption[]
}

const missionTypes = ['distance', 'poi_visit', 'activity_count', 'item_collect'] as const
const statusDisplayTypes = [
  { value: 'ranking', label: '랭킹형 (등수/진행값)' },
  { value: 'achievement', label: '달성형 (완료 여부)' },
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
  starts_at: '',
  ends_at: '',
  max_completions: '',
}

export default function MissionList({ missions, completionCounts, badges }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [conditionError, setConditionError] = useState('')
  const [badgeQuery, setBadgeQuery] = useState('')
  const router = useRouter()

  // 보상 배지 다중 선택 관련 계산
  const selectedBadges = badges.filter((b) => form.reward_badge_ids.includes(b.id))
  const badgePointsSum = selectedBadges.reduce((sum, b) => sum + (b.point_reward ?? 0), 0)
  const missionPoints = Number(form.reward_points) || 0
  const totalPoints = badgePointsSum + missionPoints
  const filteredBadges = badgeQuery.trim()
    ? badges.filter((b) => b.name.toLowerCase().includes(badgeQuery.trim().toLowerCase()))
    : badges

  function toggleBadge(id: string) {
    setForm((f) => ({
      ...f,
      reward_badge_ids: f.reward_badge_ids.includes(id)
        ? f.reward_badge_ids.filter((x) => x !== id)
        : [...f.reward_badge_ids, id],
    }))
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
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      max_completions: form.max_completions ? Number(form.max_completions) : null,
    }

    await fetch('/api/admin/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    setForm(emptyForm)
    setBadgeQuery('')
    setShowForm(false)
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
        onClick={() => setShowForm((v) => !v)}
        className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm"
      >
        {showForm ? '취소' : '+ 미션 생성'}
      </button>

      {showForm && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <h2 className="font-bold">새 미션</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">미션 이름</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" placeholder="이번 주 100km 라이딩 챌린지" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">설명 (선택)</label>
              <input type="text" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">미션 타입</label>
              <select value={form.mission_type} onChange={(e) => setForm((f) => ({ ...f, mission_type: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm">
                {missionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">미션 상황 표시 방식</label>
              <select value={form.status_display_type} onChange={(e) => setForm((f) => ({ ...f, status_display_type: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm">
                {statusDisplayTypes.map((t) => <option key={t.value} value={t.value} className="bg-[#1a1a1a]">{t.label}</option>)}
              </select>
              <p className="text-white/30 text-xs mt-1">
                {form.mission_type === 'poi_visit' || form.mission_type === 'item_collect' ? '추천: 달성형' : '추천: 랭킹형'}
              </p>
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">공개 인원 (빈칸=전체)</label>
              <input type="number" value={form.visible_rank_count} onChange={(e) => setForm((f) => ({ ...f, visible_rank_count: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" placeholder="상위 N명 (본인은 항상 표시)" />
            </div>

            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">조건 JSON</label>
              <textarea value={form.condition_json} onChange={(e) => setForm((f) => ({ ...f, condition_json: e.target.value }))}
                rows={2} className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm font-mono" />
              {conditionError && <p className="text-red-400 text-xs mt-1">{conditionError}</p>}
              <p className="text-white/30 text-xs mt-1">예: {`{"distance_km": 50, "activity_type": "cycling"}`}</p>
            </div>

            {/* 보상 구성 — 배지 복수 선택 + 포인트 */}
            <div className="col-span-2 border border-white/10 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-white/60">보상 구성</p>

              <div>
                <label className="text-xs text-white/40 mb-1 block">미션 포인트 (선택, 0=없음)</label>
                <input type="number" value={form.reward_points} onChange={(e) => setForm((f) => ({ ...f, reward_points: Number(e.target.value) }))}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" />
              </div>

              <div>
                <label className="text-xs text-white/40 mb-1 block">보상 배지 (복수 선택 가능)</label>
                {selectedBadges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedBadges.map((b) => (
                      <button key={b.id} onClick={() => toggleBadge(b.id)}
                        className="text-xs bg-[#AEEA00]/20 text-[#AEEA00] border border-[#AEEA00]/40 rounded-lg px-2 py-1 hover:bg-[#AEEA00]/30">
                        {b.name}{b.point_reward > 0 ? ` (+${b.point_reward}P)` : ''} ✕
                      </button>
                    ))}
                  </div>
                )}
                <input type="text" value={badgeQuery} onChange={(e) => setBadgeQuery(e.target.value)}
                  placeholder="배지 이름 검색..." className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm mb-2" />
                <div className="max-h-44 overflow-y-auto border border-white/10 rounded-xl divide-y divide-white/5">
                  {filteredBadges.length === 0 && <p className="text-white/30 text-xs px-3 py-2">검색 결과 없음</p>}
                  {filteredBadges.map((b) => {
                    const checked = form.reward_badge_ids.includes(b.id)
                    return (
                      <button key={b.id} onClick={() => toggleBadge(b.id)}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-white/5 ${checked ? 'text-[#AEEA00]' : 'text-white/70'}`}>
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-[#AEEA00] border-[#AEEA00] text-black' : 'border-white/30'}`}>
                          {checked ? '✓' : ''}
                        </span>
                        {b.name}{b.point_reward > 0 ? ` (+${b.point_reward}P)` : ''}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 총 지급 포인트 미리보기 */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-amber-300 text-xs leading-relaxed">
                총 지급 포인트 미리보기: <b>{totalPoints.toLocaleString('ko-KR')}P</b>
                {' '}(미션 {missionPoints.toLocaleString('ko-KR')}P + 배지 자체 포인트 {badgePointsSum.toLocaleString('ko-KR')}P)
                {badgePointsSum > 0 && ' — 선택한 배지의 자동 포인트가 합산 지급됩니다.'}
              </div>
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">시작 일시</label>
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-white/40 mb-1 block">종료 일시</label>
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" />
            </div>

            <div>
              <label className="text-xs text-white/40 mb-1 block">선착순 인원 (빈칸=무제한)</label>
              <input type="number" value={form.max_completions} onChange={(e) => setForm((f) => ({ ...f, max_completions: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" placeholder="무제한" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="bg-[#AEEA00] text-black font-bold px-4 py-2 rounded-xl hover:bg-[#c6ff00] transition-colors text-sm">
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}

      {/* 미션 목록 */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40 text-left">
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
              <tr><td colSpan={6} className="px-5 py-10 text-center text-white/30">미션 없음</td></tr>
            )}
            {missions.map((m) => {
              const isActive = new Date(m.starts_at) <= now && new Date(m.ends_at) >= now
              const isEnded = new Date(m.ends_at) < now
              const count = completionCounts.get(m.id) ?? 0
              return (
                <tr key={m.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-5 py-3 font-medium">{m.title}</td>
                  <td className="px-5 py-3 text-white/60">{m.mission_type}</td>
                  <td className="px-5 py-3 text-white/50 text-xs">
                    {new Date(m.starts_at).toLocaleDateString('ko-KR')} ~<br />
                    {new Date(m.ends_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-5 py-3 text-white/70">
                    {count}{m.max_completions ? `/${m.max_completions}` : ''}명
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-[#AEEA00]/20 text-[#AEEA00]' : isEnded ? 'bg-white/10 text-white/30' : 'bg-amber-500/20 text-amber-400'}`}>
                      {isActive ? '진행 중' : isEnded ? '종료' : '예정'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button onClick={() => handleDelete(m.id)} className="text-red-400 hover:text-red-300 text-xs">삭제</button>
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
