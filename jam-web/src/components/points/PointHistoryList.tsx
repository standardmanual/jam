'use client'

import { useEffect, useState, useCallback } from 'react'
import type { PointHistoryItem } from '@/app/api/points/route'
import { Card } from '@ds/components/cards/Card'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { ListRow } from '@/components/ui/ListRow'
import Button from '@/components/ui/Button'
import LoadMoreButton from '@/components/ui/LoadMoreButton'
import { CoinIcon } from '@/components/ui/icons'
import { PointText } from '@ds/components/patterns/PointText'
import { formatDateTimeMinute } from '@/components/LocalDate'
import { d } from '@/lib/i18n'

// 내역 행 숫자는 «+» 없이 쓰고 차감만 «−»를 붙인다. 색은 PointText가 한 곳에서 칠한다(티켓 20261112_1628).
function formatAmount(n: number): string {
  return `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('ko-KR')}`
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
        <Card className="text-center">
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
              eyebrow={it.kind}
              // 대상 이름이 없으면 행위 줄만 둔다. 관리자 조정 «기타»의 자유 입력 사유(note)는 이름 줄로 보존한다.
              title={it.title || it.note || undefined}
              meta={formatDateTimeMinute(it.created_at)}
              metaLines={1}
              value={<PointText value={formatAmount(it.amount)} unit={d.points.unitSuffix} layout="stacked" />}
            />
          ))}
        </div>
      )}

      {!loading && !error && cursor && (
        <LoadMoreButton onClick={onLoadMore} loading={loadingMore}>
          {loadingMore ? d.points.loadingMore : d.common.loadMore}
        </LoadMoreButton>
      )}
    </>
  )
}

/** 프로필 `#points`용 — 마운트될 때 내역을 불러와 목록만 그린다(잔액은 숫자 줄이 이미 갖고 있다) */
export function PointHistorySection() {
  const h = usePointHistory()
  return (
    <div className="flex flex-col gap-2">
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
