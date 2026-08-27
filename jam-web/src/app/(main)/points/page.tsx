'use client'

import { useEffect, useState, useCallback } from 'react'
import type { PointHistoryItem } from '@/app/api/points/route'
import TopNav from '@/components/ui/TopNav'
import { Card } from '@ds/components/cards/Card'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import ListRowCard from '@/components/ui/ListRowCard'
import { CoinIcon } from '@/components/ui/icons'
import { useDigitPopIn } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function formatAmount(n: number): string {
  const sign = n > 0 ? '+' : '−'
  return t(d.points.amountValue, { amount: `${sign}${Math.abs(n).toLocaleString('ko-KR')}` })
}

export default function PointsPage() {
  const [balance, setBalance] = useState<number | null>(null)
  const [items, setItems] = useState<PointHistoryItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)

  // 잔액 — 갱신될 때마다 자릿수 단위로 팝인 (Number pop-in, 02)
  // 훅이 문자열을 한 글자씩 쪼개 마지막 두 글자에 스태거를 걸므로, 단위 '포인트'를 붙이면
  // 스태거가 마지막 자릿수가 아닌 한글에 걸린다. 애니메이션 대상은 숫자만 넘긴다.
  const balanceDigits = balance === null ? null : balance.toLocaleString('ko-KR')
  const balanceRef = useDigitPopIn<HTMLSpanElement>(balanceDigits)

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
    <div className="min-h-full bg-surface text-text">
      <TopNav title={d.common.back} />

      <div className="px-[var(--spacing-16)] pt-0 pb-[var(--spacing-40)] flex flex-col gap-[var(--spacing-24)]">
        {/* 잔액 카드 */}
        <Card tone="inverse" className="text-center py-[var(--spacing-32)]">
          <p className="text-[length:var(--text-caption)] uppercase text-text-inverse/50 mb-2">{d.points.balanceLabel}</p>
          <p
            className="text-[length:var(--text-heading)] leading-[var(--leading-heading)] font-bold text-[color:var(--color-primary)]"
            aria-label={balanceDigits === null ? undefined : t(d.points.balanceAria, { amount: balanceDigits })}
          >
            {/* 자릿수 span은 훅이 명령형으로 생성한다 — 스크린리더에는 위 aria-label로 전달 */}
            {balance === null && <span aria-hidden="true">—</span>}
            <span ref={balanceRef} className="t-digit-group" aria-hidden="true" />
            {/* 단위는 팝인 대상 바깥의 정적 span — t-digit을 붙이지 않는다 */}
            {balance !== null && <span aria-hidden="true">{' '}{d.points.unitSuffix}</span>}
          </p>
        </Card>

        {/* 내역 */}
        <div className="flex flex-col gap-[var(--spacing-16)]">
          <h2 className="text-[length:var(--text-caption)] uppercase text-text/40 px-1">{d.points.historyTitle}</h2>

          {loading && (
            <div className="py-[var(--spacing-40)] text-center text-text/40 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">{d.points.loading}</div>
          )}

          {!loading && error && (
            <Card tone="inverse" className="text-center py-[var(--spacing-32)]">
              <p className="text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] text-text-inverse/70 mb-[var(--spacing-16)]">{d.points.loadError}</p>
              <button
                onClick={() => load(null, false)}
                className="inline-flex items-center justify-center min-h-11 px-[var(--spacing-16)] rounded-[var(--radius-nav-buttons)] bg-surface text-text text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100"
              >
                {d.points.retry}
              </button>
            </Card>
          )}

          {!loading && !error && items.length === 0 && (
            <EmptyState
              icon={<CoinIcon className="w-8 h-8" />}
              title={d.points.emptyTitle}
              description={d.points.emptyBody}
            />
          )}

          {!loading && !error && items.length > 0 && (
            <div className="flex flex-col gap-[var(--spacing-8)]">
              {items.map((it) => {
                const positive = it.amount > 0
                return (
                  <ListRowCard
                    key={it.id}
                    href={it.href ?? undefined}
                    icon={
                      <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center shrink-0">
                        <CoinIcon className="w-5 h-5 text-text/60" />
                      </div>
                    }
                    title={it.title}
                    subtitle={
                      <div className="flex flex-col">
                        {it.note && <span className="text-[length:var(--text-caption)] text-text/50 truncate">{it.note}</span>}
                        <span className="text-[length:var(--text-caption)] text-text/40">{formatDate(it.created_at)}</span>
                      </div>
                    }
                    trailing={
                      <span className={`text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] font-bold ${positive ? 'text-[color:var(--color-primary)]' : 'text-text/50'}`}>
                        {formatAmount(it.amount)}
                      </span>
                    }
                  />
                )
              })}
            </div>
          )}

          {!loading && !error && cursor && (
            <button
              onClick={() => load(cursor, true)}
              disabled={loadingMore}
              className="mx-auto mt-1 min-h-11 px-[var(--spacing-24)] rounded-[var(--radius-nav-buttons)] bg-surface-elevated text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)] active:scale-95 transition-transform duration-100 disabled:opacity-50"
            >
              {loadingMore ? d.points.loadingMore : d.points.loadMore}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
