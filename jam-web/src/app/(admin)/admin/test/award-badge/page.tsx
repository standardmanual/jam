'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface User {
  id: string
  email: string
}

interface Badge {
  id: string
  name: string
}

export default function AwardBadgePage() {
  const [users, setUsers] = useState<User[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [userId, setUserId] = useState('')
  const [badgeId, setBadgeId] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'warn' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => {
        if (data.users) {
          setUsers(data.users)
          if (data.users.length > 0) setUserId(data.users[0].id)
        }
      })

    fetch('/api/admin/badges?type=activity')
      .then((r) => r.json())
      .then((data) => {
        if (data.badges) {
          setBadges(data.badges)
          if (data.badges.length > 0) setBadgeId(data.badges[0].id)
        }
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch('/api/admin/test/award-badge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, badgeId }),
      })
      const data = await res.json()

      if (res.status === 409) {
        setMessage({ type: 'warn', text: '이미 보유 중인 배지입니다.' })
      } else if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? '발급 실패' })
      } else {
        setMessage({ type: 'success', text: '배지가 성공적으로 발급되었습니다.' })
      }
    } catch {
      setMessage({ type: 'error', text: '네트워크 오류가 발생했습니다.' })
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
      <h2 className="text-2xl font-bold mb-2">배지 수동 발급</h2>
      <p className="text-white/50 text-sm mb-6">특정 유저에게 activity 배지를 즉시 발급합니다.</p>

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
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">배지</label>
          <select
            value={badgeId}
            onChange={(e) => setBadgeId(e.target.value)}
            className="w-full bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
            required
          >
            {badges.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={loading || !userId || !badgeId}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
        >
          {loading ? '발급 중...' : '발급'}
        </button>
      </form>

      {message && (
        <div
          className={`mt-4 rounded-lg p-4 text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-400'
              : message.type === 'warn'
              ? 'bg-yellow-500/10 border border-yellow-500/30 text-yellow-400'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  )
}
