import { createServiceClient } from '@/lib/supabase/server'
import Link from 'next/link'
import TodayCardForm from '../TodayCardForm'
import { normalizeDateParam } from '@/lib/admin/today-calendar'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'

interface NewTodayCardPageProps {
  searchParams: Promise<{ date?: SearchParamValue }>
}

/**
 * 투데이 카드 생성 화면 — 티켓 20260911_1454
 *
 * 캘린더뷰(`/admin/today?date=...`)에서 [+ 콘텐츠 추가]를 누르면 보던 날짜가 `date` 쿼리로
 * 넘어온다. 그 날짜를 시작 일시 프리필과 저장·취소 후 돌아갈 목록 날짜에 함께 쓴다
 * (User Story 9·10).
 */
export default async function NewTodayCardPage({ searchParams }: NewTodayCardPageProps) {
  const date = normalizeDateParam(singleQueryParam((await searchParams).date))
  const supabase = createServiceClient()
  const [{ data: missionsRaw }, { data: booksRaw }] = await Promise.all([
    supabase.from('missions').select('id, title').order('created_at', { ascending: false }),
    supabase.from('item_books').select('id, name').order('name'),
  ])
  const missions = (missionsRaw ?? []) as { id: string; title: string }[]
  const itemBooks = (booksRaw ?? []) as { id: string; name: string }[]

  return (
    <div className="p-4 md:p-8">
      {/* 제목은 폼의 섹션 열 위에 둔다 — 오른쪽 레일이 페이지 맨 위에서 시작하도록(티켓 20260911_0901과 동일 이유) */}
      <TodayCardForm
        missions={missions}
        itemBooks={itemBooks}
        badgeLabels={[]}
        initialDate={date}
        returnDate={date}
        header={
          <div>
            <Link href={`/admin/today?date=${date}`} className="text-muted-foreground hover:text-foreground text-sm transition-colors">
              ← 투데이 목록
            </Link>
            <h1 className="text-2xl font-bold mt-2">투데이 카드 등록</h1>
          </div>
        }
      />
    </div>
  )
}
