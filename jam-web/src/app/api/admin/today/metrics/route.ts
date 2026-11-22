import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRead } from '@/lib/admin/auth'
import { comparePatternNo } from '@/lib/admin/opsPatterns/read'
import { aggregateTodayCardEvents, type TodayCardEventType } from '@/lib/today/events'
import { FEED_TYPES } from '@/lib/today/feedChipSlots'

const DEFAULT_RANGE_DAYS = 7

type EventCounts = Record<TodayCardEventType, number>

/**
 * `byShape` 행의 종류(티켓 20261122_1328). 응답 키 이름 `byShape`·`shape`는 소비 코드 호환 때문에 그대로 두고, 값이 새 유형 이름인지 옛 모양 이름인지 표시한다.
 * 새 유형 8가지 이름이면 `feed_type`, 값이 없던 기록(`unknown`)이면 `unknown`, 그 밖(옛 7모양 이름 `hero`·`brief` 등 8회차-1 이전 기록)이면 `legacy`다.
 */
type ShapeKind = 'feed_type' | 'legacy' | 'unknown'

function shapeKindOf(shape: string): ShapeKind {
  if (shape === 'unknown') return 'unknown'
  return (FEED_TYPES as readonly string[]).includes(shape) ? 'feed_type' : 'legacy'
}

/** 열람률 = 열람(click) / 노출(impression). 노출이 0이면 나눌 수 없어 null. */
function clickThroughRateOf(counts: EventCounts): number | null {
  return counts.impression > 0 ? counts.click / counts.impression : null
}

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
 * `byShape`의 각 행은 `kind`(`feed_type`·`legacy`·`unknown`)를 더해 새 유형 이름과 옛 모양 이름을 구분한다(값 계산·정렬은 그대로).
 * `byPattern`은 기록 시점 카드의 패턴 번호별 노출·열람·열람률이다(마이그레이션 211, 티켓 20261008_1059). 키 이름과 `patternNo: null`
 * 처리는 결정 기록 API의 `byPattern`과 같다 — 패턴 없는 기록(직접 만든 카드·옛 기록)은 `patternNo: null` 한 줄로 묶고 맨 끝에 둔다.
 */
export async function GET(req: NextRequest) {
  const authError = await requireAdminRead(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const range = resolveRange(searchParams)

  // 시작일이 종료일보다 늦으면 조용히 빈 결과를 내지 않고 알린다(티켓 20260924_1156)
  if (range.from > range.to) {
    return NextResponse.json({ error: '시작일이 종료일보다 늦어요. 기간을 다시 확인해 주세요.' }, { status: 400 })
  }

  try {
    const rows = await aggregateTodayCardEvents(range.from, range.to)

    const byType = new Map<string, EventCounts>()
    const byShapeCounts = new Map<string, EventCounts>()
    const byPatternCounts = new Map<string | null, EventCounts>()
    for (const row of rows) {
      const typeKey = row.contentTypeId ?? 'unknown'
      const typeBucket = byType.get(typeKey) ?? { impression: 0, click: 0, followup: 0 }
      typeBucket[row.event] += row.count
      byType.set(typeKey, typeBucket)

      const shapeKey = row.cardShape ?? 'unknown'
      const shapeBucket = byShapeCounts.get(shapeKey) ?? { impression: 0, click: 0, followup: 0 }
      shapeBucket[row.event] += row.count
      byShapeCounts.set(shapeKey, shapeBucket)

      const patternKey = row.patternNo ?? null
      const patternBucket = byPatternCounts.get(patternKey) ?? { impression: 0, click: 0, followup: 0 }
      patternBucket[row.event] += row.count
      byPatternCounts.set(patternKey, patternBucket)
    }

    const types = Array.from(byType.entries())
      .map(([contentTypeId, counts]) => ({
        contentTypeId,
        ...counts,
        clickThroughRate: clickThroughRateOf(counts),
      }))
      .sort((a, b) => a.contentTypeId.localeCompare(b.contentTypeId))

    const byShape = Array.from(byShapeCounts.entries())
      .map(([shape, counts]) => ({ shape, kind: shapeKindOf(shape), ...counts, clickThroughRate: clickThroughRateOf(counts) }))
      .sort((a, b) => a.shape.localeCompare(b.shape))

    const byPattern = Array.from(byPatternCounts.entries())
      .map(([patternNo, counts]) => ({ patternNo, ...counts, clickThroughRate: clickThroughRateOf(counts) }))
      .sort((a, b) => {
        if (a.patternNo === null || b.patternNo === null) return Number(a.patternNo === null) - Number(b.patternNo === null)
        return comparePatternNo(a.patternNo, b.patternNo)
      })

    return NextResponse.json({ range, types, byShape, byPattern })
  } catch (err) {
    console.error('[/api/admin/today/metrics] 집계 오류:', err)
    return NextResponse.json({ error: '집계 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
