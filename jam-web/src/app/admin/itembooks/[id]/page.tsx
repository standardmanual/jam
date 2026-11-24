import { createServiceClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/admin/ui/button'
import { ItemBookDetail } from '@/components/admin/itembooks/ItemBookDetail'
import { ItemBookTierPanel } from '@/components/admin/itembooks/ItemBookTierPanel'
import { ItemBookTierRewards } from '@/components/admin/itembooks/ItemBookTierRewards'
import { CollectionCoverGenerator } from '@/components/admin/itembooks/CollectionCoverGenerator'
import { parseCoverParams } from '@/components/admin/itembooks/collectionCoverState'
import ItemBookForm from '../ItemBookForm'
import type { ItemBookRow, BadgeRow, TribeRow } from '@/types/database'

export default async function EditItemBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [
    { data: bookRaw },
    { data: tribesRaw },
    { data: slottedRaw },
    { data: otherCoversRaw },
  ] = await Promise.all([
    supabase.from('item_books').select('*').eq('id', id).single(),
    supabase.from('tribes').select('id, name, name_en').eq('is_active', true).order('sort_order'),
    // [20260902_1043] deleted_at 필터를 제거해 배정 관계(item_book_id) 자체가 남아있는 배지는
    // 활성/비활성 무관하게 전부 조회한다 — 어드민 화면에서만 전체 배정 목록이 보여야 한다
    // (유저 노출 회수는 badges.deleted_at으로 별개로 유지됨, 20260823_004).
    supabase.from('badges').select('id, name, rarity, image_url, deleted_at, sort_order').eq('item_book_id', id).eq('type', 'item'),
    // 다른 컬렉션 표지의 배경색 — 생성기가 30° 이내 색을 피한다 (티켓 20261124_1744)
    supabase.from('item_books').select('cover_params').neq('id', id).not('cover_params', 'is', null),
  ])

  if (!bookRaw) notFound()

  const book = bookRaw as ItemBookRow
  const tribes = (tribesRaw ?? []) as Pick<TribeRow, 'id' | 'name' | 'name_en'>[]
  const slottedBadges = (slottedRaw ?? []) as Pick<BadgeRow, 'id' | 'name' | 'rarity' | 'image_url' | 'deleted_at' | 'sort_order'>[]
  const otherBgHexes = ((otherCoversRaw ?? []) as { cover_params: unknown }[])
    .map((r) => parseCoverParams(r.cover_params)?.bgHex)
    .filter((v): v is string => !!v)

  const labelIds = [book.required_activity_badge_id, book.reward_badge_id].filter((v): v is string => !!v)
  const { data: labelBadgesRaw } = labelIds.length > 0
    ? await supabase.from('badges').select('id, name').in('id', labelIds)
    : { data: [] as Pick<BadgeRow, 'id' | 'name'>[] }
  const labelBadgeMap = new Map(((labelBadgesRaw ?? []) as Pick<BadgeRow, 'id' | 'name'>[]).map((b) => [b.id, b.name]))

  const tribeLabel = tribes.find(f => f.id === book.tribe_id)?.name
  // [20260902_1043] "소속 아이템배지" 요약 수치는 목록 페이지의 "아이템 배지 수" 컬럼과 동일하게
  // 활성 배지 수만 의미한다 — 아래 slottedBadges(전체 배정 목록)와는 다른 값이다.
  const activeSlottedBadgeCount = slottedBadges.filter((b) => !b.deleted_at).length

  return (
    <div className="w-full space-y-8 p-4 md:p-8">
      {/* 뒤로가기 + 제목 */}
      <div className="space-y-3">
        <Link href="/admin/itembooks">
          <Button variant="ghost" className="h-auto p-0 text-sm">
            ← 컬렉션
          </Button>
        </Link>
        <h1 className="text-2xl font-bold md:text-3xl">컬렉션 수정</h1>
      </div>

      {/* ItemBook 상세 정보 (읽기 전용) */}
      <ItemBookDetail
        itemBook={book}
        requiredActivityBadgeName={
          book.required_activity_badge_id
            ? labelBadgeMap.get(book.required_activity_badge_id)
            : undefined
        }
        rewardBadgeName={
          book.reward_badge_id
            ? labelBadgeMap.get(book.reward_badge_id)
            : undefined
        }
        tribeName={tribeLabel}
        itemBadgeCount={activeSlottedBadgeCount}
      />

      {/* 대표 이미지(표지) 생성기 (티켓 20261124_1744) */}
      <div className="border-t pt-8">
        <CollectionCoverGenerator
          collectionId={book.id}
          collectionName={book.name}
          initialNameEn={book.name_en ?? null}
          tribeNameEn={tribes.find((f) => f.id === book.tribe_id)?.name_en ?? null}
          coverParams={book.cover_params ?? null}
          badges={slottedBadges}
          otherBgHexes={otherBgHexes}
        />
      </div>

      {/* 4등급 방식 켜기·끄기와 켜기 전 점검 (티켓 20261022_1139) — 편집 폼이 이 값으로 옛 보상 칸을 접는다 */}
      <div className="border-t pt-8">
        <ItemBookTierPanel itemBookId={book.id} initialTierMode={book.tier_mode} />
      </div>

      {/* 등급별 보상 편집기 (티켓 20261022_1139 2회) — 4등급 방식이 켜진 컬렉션에만 붙는다. 패널이 켜기·끄기 뒤 서버 화면을 다시 읽어 나타나거나 사라진다 */}
      {book.tier_mode && (
        <div className="border-t pt-8">
          <ItemBookTierRewards itemBookId={book.id} />
        </div>
      )}

      {/* 편집 폼 */}
      <div className="border-t pt-8">
        <h2 className="text-xl font-bold mb-6">편집</h2>
        <ItemBookForm
          book={book}
          tribes={tribes}
          slottedBadges={slottedBadges}
          requiredActivityBadgeLabel={book.required_activity_badge_id ? labelBadgeMap.get(book.required_activity_badge_id) : undefined}
          rewardBadgeLabel={book.reward_badge_id ? labelBadgeMap.get(book.reward_badge_id) : undefined}
        />
      </div>
    </div>
  )
}
