'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PointHistoryItem } from '@/app/api/points/route'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatAmount(n: number): string {
  const sign = n > 0 ? '+' : '−'
  return `${sign}${Math.abs(n).toLocaleString('ko-KR')}P`
}

export default function PointsPage() {
  const router = useRouter()
  const [balance, setBalance] = useState<number | null>(null)
  const [items, setItems] = useState<PointHistoryItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async (nextCursor: string | null, append: boolean) => {
    if (append) setLoadingMore(true)
    else { setLoading(true); setError(false) }
    try {
      const url = nextCursor ? `/api/points?cursor=${encodeURIComponent(nextCursor)}` : '/api/points'
      const res = await fetch(url)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setBalance(data.balance)
      setItems((prev) => (append ? [...prev, ...data.items] : data.items))
      setCursor(data.nextCursor)
    } catch {
      if (!append) setError(true)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // 최초 로드 — 이펙트 본문에서 동기 setState를 피하기 위해 await 이후에만 상태를 갱신
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/points')
        if (!res.ok) throw new Error('failed')
        const data = await res.json()
        if (!active) return
        setBalance(data.balance)
        setItems(data.items)
        setCursor(data.nextCursor)
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  return (
    <div className="min-h-full bg-jam-pink text-jam-ink px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10 flex flex-col gap-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="뒤로"
          className="w-9 h-9 rounded-xl border-[2px] border-jam-ink bg-white flex items-center justify-center active:scale-95 transition-transform"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-4 h-4 text-jam-ink">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-black">잼 포인트</h1>
      </div>

      {/* 잔액 카드 */}
      <div className="bg-jam-lime border-[3px] border-jam-ink rounded-3xl shadow-[4px_4px_0_0_#161616] px-6 py-7 text-center">
        <p className="text-[11px] font-black text-jam-ink/50 uppercase tracking-widest mb-2">현재 잔액</p>
        <p className="text-4xl font-black text-jam-ink">
          {balance === null ? '—' : `${balance.toLocaleString('ko-KR')}P`}
        </p>
      </div>

      {/* 내역 */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-black text-jam-ink/40 uppercase tracking-wider px-1">최근 내역</h2>

        {loading && (
          <div className="py-10 text-center text-jam-ink/40 text-sm font-bold">불러오는 중…</div>
        )}

        {!loading && error && (
          <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] py-8 px-5 text-center">
            <p className="text-jam-ink/70 text-sm font-bold mb-3">내역을 불러오지 못했어요.</p>
            <button
              onClick={() => load(null, false)}
              className="px-4 py-2 rounded-xl bg-jam-ink text-white text-sm font-black active:scale-95 transition-transform"
            >
              다시 시도
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="bg-white border-[3px] border-dashed border-jam-ink/40 rounded-2xl py-8 px-5 text-center">
            <p className="text-jam-ink/70 text-sm font-bold">아직 쌓인 포인트가 없어요.</p>
            <p className="text-jam-ink/40 text-xs mt-1 font-semibold">활동을 동기화하면 배지와 함께 포인트를 받을 수 있어요.</p>
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div className="bg-white border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] divide-y-[2px] divide-jam-ink/10 overflow-hidden">
            {items.map((it) => {
              const positive = it.amount > 0
              const inner = (
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-jam-ink truncate">{it.title}</p>
                    {it.note && <p className="text-xs text-jam-ink/50 font-semibold truncate">{it.note}</p>}
                    <p className="text-[11px] text-jam-ink/40 font-semibold mt-0.5">{formatDate(it.created_at)}</p>
                  </div>
                  <span className={`text-sm font-black shrink-0 ${positive ? 'text-jam-ink' : 'text-[#FF4500]'}`}>
                    {formatAmount(it.amount)}
                  </span>
                  {it.href && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-4 h-4 text-jam-ink/30 shrink-0">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              )
              return it.href ? (
                <Link key={it.id} href={it.href} className="block active:bg-jam-ink/5 transition-colors">{inner}</Link>
              ) : (
                <div key={it.id}>{inner}</div>
              )
            })}
          </div>
        )}

        {!loading && !error && cursor && (
          <button
            onClick={() => load(cursor, true)}
            disabled={loadingMore}
            className="mx-auto mt-1 px-5 py-2 rounded-xl border-[2px] border-jam-ink bg-white text-sm font-black active:scale-95 transition-transform disabled:opacity-50"
          >
            {loadingMore ? '불러오는 중…' : '더 보기'}
          </button>
        )}
      </div>
    </div>
  )
}
