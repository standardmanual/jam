'use client'

import { useState } from 'react'
import UserGrantForm from './UserGrantForm'

interface SearchUser {
  id: string
  username: string | null
  email: string
  balance: number
}

/** 대시보드 전용: 유저를 검색해 선택하면 공용 지급/회수 폼(UserGrantForm)을 띄운다. */
export default function AdminUserSearch() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchUser | null>(null)

  const search = async () => {
    if (q.trim().length === 0) return
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/points?q=${encodeURIComponent(q.trim())}`)
      const data = await res.json()
      setResults(data.users ?? [])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search() }}
          placeholder="유저 검색 (닉네임 또는 이메일)"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/20 focus:outline-none focus:border-[#AEEA00]/50 text-sm"
        />
        <button
          onClick={search}
          disabled={searching}
          className="bg-white/10 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-white/20 disabled:opacity-50 transition-colors text-sm"
        >
          {searching ? '검색 중…' : '검색'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl divide-y divide-white/5">
          {results.map((u) => (
            <button
              key={u.id}
              onClick={() => { setSelected(u); setResults([]); setQ('') }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.username ?? '(닉네임 없음)'}</p>
                <p className="text-xs text-white/40 truncate">{u.email}</p>
              </div>
              <span className="text-sm font-bold text-[#AEEA00] shrink-0 ml-3">{u.balance.toLocaleString('ko-KR')}P</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/60">
              선택됨: <span className="font-bold text-white">{selected.username ?? selected.email}</span>
            </p>
            <button onClick={() => setSelected(null)} className="text-xs text-white/40 hover:text-white transition-colors">
              선택 해제
            </button>
          </div>
          <UserGrantForm key={selected.id} userId={selected.id} username={selected.username} />
        </div>
      )}
    </div>
  )
}
