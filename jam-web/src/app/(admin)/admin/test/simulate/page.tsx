'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type ActivityType = 'cycling' | 'running' | 'hiking' | 'walking'

interface User {
  id: string
  email: string
}

interface SimulateResult {
  badges: Array<{ id: string; name: string }>
  item: string | null
}

export default function SimulatePage() {
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState('')
  const [activityType, setActivityType] = useState<ActivityType>('cycling')
  const [distanceKm, setDistanceKm] = useState(10)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => {
        if (data.users) {
          setUsers(data.users)
          if (data.users.length > 0) setUserId(data.users[0].id)
        }
      })
      .catch(() => setError('유저 목록을 불러오지 못했습니다.'))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch('/api/admin/test/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, activityType, distanceKm }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '알 수 없는 오류')
      } else {
        setResult(data)
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/test" className="text-white/40 text-sm hover:text-white/70">
          ← 테스트 도구
        </Link>
      </div>
      <h2 className="text-2xl font-bold mb-2">가상 활동 시뮬레이션</h2>
      <p className="text-white/50 text-sm mb-6">활동 종류와 거리를 설정해 배지 엔진과 드랍 엔진을 실행합니다.</p>

      <form onSubmit={handleSubmit} className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-1">유저</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
            required
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">활동 종류</label>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value as ActivityType)}
            className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="cycling">사이클링</option>
            <option value="running">러닝</option>
            <option value="hiking">하이킹</option>
            <option value="walking">워킹</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">거리 (km)</label>
          <input
            type="number"
            min={1}
            max={1000}
            value={distanceKm}
            onChange={(e) => setDistanceKm(Number(e.target.value))}
            className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || !userId}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          {loading ? '실행 중...' : '시뮬레이션 실행'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-3">
          <p className="text-green-400 font-semibold text-sm">시뮬레이션 완료</p>
          <div>
            <p className="text-white/60 text-xs mb-1">발급된 배지 ({result.badges.length}개)</p>
            {result.badges.length === 0 ? (
              <p className="text-white/40 text-sm">없음</p>
            ) : (
              <ul className="space-y-1">
                {result.badges.map((b) => (
                  <li key={b.id} className="text-white text-sm">• {b.name}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-white/60 text-xs mb-1">드랍된 아이템</p>
            <p className="text-white text-sm">{result.item ?? '없음'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
