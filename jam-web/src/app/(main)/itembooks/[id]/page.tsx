import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { BadgeRow, ItemBookRow, UserActivityBadgeRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'

interface Props {
  params: Promise<{ id: string }>
}

const rarityGlowMap: Record<string, string> = {
  common: '',
  rare: 'shadow-[0_0_12px_rgba(59,130,246,0.3)]',
  legendary: 'shadow-[0_0_12px_rgba(168,85,247,0.3)]',
  mythic: 'shadow-[0_0_16px_rgba(245,158,11,0.4)]',
}

export default async function ItemBookDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 아이템북 조회
  const { data: bookRaw } = await supabase.from('item_books').select('*').eq('id', id).single()
  if (!bookRaw) notFound()
  const book = bookRaw as ItemBookRow

  // 이 북에 포함된 모든 배지 ID
  const allBadgeIds = [book.required_activity_badge_id, ...book.required_item_badge_ids]
  if (book.reward_badge_id) allBadgeIds.push(book.reward_badge_id)

  // 배지 정보 + 유저 획득 여부 병렬 조회
  const [{ data: badgesRaw }, { data: earnedRaw }] = await Promise.all([
    supabase.from('badges').select('*').in('id', allBadgeIds),
    supabase
      .from('user_activity_badges')
      .select('badge_id, earned_at, triggered_by_strava_id, triggered_by_activity_name, triggered_by_distance_km, triggered_by_activity_date')
      .eq('user_id', user.id)
      .in('badge_id', allBadgeIds),
  ])

  const badges = (badgesRaw ?? []) as BadgeRow[]
  const earnedMap = new Map(
    ((earnedRaw ?? []) as Pick<UserActivityBadgeRow, 'badge_id' | 'earned_at' | 'triggered_by_strava_id' | 'triggered_by_activity_name' | 'triggered_by_distance_km' | 'triggered_by_activity_date'>[])
      .map((e) => [e.badge_id, e])
  )

  // 배지를 활동뱃지 → 아이템뱃지 → 보상뱃지 순으로 정렬
  const orderedIds = [
    book.required_activity_badge_id,
    ...book.required_item_badge_ids,
    ...(book.reward_badge_id ? [book.reward_badge_id] : []),
  ]
  const badgeMap = new Map(badges.map((b) => [b.id, b]))

  const orderedBadges = orderedIds
    .map((bid) => badgeMap.get(bid))
    .filter(Boolean) as BadgeRow[]

  const ownedCount = orderedBadges.filter((b) => earnedMap.has(b.id)).length
  const totalCount = orderedBadges.length
  const completed = ownedCount === totalCount
  const pct = Math.round((ownedCount / totalCount) * 100)

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="px-5 pt-5 pb-4">
        <Link
          href="/badges"
          className="flex items-center gap-1 text-white/50 text-sm w-fit hover:text-white transition-colors mb-5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          아이템북 목록
        </Link>

        {/* 아이템북 정보 (상단) */}
        <div className="flex gap-4 items-start mb-4">
          {book.image_url && (
            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-white/5 shrink-0 border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={book.image_url} alt={book.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-black leading-tight">{book.name}</h1>
              {completed && (
                <span className="text-[#AEEA00] text-xs font-bold bg-[#AEEA00]/10 px-2 py-0.5 rounded-full">완성</span>
              )}
            </div>
            <p className="text-white/50 text-sm leading-relaxed">{book.description}</p>
          </div>
        </div>

        {/* 진행도 */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${completed ? 'bg-[#AEEA00]' : 'bg-white/40'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-white/40 tabular-nums">{ownedCount} / {totalCount}</span>
        </div>
      </div>

      <div className="h-px bg-white/10 mx-5" />

      {/* 배지 그리드 (하단) */}
      <div className="px-5 py-5 flex-1">
        {book.reward_badge_id && (
          <p className="text-xs text-white/30 mb-3 text-center">전부 모으면 보상 배지를 획득해요</p>
        )}

        <div className="grid grid-cols-3 gap-3">
          {orderedBadges.map((badge, idx) => {
            const earned = earnedMap.get(badge.id)
            const isOwned = !!earned
            const isReward = badge.id === book.reward_badge_id
            const glow = isOwned ? rarityGlowMap[badge.rarity] ?? '' : ''

            const card = (
              <div
                className={[
                  'flex flex-col items-center gap-2 p-3 rounded-2xl border transition-all',
                  isOwned
                    ? `bg-white/5 border-white/10 hover:border-white/20 active:scale-95 ${glow}`
                    : 'bg-white/[0.02] border-white/5',
                  isReward ? 'col-span-3 flex-row gap-3 p-4' : '',
                ].join(' ')}
              >
                {/* 뱃지 이미지 */}
                <div
                  className={[
                    'rounded-xl flex items-center justify-center overflow-hidden',
                    isReward ? 'w-16 h-16 shrink-0' : 'w-16 h-16',
                  ].join(' ')}
                >
                  {badge.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={badge.image_url}
                      alt={isOwned ? badge.name : '???'}
                      className={[
                        'w-full h-full object-cover',
                        !isOwned ? 'grayscale brightness-[0.25]' : '',
                      ].join(' ')}
                    />
                  ) : (
                    <span className={`text-3xl ${!isOwned ? 'grayscale opacity-20' : ''}`}>
                      {isReward ? '🎁' : '🏅'}
                    </span>
                  )}
                </div>

                {/* 이름 + 희귀도 */}
                <div className={isReward ? 'flex-1 min-w-0' : 'flex flex-col items-center gap-1 w-full'}>
                  {isReward && (
                    <p className="text-[10px] text-[#AEEA00]/60 font-semibold uppercase tracking-wider mb-0.5">
                      완성 보상
                    </p>
                  )}
                  <p className={[
                    'text-xs font-medium leading-tight',
                    isReward ? '' : 'text-center line-clamp-2',
                    !isOwned ? 'text-white/20' : '',
                  ].join(' ')}>
                    {isOwned ? badge.name : '???'}
                  </p>
                  {isOwned && (
                    <div className={isReward ? 'mt-1' : ''}>
                      <RarityBadge rarity={badge.rarity} />
                    </div>
                  )}
                  {isOwned && earned?.earned_at && (
                    <p className={`text-[10px] text-white/30 ${isReward ? 'mt-0.5' : 'text-center'}`}>
                      {new Date(earned.earned_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} 획득
                    </p>
                  )}
                  {!isOwned && (
                    <p className={`text-[10px] text-white/15 ${isReward ? '' : 'text-center'}`}>
                      {idx + 1}번째 배지
                    </p>
                  )}
                </div>
              </div>
            )

            return isOwned ? (
              <Link key={badge.id} href={`/badges/${badge.id}?from=itembook&bookId=${id}`} className={isReward ? 'col-span-3' : ''}>
                {card}
              </Link>
            ) : (
              <div key={badge.id} className={isReward ? 'col-span-3' : ''}>
                {card}
              </div>
            )
          })}
        </div>
      </div>

      {/* 완성 시 보상 카드 */}
      {completed && book.reward_badge_id && (
        <div className="px-5 pb-6">
          <Card glow className="text-center py-4">
            <p className="text-[#AEEA00] font-bold text-base mb-1">🎉 아이템북 완성!</p>
            <p className="text-white/50 text-sm">보상 배지가 지급됐어요</p>
          </Card>
        </div>
      )}
    </div>
  )
}
