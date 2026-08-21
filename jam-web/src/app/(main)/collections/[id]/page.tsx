import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type {
  BadgeRow,
  ItemBookRow,
  FactionRow,
  InventoryItemRow,
  UserItemBookSlotRow,
} from '@/types/database'
import TopNav from '@/components/ui/TopNav'
import { PinIcon, BookIcon } from '@/components/ui/icons'
import { EmptyState } from '@ds/components/feedback/EmptyState'
import SlotGrid, { type BadgeSlot } from './SlotGrid'
import ItemBookHeroSection from './ItemBookHeroSection'
import { d } from '@/lib/i18n'
import { getBadgeBackgroundStyle, getBadgeBackgroundVideoUrl, getBadgeThemedTextStyle, hasBadgeBackgroundTheme } from '@/lib/badgeBackgroundTheme'
import BadgeBackgroundVideoTiles from '@/components/BadgeBackgroundVideoTiles'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ u?: string; from?: string; itemId?: string }>
}

type ItemBookWithFaction = ItemBookRow & { faction: FactionRow | null }

const PAGE_BG = 'var(--color-surface)'
const CARD_BG = '#000000'
const THUMB_BG = '#333333'
const TEXT_SECONDARY = '#B2B2B2'

export default async function ItemBookDetailPage({ params, searchParams }: Props) {
  const { id } = await params
  const { u, from, itemId } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ?u=username — 다른 유저의 프로필에서 진입한 경우 그 유저 기준으로 슬롯 현황을 보여준다.
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

  const backHref =
    from === 'badge' && itemId ? `/inventory/${itemId}` :
    from === 'badges' ? '/badges#collection' :
    subjectUsername ? `/${subjectUsername}#collections` :
    null

  // 1) 아이템북 + 세계관
  const { data: bookRaw } = await supabase
    .from('item_books')
    .select('*, faction:factions(*)')
    .eq('id', id)
    .single()
  if (!bookRaw) notFound()
  const book = bookRaw as unknown as ItemBookWithFaction

  // 2) 배지 (아이템 + POI)
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

  // 3) 인벤토리
  const { data: inventoryRaw } = await service
    .from('inventory')
    .select('id')
    .eq('user_id', subjectId)
    .single()
  const inventory = inventoryRaw as { id: string } | null

  // 4~7) 병렬 조회
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
    poiBadgeIds.length > 0
      ? service
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

  const earnedPoiBadgeIds = new Set(
    ((poiEarnsRes.data ?? []) as { badge_id: string }[]).map((e) => e.badge_id)
  )

  const totalBadgeCount = badges.length + poiBadges.length
  const slottedCount = slots.length + earnedPoiBadgeIds.size
  const isCompleted =
    completionRes.data != null ||
    (totalBadgeCount > 0 && slottedCount >= totalBadgeCount)

  // [20260819_014] 배지 상세화면(20260819_011)과 동일한 원칙 — 배경은 이 고정 레이어 한 곳에서만
  // 그린다. 배경이 있는 컬렉션에서는 TopNav·본문을 투명하게 두어 아래 레이어가 그대로 비쳐 보이게
  // 하고, 없으면 기존 PAGE_BG를 그대로 유지한다(회귀 방지).
  const themedBackground = hasBadgeBackgroundTheme(book)
  const pageBg = themedBackground ? 'transparent' : PAGE_BG
  const topNavStyle: React.CSSProperties = { background: pageBg, color: '#FFFFFF' }
  const themedTextStyle: React.CSSProperties = getBadgeThemedTextStyle(themedBackground)
  const backgroundVideoUrl = getBadgeBackgroundVideoUrl(book)
  const backgroundLayer = (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '430px',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        ...getBadgeBackgroundStyle(book),
      }}
    >
      {backgroundVideoUrl && (
        <BadgeBackgroundVideoTiles
          src={backgroundVideoUrl}
          poster={book.background_image_url}
        />
      )}
    </div>
  )

  return (
    <div className="flex flex-col min-h-full" style={{ background: pageBg, color: '#FFFFFF', ...themedTextStyle }}>
      {backgroundLayer}
      <TopNav
        title={book.name}
        backHref={backHref ?? '/badges#collection'}
        headerStyle={topNavStyle}
      />

      {/* 스크롤 컨테이너 — 외부: padding 16 / gap 12 */}
      <div className="relative z-10 flex-1 flex flex-col px-4 pt-0 pb-10 gap-3">

        <ItemBookHeroSection
          book={{ name: book.name, description: book.description, image_url: book.image_url }}
          slottedCount={slottedCount}
          totalBadgeCount={totalBadgeCount}
        />

        {/* 스토리 텍스트 */}
        {book.story_text && (
          <p
            style={{
              color: '#666666',
              fontSize: '12px',
              lineHeight: '1.6',
              fontStyle: 'italic',
              whiteSpace: 'pre-line',
            }}
          >
            {book.story_text}
          </p>
        )}

        {/* 배지 없음 상태 */}
        {totalBadgeCount === 0 && (
          <EmptyState
            icon={<BookIcon className="w-8 h-8" />}
            title={d.itembooks.noBadgesTitle}
            description={d.itembooks.noBadgesBody}
          />
        )}

        {/* 아이템배지 슬롯 섹션 */}
        {badges.length > 0 && (
          <div className="flex flex-col gap-3">
            <SlotGrid
              itemBookId={id}
              badgeSlots={badgeSlots}
              readOnly={!isOwnBook}
              badgeLinkQuery={!isOwnBook && subjectUsername ? `?u=${subjectUsername}` : ''}
            />
          </div>
        )}

        {/* POI 배지 섹션 */}
        {poiBadges.length > 0 && (
          <div className={badges.length > 0 ? 'mt-4 flex flex-col gap-3' : 'flex flex-col gap-3'}>
            <p
              className="font-bold"
              style={{ color: '#FFFFFF', fontSize: '16px', lineHeight: '1.2' }}
            >
              {d.itembooks.poiSectionTitle}
            </p>
            <p style={{ color: '#666666', fontSize: '12px', textAlign: 'center' }}>
              {d.itembooks.poiHint}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {poiBadges.map((poiBadge) => {
                const earned = earnedPoiBadgeIds.has(poiBadge.id)
                return (
                  <div
                    key={poiBadge.id}
                    className={`flex flex-col items-center p-3 rounded-2xl gap-2 ${earned ? '' : 'opacity-40'}`}
                    style={{ background: CARD_BG }}
                  >
                    <div
                      className="w-[90px] h-[90px] rounded-2xl overflow-hidden flex items-center justify-center"
                      style={{ background: THUMB_BG }}
                    >
                      {poiBadge.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={poiBadge.image_url}
                          alt={poiBadge.name}
                          className={`w-full h-full object-contain ${earned ? '' : 'grayscale'}`}
                        />
                      ) : (
                        <PinIcon className="w-8 h-8" style={{ color: '#555555' }} />
                      )}
                    </div>
                    <p
                      className="text-center line-clamp-2 w-full"
                      style={{ color: '#FFFFFF', fontSize: '12px', lineHeight: '1.3' }}
                    >
                      {poiBadge.name}
                    </p>
                    <span
                      className="inline-flex items-center px-2 py-1 rounded-full font-bold uppercase"
                      style={{
                        background: earned ? '#00CC7A' : '#333333',
                        color: earned ? '#000000' : '#999999',
                        fontSize: '10px',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {earned ? d.itembooks.poiEarned : d.itembooks.poiNotEarned}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 완성 배너 */}
        {isCompleted && (
          <div
            className="mt-4 rounded-2xl p-6 text-center"
            style={{ background: CARD_BG }}
          >
            <p
              className="font-bold mb-2"
              style={{ color: '#FFFFFF', fontSize: '18px' }}
            >
              {d.itembooks.completedTitle}
            </p>
            <p style={{ color: TEXT_SECONDARY, fontSize: '14px' }}>
              {d.itembooks.completedBody}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
