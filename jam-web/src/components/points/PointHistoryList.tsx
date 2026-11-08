'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import type { PointHistoryItem } from '@/app/api/points/route'
import { Card } from '@ds/components/cards/Card'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { ListRow } from '@/components/ui/ListRow'
import Button from '@/components/ui/Button'
import { CoinIcon } from '@/components/ui/icons'
import { formatKoreanDateTime } from '@/components/LocalDate'
import { d } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'

// 금액 전체(부호 포함)를 PointText가 오렌지로 칠한다. 차감(−)도 같은 색이다(티켓 20261104_2319 3회차).
function formatAmount(n: number): ReactNode {
  const sign = n > 0 ? '+' : '−'
  return tPoint(d.points.amountValue, { amount: `${sign}${Math.abs(n).toLocaleString('ko-KR')}` })
}

/**
 * 포인트 내역 데이터 로드 훅 — `/points` 화면과 프로필 `#points`가 함께 쓴다(티켓 20261108_1216).
 * 잔액도 같은 응답에 실려 와서 함께 돌려준다.
 */
export function usePointHistory() {
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

  return { balance, items, cursor, loading, loadingMore, error, load }
}

export interface PointHistoryListProps {
  items: PointHistoryItem[]
  cursor: string | null
  loading: boolean
  loadingMore: boolean
  error: boolean
  /** «다시 시도» */
  onRetry: () => void
  /** «더 보기» */
  onLoadMore: () => void
}

/** 포인트 내역 목록 — 로딩·실패·빈 상태·«더 보기»까지 한 덩어리다. 훅이 없는 표시 컴포넌트다. */
export function PointHistoryList({ items, cursor, loading, loadingMore, error, onRetry, onLoadMore }: PointHistoryListProps) {
  return (
    <>
      {loading && (
        <div className="py-10 text-center text-muted text-base">{d.points.loading}</div>
      )}

      {!loading && error && (
        <Card className="text-center py-8">
          <p className="text-base text-muted mb-4">{d.points.loadError}</p>
          <Button variant="secondary" surface="sub" onClick={onRetry}>
            {d.points.retry}
          </Button>
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
        <div className="flex flex-col gap-2">
          {items.map((it) => (
            <ListRow
              key={it.id}
              href={it.href ?? undefined}
              lead={<CoinIcon className="w-5 h-5" />}
              leadShape="round"
              title={it.title}
              meta={
                <>
                  {it.note ? <span className="block truncate">{it.note}</span> : undefined}
                  <span className="block">{formatKoreanDateTime(it.created_at, { year: true, time: true })}</span>
                </>
              }
              metaLines={0}
              value={formatAmount(it.amount)}
            />
          ))}
        </div>
      )}

      {!loading && !error && cursor && (
        <button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mx-auto mt-1 min-h-11 px-6 rounded-full bg-surface text-base active:scale-95 transition-transform duration-100 disabled:opacity-50 break-keep wrap-break-word"
        >
          {loadingMore ? d.points.loadingMore : d.points.loadMore}
        </button>
      )}
    </>
  )
}

/** 프로필 `#points`용 — 마운트될 때 내역을 불러와 목록만 그린다(잔액은 숫자 줄이 이미 갖고 있다) */
export function PointHistorySection() {
  const h = usePointHistory()
  return (
    <div className="flex flex-col gap-4">
      <PointHistoryList
        items={h.items}
        cursor={h.cursor}
        loading={h.loading}
        loadingMore={h.loadingMore}
        error={h.error}
        onRetry={() => h.load(null, false)}
        onLoadMore={() => h.load(h.cursor, true)}
      />
    </div>
  )
}
