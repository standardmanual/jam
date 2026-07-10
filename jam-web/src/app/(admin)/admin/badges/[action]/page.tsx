'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const BADGE_TYPES = ['activity', 'item', 'poi'] as const
const BADGE_RARITIES = ['common', 'rare', 'legendary', 'mythic'] as const

const CONDITION_HINT = `{
  "distance_km": 10,
  "activity_type": "cycling",
  "total_count": 5,
  "streak_days": 3,
  "elevation_gain_m": 500,
  "min_speed_kmh": 20,
  "poi_id": "uuid-here"
}`

export default function BadgeActionPage() {
  const params = useParams()
  const router = useRouter()
  const action = params.action as string
  const isNew = action === 'new'

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'activity' as typeof BADGE_TYPES[number],
    rarity: 'common' as typeof BADGE_RARITIES[number],
    image_url: '',
    condition_json: '',
  })
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/admin/badges/${action}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.badge) {
            const b = data.badge
            setForm({
              name: b.name ?? '',
              description: b.description ?? '',
              type: b.type ?? 'activity',
              rarity: b.rarity ?? 'common',
              image_url: b.image_url ?? '',
              condition_json: b.condition_json ? JSON.stringify(b.condition_json, null, 2) : '',
            })
          } else {
            setError(data.error ?? '배지를 찾을 수 없습니다.')
          }
          setLoading(false)
        })
        .catch(() => {
          setError('불러오기 실패')
          setLoading(false)
        })
    }
  }, [action, isNew])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    let condition_json: object | null = null
    if (form.condition_json.trim()) {
      try {
        condition_json = JSON.parse(form.condition_json)
      } catch {
        setError('condition_json이 올바른 JSON 형식이 아닙니다.')
        setSaving(false)
        return
      }
    }

    const body = {
      name: form.name,
      description: form.description,
      type: form.type,
      rarity: form.rarity,
      image_url: form.image_url || null,
      condition_json,
    }

    const url = isNew ? '/api/admin/badges' : `/api/admin/badges/${action}`
    const method = isNew ? 'POST' : 'PATCH'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()

    if (data.success) {
      router.push('/admin/badges')
    } else {
      setError(data.error ?? '저장 실패')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-white/50 p-6">불러오는 중...</div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/badges" className="text-white/40 hover:text-white/70 text-sm">
          ← 배지 목록
        </Link>
        <h2 className="text-2xl font-bold">{isNew ? '새 배지 추가' : '배지 수정'}</h2>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4 text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">이름 *</label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
            placeholder="배지 이름"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">설명 *</label>
          <textarea
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 resize-none"
            placeholder="배지 설명"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">타입 *</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              {BADGE_TYPES.map((t) => (
                <option key={t} value={t} className="bg-gray-900">{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Rarity *</label>
            <select
              value={form.rarity}
              onChange={(e) => setForm({ ...form, rarity: e.target.value as typeof form.rarity })}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              {BADGE_RARITIES.map((r) => (
                <option key={r} value={r} className="bg-gray-900">{r}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">이미지 URL (선택)</label>
          <input
            value={form.image_url}
            onChange={(e) => setForm({ ...form, image_url: e.target.value })}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-white/70 mb-1">
            condition_json (선택 — JSON 직접 입력)
          </label>
          <textarea
            value={form.condition_json}
            onChange={(e) => setForm({ ...form, condition_json: e.target.value })}
            rows={6}
            className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 font-mono text-xs resize-none"
            placeholder={CONDITION_HINT}
          />
          <p className="text-white/30 text-xs mt-1">
            사용 가능한 키: distance_km, activity_type, total_count, streak_days, elevation_gain_m, min_speed_kmh, poi_id
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
          <Link
            href="/admin/badges"
            className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  )
}
