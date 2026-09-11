import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TodayCardForm from '../../TodayCardForm'
import { normalizeDateParam } from '@/lib/admin/today-calendar'
import { singleQueryParam, type SearchParamValue } from '@/lib/searchParams'
import type { TodayCardRow } from '@/types/database'
import type { BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'

interface EditTodayCardPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: SearchParamValue }>
}

/**
 * 투데이 카드 수정 화면 — 티켓 20260911_1454
 *
 * `date` 쿼리는 목록에서 어느 날짜를 보다가 [수정]을 눌렀는지를 나른다 — 저장·취소·삭제 후
 * 그 날짜의 목록으로 돌아간다(카드 자신의 날짜가 아니다, User Story 10).
 */
export default async function EditTodayCardPage({ params, searchParams }: EditTodayCardPageProps) {
  const { id } = await params
  const returnDate = normalizeDateParam(singleQueryParam((await searchParams).date))
  const supabase = createServiceClient()

  const [{ data }, { data: missionsRaw }, { data: booksRaw }] = await Promise.all([
    supabase.from('today_cards').select('*').eq('id', id).single(),
    supabase.from('missions').select('id, title').order('created_at', { ascending: false }),
    supabase.from('item_books').select('id, name').order('name'),
  ])
  if (!data) notFound()
  const card = data as TodayCardRow

  // 이미 참조 중인(badge_ids) 배지의 표시용 라벨만 bounded 조회한다(20260826_011 A2와 동일 패턴).
  const badgeIds = card.badge_ids ?? []
  const { data: badgeLabelsRaw } =
    badgeIds.length > 0
      ? await supabase.from('badges').select('id, name, rarity, type, point_reward, admin_category, image_url').in('id', badgeIds)
      : { data: [] as BadgeSearchResult[] }
  const badgeLabels = (badgeLabelsRaw ?? []) as BadgeSearchResult[]

  const missions = (missionsRaw ?? []) as { id: string; title: string }[]
  const itemBooks = (booksRaw ?? []) as { id: string; name: string }[]

  return (
    <div className="p-4 md:p-8">
      <TodayCardForm
        card={card}
        missions={missions}
        itemBooks={itemBooks}
        badgeLabels={badgeLabels}
        returnDate={returnDate}
        header={
          <div>
            <Link
              href={`/admin/today/${id}?date=${returnDate}`}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              ← 투데이 카드 상세
            </Link>
            <h1 className="text-2xl font-bold mt-2">투데이 카드 수정</h1>
          </div>
        }
      />
    </div>
  )
}
