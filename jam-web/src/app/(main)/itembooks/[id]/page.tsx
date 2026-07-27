import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type {
  BadgeRow,
  ItemBookRow,
  FactionRow,
  InventoryItemRow,
  UserItemBookSlotRow,
} from '@/types/database'
import Card from '@/components/ui/Card'
import SlotGrid, { type BadgeSlot } from './SlotGrid'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ u?: string; from?: string; itemId?: string }>
}

type ItemBookWithFaction = ItemBookRow & { faction: FactionRow | null }

export default async function ItemBookDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { u, from, itemId } = await searchParams
  // 아이템배지 상세(/inventory/[itemId])에서 들어온 경우 뒤로가기도 그 화면으로
  const backHref = from === 'badge' && itemId ? `/inventory/${itemId}` : null
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: subjectRaw } = await (service as any)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inventoryRaw } = await (service as any)
    .from('inventory')
    .select('id')
    .eq('user_id', subjectId)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  // 4~7) 인벤 아이템 / 슬롯 / 완성 / POI 배지 획득 이력 병렬 조회 (대상 유저 기준)
  const [invRes, slotsRes, completionRes, poiEarnsRes] = await Promise.all([
    inventory && badgeIds.length > 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (service as any)
          .from('inventory_items')
          .select('id, badge_id, serial_number, serial_prefix, slotted_in, obtained_at')
          .eq('inventory_id', inventory.id)
          .in('badge_id', badgeIds)
          .is('dropped_at', null)
          .order('obtained_at', { ascending: true })
      : Promise.resolve({ data: [] as InventoryItemRow[] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_item_book_slots')
      .select('id, badge_id, slotted_at')
      .eq('user_id', subjectId)
      .eq('item_book_id', id),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_item_book_completions')
      .select('item_book_id')
      .eq('user_id', subjectId)
      .eq('item_book_id', id)
      .maybeSingle(),
    // POI 배지는 슬롯팅 없이 "1회 이상 획득했는가"로만 판정한다
    poiBadgeIds.length > 0
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any)
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
    <div className="flex flex-col min-h-full bg-jam-teal">
      {/* 헤더 */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4 max-w-2xl mx-auto w-full">
        <Link
          href={backHref ?? (isOwnBook ? '/itembooks' : `/${subjectUsername}#itembooks`)}
          className="flex items-center gap-1 text-jam-ink font-bold text-sm w-fit mb-5"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            className="w-4 h-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          {backHref ? '배지 상세' : '아이템북 목록'}
        </Link>

        {/* 북 정보 */}
        <div className="flex gap-4 items-start mb-4">
          {book.image_url && (
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white border-[3px] border-jam-ink shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={book.image_url}
                alt={book.name}
                className="w-full h-full object-contain p-1"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-black leading-tight text-jam-ink">
                {book.name}
              </h1>
              {isCompleted && (
                <span className="text-jam-ink bg-jam-lime border-2 border-jam-ink text-xs font-black px-2 py-0.5 rounded-full">
                  완성
                </span>
              )}
            </div>
            {book.faction && (
              <p className="text-jam-ink/70 text-xs font-black mb-1">
                {book.faction.name}
              </p>
            )}
            <p className="text-jam-ink/60 text-sm leading-relaxed font-semibold">
              {book.description}
            </p>
          </div>
        </div>

        {/* 스토리 */}
        {book.story_text && (
          <p className="text-jam-ink/60 text-xs leading-relaxed font-semibold italic mb-4 whitespace-pre-line">
            {book.story_text}
          </p>
        )}

        {/* 진행도 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2.5 rounded-full bg-white/40 overflow-hidden border border-jam-ink/20">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCompleted ? 'bg-jam-lime' : 'bg-jam-ink/30'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-jam-ink/60 tabular-nums font-bold">
            {slottedCount} / {totalBadgeCount}
          </span>
        </div>
      </div>

      {/* 크림 패널 — 슬롯 그리드 */}
      <div className="flex-1 bg-jam-cream rounded-t-[2rem] border-t-[3px] border-jam-ink px-5 py-6">
        <div className="max-w-2xl mx-auto w-full">
          {badges.length > 0 && (
            <p className="text-xs text-jam-ink/50 mb-4 text-center font-bold">
              보유한 아이템 배지를 슬롯에 장착해 아이템북을 완성해요
            </p>
          )}

          {totalBadgeCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">🗂️</span>
              <p className="text-jam-ink/60 font-bold text-sm">
                아직 이 아이템북에 등록된 배지가 없어요.
              </p>
            </div>
          ) : (
            badges.length > 0 && (
              <SlotGrid itemBookId={id} badgeSlots={badgeSlots} readOnly={!isOwnBook} />
            )
          )}

          {/* POI 배지 — 슬롯팅 없이 방문(획득) 여부만 표시 */}
          {poiBadges.length > 0 && (
            <div className={badges.length > 0 ? 'mt-6' : ''}>
              <p className="text-xs text-jam-ink/50 mb-3 text-center font-bold">
                POI 배지는 해당 장소를 지나가면 자동으로 채워져요
              </p>
              <div className="grid grid-cols-3 gap-3">
                {poiBadges.map((poiBadge) => {
                  const earned = earnedPoiBadgeIds.has(poiBadge.id)
                  return (
                    <div
                      key={poiBadge.id}
                      className={`rounded-2xl border-[3px] border-jam-ink p-2 flex flex-col items-center text-center ${
                        earned ? 'bg-white' : 'bg-jam-ink/5'
                      }`}
                    >
                      <div className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center">
                        {poiBadge.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={poiBadge.image_url}
                            alt={poiBadge.name}
                            className={`w-full h-full object-contain ${earned ? '' : 'opacity-25 grayscale'}`}
                          />
                        ) : (
                          <span className="text-2xl opacity-30">📍</span>
                        )}
                      </div>
                      <p
                        className={`mt-1.5 text-[11px] font-black leading-tight ${
                          earned ? 'text-jam-ink' : 'text-jam-ink/40'
                        }`}
                      >
                        {poiBadge.name}
                      </p>
                      <span
                        className={`mt-1 text-[10px] font-black px-1.5 py-0.5 rounded-full border-2 border-jam-ink ${
                          earned ? 'bg-jam-lime text-jam-ink' : 'bg-white/60 text-jam-ink/40 border-jam-ink/20'
                        }`}
                      >
                        {earned ? '획득' : '미획득'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 완성 카드 */}
          {isCompleted && (
            <div className="mt-5">
              <Card glow className="bg-jam-lime text-center py-4">
                <p className="text-jam-ink font-black text-base mb-1">
                  🎉 아이템북 완성!
                </p>
                <p className="text-jam-ink/60 text-sm font-semibold">
                  모든 아이템 배지를 슬롯에 장착했어요
                </p>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
