import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { TodayCardRow } from '@/types/database'
import { Button } from '@/components/admin/ui/button'
import TodayCardList from './TodayCardList'
import TodayDateNav from './TodayDateNav'
import { normalizeDateParam, kstDayBoundsIso } from '@/lib/admin/today-calendar'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'

/**
 * ⚠️ `date`의 타입을 `string`으로 좁히지 말 것 — `?date=a&date=b`처럼 같은 키가 두 번 오면
 * Next가 배열을 넘긴다. `singleQueryParam`이 배열을 「값 없음」(= 오늘 날짜)으로 흡수한다
 * (티켓 20260906_1312).
 */
interface AdminTodayPageProps {
  searchParams: Promise<{ date?: SearchParamValue }>
}

export default async function AdminTodayPage({ searchParams }: AdminTodayPageProps) {
  const date = singleQueryParam((await searchParams).date)
  // 20260902_1028: 날짜별 캘린더뷰로 전환 — 선택 날짜(KST 달력 기준)에 걸치는 카드만 조회한다
  // (구간형 카드는 starts_at~ends_at에 포함되는 모든 날짜의 목록에 매일 반복 노출로 나타난다).
  const selectedDate = normalizeDateParam(date)
  const { startIso, endIso } = kstDayBoundsIso(selectedDate)

  const supabase = createServiceClient()

  // 20260911_1454: 생성·수정 폼이 전용 화면(new · [id]/edit)으로 분리되면서, 이 목록 화면은
  // 카드 테이블 · 캘린더 날짜 탐색만 남았다 — 폼 전용 참조 데이터(missions · itemBooks ·
  // badgeLabels)는 더 이상 여기서 조회하지 않는다.
  const { data: cardsRaw } = await supabase
    .from('today_cards')
    .select('*')
    .lte('starts_at', endIso)
    .gte('ends_at', startIso)
    .order('sort_order', { ascending: true })
    .order('starts_at', { ascending: false })

  const cards = (cardsRaw ?? []) as TodayCardRow[]

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">투데이 콘텐츠 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            홈(투데이) 카드 CMS — 템플릿별 카드 제작 · 예약 발행 · 노출조건 태그
          </p>
        </div>
        <Link href={`/admin/today/new?date=${selectedDate}`}>
          <Button>+ 콘텐츠 추가</Button>
        </Link>
      </div>
      <TodayDateNav selectedDate={selectedDate} />
      <div className="border-t border-border my-4" />
      <TodayCardList cards={cards} selectedDate={selectedDate} />
    </div>
  )
}
