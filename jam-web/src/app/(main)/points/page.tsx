'use client'

import { useEffect, useState, useCallback, type ReactNode } from 'react'
import type { PointHistoryItem } from '@/app/api/points/route'
import TopNav from '@/components/ui/TopNav'
import { Card } from '@ds/components/cards/Card'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import { ListRow } from '@/components/ui/ListRow'
import Button from '@/components/ui/Button'
import { CoinIcon } from '@/components/ui/icons'
import { useDigitPopIn } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { formatKoreanDateTime } from '@/components/LocalDate'
import { d, t } from '@/lib/i18n'
import { tPoint } from '@/lib/i18n/tPoint'

// 금액 전체(부호 포함)를 PointText가 오렌지로 칠한다. 차감(−)도 같은 색이다(티켓 20261104_2319 3회차).
function formatAmount(n: number): ReactNode {
  const sign = n > 0 ? '+' : '−'
  return tPoint(d.points.amountValue, { amount: `${sign}${Math.abs(n).toLocaleString('ko-KR')}` })
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
    <div className="min-h-full text-foreground">
      <TopNav title={d.common.back} />

      <div className="px-4 pt-0 pb-10 flex flex-col gap-6">
        {/* 잔액 카드 */}
        <Card className="text-center py-8">
          <p className="text-xs uppercase text-muted mb-2">{d.points.balanceLabel}</p>
          <p
            className="text-5xl font-bold text-point-text"
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
        <div className="flex flex-col gap-4">
          <h2 className="text-xs uppercase text-muted px-1">{d.points.historyTitle}</h2>

          {loading && (
            <div className="py-10 text-center text-muted text-base">{d.points.loading}</div>
          )}

          {!loading && error && (
            <Card className="text-center py-8">
              <p className="text-base text-muted mb-4">{d.points.loadError}</p>
              <Button variant="secondary" surface="sub" onClick={() => load(null, false)}>
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
              {items.map((it) => {
                return (
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
                )
              })}
            </div>
          )}

          {!loading && !error && cursor && (
            <button
              onClick={() => load(cursor, true)}
              disabled={loadingMore}
              className="mx-auto mt-1 min-h-11 px-6 rounded-full bg-surface text-base active:scale-95 transition-transform duration-100 disabled:opacity-50"
            >
              {loadingMore ? d.points.loadingMore : d.points.loadMore}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
