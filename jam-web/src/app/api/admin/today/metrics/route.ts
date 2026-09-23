import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { aggregateTodayCardEvents, type TodayCardEventType } from '@/lib/today/events'

const DEFAULT_RANGE_DAYS = 7

function resolveRange(searchParams: URLSearchParams): { from: string; to: string } {
  const toParam = searchParams.get('to')
  const toDate = toParam && !Number.isNaN(Date.parse(toParam)) ? new Date(toParam) : new Date()

  const fromParam = searchParams.get('from')
  const fromDate =
    fromParam && !Number.isNaN(Date.parse(fromParam))
      ? new Date(fromParam)
      : new Date(toDate.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000)

  return { from: fromDate.toISOString(), to: toDate.toISOString() }
}

/**
 * GET /api/admin/today/metrics — 투데이 카드 유형별 노출·열람·후속 행동 누적 조회 (티켓 20260924_0004)
 *
 * `?from=&to=`(ISO 날짜/시각 문자열, 생략 시 최근 7일)로 기간을 지정한다. 어드민 세션 쿠키
 * 없이 자동화 읽기 토큰(`x-admin-read-token`)으로도 조회할 수 있게 `requireAdminRead`를 쓴다
 * (kpi/weekly/route.ts와 동일 패턴). 응답에는 유형 ID×이벤트 건수와 유형별 열람률만 담는다 —
 * 원천(`today_card_events`, 마이그레이션 183)에 애초에 개인 식별 컬럼이 없다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdminRead(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const range = resolveRange(searchParams)

  try {
    const rows = await aggregateTodayCardEvents(range.from, range.to)

    const byType = new Map<string, Record<TodayCardEventType, number>>()
    for (const row of rows) {
      const key = row.contentTypeId ?? 'unknown'
      const bucket = byType.get(key) ?? { impression: 0, click: 0, followup: 0 }
      bucket[row.event] += row.count
      byType.set(key, bucket)
    }

    const types = Array.from(byType.entries())
      .map(([contentTypeId, counts]) => ({
        contentTypeId,
        ...counts,
        // 열람률 = 열람(click) / 노출(impression). 노출이 0이면 나눌 수 없어 null.
        clickThroughRate: counts.impression > 0 ? counts.click / counts.impression : null,
      }))
      .sort((a, b) => a.contentTypeId.localeCompare(b.contentTypeId))

    return NextResponse.json({ range, types })
  } catch (err) {
    console.error('[/api/admin/today/metrics] 집계 오류:', err)
    return NextResponse.json({ error: '집계 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
