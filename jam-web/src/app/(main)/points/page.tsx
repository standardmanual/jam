'use client'

import { Card } from '@ds/components/cards/Card'
import TopNav from '@/components/ui/TopNav'
import { ListRowChip } from '@/components/ui/ListRow'
import { PointHistoryList, usePointHistory } from '@/components/points/PointHistoryList'
import { useDigitPopIn } from '@/components/transitions-pages'
import '@/components/transitions-pages.css'
import { d, t } from '@/lib/i18n'

export default function PointsPage() {
  const { balance, items, cursor, loading, loadingMore, error, load } = usePointHistory()

  // 잔액 — 갱신될 때마다 자릿수 단위로 팝인 (Number pop-in, 02)
  // 훅이 문자열을 한 글자씩 쪼개 마지막 두 글자에 스태거를 걸므로, 단위 '포인트'를 붙이면
  // 스태거가 마지막 자릿수가 아닌 한글에 걸린다. 애니메이션 대상은 숫자만 넘긴다.
  const balanceDigits = balance === null ? null : balance.toLocaleString('ko-KR')
  const balanceRef = useDigitPopIn<HTMLSpanElement>(balanceDigits)

  return (
    <div className="min-h-full text-foreground">
      <TopNav title={d.common.back} />

      <div className="px-4 pt-4 pb-6 flex flex-col gap-5">
        {/* 잔액 카드 */}
        <Card className="text-center">
          <p className="mb-1 flex justify-center">
            <ListRowChip tone="done">{d.points.balanceLabel}</ListRowChip>
          </p>
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
        <div className="flex flex-col gap-2">
          <h2 className="text-xs uppercase text-muted px-1">{d.points.historyTitle}</h2>

          <PointHistoryList
            items={items}
            cursor={cursor}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            onRetry={() => load(null, false)}
            onLoadMore={() => load(cursor, true)}
          />
        </div>
      </div>
    </div>
  )
}
