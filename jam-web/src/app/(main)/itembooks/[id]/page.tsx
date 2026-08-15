import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type {
  BadgeRow,
  ItemBookRow,
  FactionRow,
  InventoryItemRow,
  UserItemBookSlotRow,
} from '@/types/database'
import Card from '@/components/ui/Card'
import TopNav from '@/components/ui/TopNav'
import { BookIcon, PinIcon } from '@/components/ui/icons'
import SlotGrid, { type BadgeSlot } from './SlotGrid'
import { d } from '@/lib/i18n'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ u?: string; from?: string; itemId?: string }>
}

type ItemBookWithFaction = ItemBookRow & { faction: FactionRow | null }

export default async function ItemBookDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { u, from, itemId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ?u=username — 다른 유저의 프로필에서 진입한 경우 그 유저 기준으로 슬롯 현황을 보여준다.
  // inventory/user_item_book_slots 등은 RLS로 본인 행만 조회 가능해서 service client 필요.
  const service = createServiceClient()
  let subjectId = user.id
  let subjectUsername: string | null = null
  if (u) {
        const { data: subjectRaw } = await service
      .from('users')
      .select('id, username')
      .eq('username', u.toLowerCase())
      .maybeSingle()
    if (subjectRaw) {
      subjectId = (subjectRaw as { id: string; username: string }).id
      subjectUsername = (subjectRaw as { id: string; username: string }).username
    }
  }
  const isOwnBook = subjectId === user.id

  // 아이템배지 상세(/inventory/[itemId])에서 들어온 경우 뒤로가기도 그 화면으로,
  // 배지 메뉴의 아이템북 탭에서 들어온 경우 뒤로가기도 그 탭이 활성인 화면으로,
  // 프로필의 아이템북 탭(?u=)에서 들어온 경우 뒤로가기도 그 프로필의 탭이 활성인 화면으로
  const backHref =
    from === 'badge' && itemId ? `/inventory/${itemId}` :
    from === 'badges' ? '/badges#itembook' :
    subjectUsername ? `/${subjectUsername}#itembooks` :
    null

  // 1) 아이템북 + 세계관
  const { data: bookRaw } = await supabase
    .from('item_books')
    .select('*, faction:factions(*)')
    .eq('id', id)
    .single()
  if (!bookRaw) notFound()
  const book = bookRaw as unknown as ItemBookWithFaction

  // 2) 이 북에 속한 배지 — 아이템(슬롯팅) + POI(획득 여부만)
  const { data: badgesRaw } = await supabase
    .from('badges')
    .select('*')
    .eq('item_book_id', id)
    .in('type', ['item', 'poi'])
    .order('created_at', { ascending: true })
  const allBookBadges = (badgesRaw ?? []) as BadgeRow[]
  const badges = allBookBadges.filter((b) => b.type === 'item')
  const poiBadges = allBookBadges.filter((b) => b.type === 'poi')
  const badgeIds = badges.map((b) => b.id)
  const poiBadgeIds = poiBadges.map((b) => b.id)

  // 3) 대상 유저 인벤토리 id
    const { data: inventoryRaw } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', subjectId)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  // 4~7) 인벤 아이템 / 슬롯 / 완성 / POI 배지 획득 이력 병렬 조회 (대상 유저 기준)
  const [invRes, slotsRes, completionRes, poiEarnsRes] = await Promise.all([
    inventory && badgeIds.length > 0
            ? service
          .from('inventory_items')
          .select('id, badge_id, serial_number, serial_prefix, slotted_in, obtained_at')
          .eq('inventory_id', inventory.id)
          .in('badge_id', badgeIds)
          .is('dropped_at', null)
          .order('obtained_at', { ascending: true })
      : Promise.resolve({ data: [] as InventoryItemRow[] }),
        service
      .from('user_item_book_slots')
      .select('id, badge_id, slotted_at')
      .eq('user_id', subjectId)
      .eq('item_book_id', id),
        service
      .from('user_item_book_completions')
      .select('item_book_id')
      .eq('user_id', subjectId)
      .eq('item_book_id', id)
      .maybeSingle(),
    // POI 배지는 슬롯팅 없이 "1회 이상 획득했는가"로만 판정한다
    poiBadgeIds.length > 0
      ?         service
          .from('user_poi_badge_earns')
          .select('badge_id')
          .eq('user_id', subjectId)
          .in('badge_id', poiBadgeIds)
      : Promise.resolve({ data: [] as { badge_id: string }[] }),
  ])

  const inventoryItems = (invRes.data ?? []) as Pick<
    InventoryItemRow,
    'id' | 'badge_id' | 'serial_number' | 'serial_prefix' | 'slotted_in'
  >[]
  const slots = (slotsRes.data ?? []) as Pick<
    UserItemBookSlotRow,
    'id' | 'badge_id' | 'slotted_at'
  >[]

  // 슬롯 조합
  const slotsMap = new Map(slots.map((s) => [s.badge_id, s]))
  const inventoryMap = new Map<
    string,
    Pick<InventoryItemRow, 'id' | 'serial_number' | 'serial_prefix'>
  >()
  for (const item of inventoryItems) {
    if (!item.slotted_in && !inventoryMap.has(item.badge_id)) {
      inventoryMap.set(item.badge_id, {
        id: item.id,
        serial_number: item.serial_number,
        serial_prefix: item.serial_prefix,
      })
    }
  }

  const badgeSlots: BadgeSlot[] = badges.map((badge) => {
    const slot = slotsMap.get(badge.id)
    return {
      badge: {
        id: badge.id,
        name: badge.name,
        image_url: badge.image_url,
        rarity: badge.rarity,
      },
      inventoryItem: inventoryMap.get(badge.id) ?? null,
      slot: slot ? { id: slot.id, slotted_at: slot.slotted_at } : null,
    }
  })

  // 획득한 POI 배지 id 집합(반복 획득해도 1개로만 카운트)
  const earnedPoiBadgeIds = new Set(
    ((poiEarnsRes.data ?? []) as { badge_id: string }[]).map((e) => e.badge_id)
  )

  const totalBadgeCount = badges.length + poiBadges.length
  const slottedCount = slots.length + earnedPoiBadgeIds.size
  const isCompleted =
    completionRes.data != null ||
    (totalBadgeCount > 0 && slottedCount >= totalBadgeCount)
  const pct =
    totalBadgeCount > 0 ? Math.round((slottedCount / totalBadgeCount) * 100) : 0

  return (
    <div className="flex flex-col min-h-full bg-surface text-text">
      <TopNav
        title={from === 'badge' && itemId ? d.itembooks.backToDetail : d.itembooks.backToList}
        backHref={backHref ?? '/itembooks'}
      />

      <div className="px-[var(--spacing-16)] pt-[var(--spacing-24)] pb-[var(--spacing-16)]">
        {/* 북 정보 */}
        <div className="flex gap-[var(--spacing-16)] items-start mb-[var(--spacing-16)]">
          {book.image_url ? (
            <div className="w-20 h-20 rounded-[var(--radius-cards)] overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border)] shrink-0">
              <Image src={book.image_url} alt={book.name} width={80} height={80} className="w-full h-full object-contain p-1" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-[var(--radius-cards)] shadow-[inset_0_0_0_1px_var(--color-border)] shrink-0 flex items-center justify-center">
              <BookIcon className="w-8 h-8 text-text/40" />
            </div>
          )}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-[length:var(--text-heading-sm)] leading-[var(--leading-heading-sm)]">{book.name}</h1>
              {isCompleted && (
                <span className="text-[length:var(--text-caption)] leading-none px-2 py-1 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border)]">
                  {d.itembooks.completed}
                </span>
              )}
            </div>
            {book.faction && (
              <p className="text-text/70 text-[length:var(--text-caption)] mb-1">{book.faction.name}</p>
            )}
            <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
              {book.description}
            </p>
          </div>
        </div>

        {/* 스토리 */}
        {book.story_text && (
          <p className="text-text/60 text-[length:var(--text-caption)] leading-relaxed italic mb-[var(--spacing-16)] whitespace-pre-line">
            {book.story_text}
          </p>
        )}

        {/* 진행도 */}
        <div className="flex items-center gap-[var(--spacing-16)]">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden shadow-[inset_0_0_0_1px_var(--color-border)]">
            <div className="h-full bg-text rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[length:var(--text-caption)] text-text/60 tabular-nums">{slottedCount} / {totalBadgeCount}</span>
        </div>
      </div>

      {/* 슬롯 그리드 */}
      <div className="px-[var(--spacing-16)] pb-[var(--spacing-32)]">
        {badges.length > 0 && (
          <p className="text-[length:var(--text-caption)] text-text/50 mb-[var(--spacing-16)] text-center">
            {d.itembooks.slotHint}
          </p>
        )}

        {totalBadgeCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-[var(--spacing-32)] text-center">
            <p className="text-text/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
              {d.itembooks.noBadgesTitle}
            </p>
          </div>
        ) : (
          badges.length > 0 && (
            <SlotGrid
              itemBookId={id}
              badgeSlots={badgeSlots}
              readOnly={!isOwnBook}
              badgeLinkQuery={!isOwnBook && subjectUsername ? `?u=${subjectUsername}` : ''}
            />
          )
        )}

        {/* POI 배지 — 슬롯팅 없이 방문(획득) 여부만 표시 */}
        {poiBadges.length > 0 && (
          <div className={badges.length > 0 ? 'mt-[var(--spacing-24)]' : ''}>
            <p className="text-[length:var(--text-caption)] text-text/50 mb-[var(--spacing-16)] text-center">
              {d.itembooks.poiHint}
            </p>
            <div className="grid grid-cols-3 gap-[var(--spacing-8)]">
              {poiBadges.map((poiBadge) => {
                const earned = earnedPoiBadgeIds.has(poiBadge.id)
                return (
                  <Card key={poiBadge.id} className={`flex flex-col items-center text-center gap-1 p-[var(--spacing-8)] ${earned ? '' : 'opacity-50'}`}>
                    <div className="relative w-full aspect-square rounded-[var(--radius-cards)] overflow-hidden flex items-center justify-center">
                      {poiBadge.image_url ? (
                        <Image src={poiBadge.image_url} alt={poiBadge.name} fill className={`object-contain ${earned ? '' : 'grayscale'}`} />
                      ) : (
                        <PinIcon className="w-6 h-6 text-text-inverse/30" />
                      )}
                    </div>
                    <p className="text-[length:var(--text-caption)] leading-tight">{poiBadge.name}</p>
                    <span className="text-[length:var(--text-caption)] leading-none px-1.5 py-0.5 rounded-[var(--radius-tags)] shadow-[inset_0_0_0_1px_var(--color-border-inverse)] text-text-inverse/60">
                      {earned ? d.itembooks.poiEarned : d.itembooks.poiNotEarned}
                    </span>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {/* 완성 카드 */}
        {isCompleted && (
          <Card className="mt-[var(--spacing-24)] text-center">
            <p className="text-[length:var(--text-body)] leading-[var(--leading-body)] mb-1">
              {d.itembooks.completedTitle}
            </p>
            <p className="text-text-inverse/60 text-[length:var(--text-body-sm)] leading-[var(--leading-body-sm)]">
              {d.itembooks.completedBody}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
