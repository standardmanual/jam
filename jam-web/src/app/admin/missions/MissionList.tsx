'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MissionRow } from '@/types/database'

interface Props {
  missions: MissionRow[]
  completionCounts: Map<string, number>
}

const missionTypes = ['distance', 'poi_visit', 'activity_count', 'item_collect'] as const
const rewardTypes = ['badge', 'points', 'item_badge'] as const

const emptyForm = {
  title: '',
  description: '',
  mission_type: 'distance' as string,
  condition_json: '{"distance_km": 50}',
  reward_type: 'points' as string,
  reward_id: '',
  reward_points: 100,
  starts_at: '',
  ends_at: '',
  max_completions: '',
}

export default function MissionList({ missions, completionCounts }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [conditionError, setConditionError] = useState('')
  const router = useRouter()

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
      reward_type: form.reward_type,
      reward_id: form.reward_id || null,
      reward_points: form.reward_type === 'points' ? Number(form.reward_points) : null,
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
              <label className="text-xs text-white/40 mb-1 block">보상 타입</label>
              <select value={form.reward_type} onChange={(e) => setForm((f) => ({ ...f, reward_type: e.target.value }))}
                className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm">
                {rewardTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="col-span-2">
              <label className="text-xs text-white/40 mb-1 block">조건 JSON</label>
              <textarea value={form.condition_json} onChange={(e) => setForm((f) => ({ ...f, condition_json: e.target.value }))}
                rows={2} className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm font-mono" />
              {conditionError && <p className="text-red-400 text-xs mt-1">{conditionError}</p>}
              <p className="text-white/30 text-xs mt-1">예: {`{"distance_km": 50, "activity_type": "cycling"}`}</p>
            </div>

            {form.reward_type === 'points' && (
              <div>
                <label className="text-xs text-white/40 mb-1 block">포인트 수</label>
                <input type="number" value={form.reward_points} onChange={(e) => setForm((f) => ({ ...f, reward_points: Number(e.target.value) }))}
                  className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm" />
              </div>
            )}

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
