import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BadgeRow, PoiRow, UserActivityBadgeRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import ShareCardModal from './ShareCardModal'
import PoiMapButton from './PoiMapButton'
import LocalDate from '@/components/LocalDate'

interface BadgeDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; bookId?: string }>
}

export default async function BadgeDetailPage({ params, searchParams }: BadgeDetailPageProps) {
  const { id } = await params
  const { from, bookId } = await searchParams
  const backHref = from === 'itembook' && bookId ? `/itembooks/${bookId}` : '/badges'
  const backLabel = from === 'itembook' ? '아이템북' : '배지 목록'
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: badge }, { data: earnedRow }] = await Promise.all([
    supabase.from('badges').select('*').eq('id', id).single(),
    supabase
      .from('user_activity_badges')
      .select('*, poi:triggered_by_poi_id(id, name, latitude, longitude)')
      .eq('user_id', user.id)
      .eq('badge_id', id)
      .maybeSingle(),
  ])

  if (!badge) notFound()

  const badgeRow = badge as BadgeRow
  const earned = earnedRow as (UserActivityBadgeRow & { poi: PoiRow | null }) | null

  // triggered_by_poi_id join 결과 우선 사용, 없으면 condition_json.poi_id 폴백
  let poi: PoiRow | null = earned?.poi ?? null
  if (!poi && badgeRow.condition_json?.poi_id) {
    const { data: poiData } = await supabase
      .from('poi')
      .select('*')
      .eq('id', badgeRow.condition_json.poi_id)
      .single()
    poi = poiData as PoiRow | null
  }

  return (
    <div className="min-h-full bg-jam-teal px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 flex flex-col gap-6">
      {/* 뒤로 가기 */}
      <Link href={backHref} className="flex items-center gap-1 text-jam-ink font-bold text-sm w-fit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        {backLabel}
      </Link>

      {/* 배지 이미지 (대형) */}
      <div className="flex flex-col items-center gap-4 py-4">
        <div
          className={[
            'w-44 h-44 rounded-[2rem] bg-white border-[3px] border-jam-ink shadow-[5px_5px_0_0_#161616] flex items-center justify-center overflow-hidden',
            !earned ? 'grayscale opacity-50' : '',
          ].join(' ')}
        >
          {badgeRow.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={badgeRow.image_url}
              alt={badgeRow.name}
              className="w-full h-full object-contain p-4"
            />
          ) : (
            <span className="text-7xl">🏅</span>
          )}
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black mb-2 text-jam-ink">{badgeRow.name}</h1>
          <RarityBadge rarity={badgeRow.rarity} />
        </div>
      </div>

      {/* 배지 정보 */}
      <Card>
        <h2 className="text-xs font-black text-jam-ink/40 uppercase tracking-wider mb-2">획득 조건</h2>
        <p className="text-sm text-jam-ink/80 leading-relaxed font-semibold">{badgeRow.description}</p>
      </Card>

      {/* 획득 정보 */}
      {earned && (
        <Card glow className="bg-jam-lime">
          <h2 className="text-xs font-black text-jam-ink/50 uppercase tracking-wider mb-3">획득 정보</h2>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-jam-ink/60 font-semibold">획득 일시</span>
              <span className="text-sm font-bold"><LocalDate iso={earned.earned_at} options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }} /></span>
            </div>
            {earned.triggered_by_activity_name && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-jam-ink/60 font-semibold">트리거 활동</span>
                <span className="text-sm font-bold truncate max-w-[180px] text-right">
                  {earned.triggered_by_activity_name}
                </span>
              </div>
            )}
            {earned.triggered_by_distance_km && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-jam-ink/60 font-semibold">활동 거리</span>
                <span className="text-sm font-bold">{earned.triggered_by_distance_km} km</span>
              </div>
            )}
            {earned.triggered_by_activity_date && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-jam-ink/60 font-semibold">활동 일자</span>
                <span className="text-sm font-bold">
                  <LocalDate iso={earned.triggered_by_activity_date} options={{ year: 'numeric', month: 'long', day: 'numeric' }} />
                </span>
              </div>
            )}
            {earned.triggered_by_strava_id && (
              <a
                href={`https://www.strava.com/activities/${earned.triggered_by_strava_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 flex items-center justify-center gap-2 w-full py-2 rounded-xl bg-[#FC4C02] text-white text-sm font-black border-2 border-jam-ink"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
                </svg>
                Strava에서 보기
              </a>
            )}
          </div>
        </Card>
      )}

      {/* POI 위치 보기 */}
      {poi && (
        <Card>
          <h2 className="text-xs font-black text-jam-ink/40 uppercase tracking-wider mb-3">연결 위치</h2>
          <p className="text-sm text-jam-ink/70 mb-3 font-semibold">{poi.name}</p>
          <PoiMapButton lat={poi.latitude} lng={poi.longitude} poiName={poi.name} />
        </Card>
      )}

      {/* 액션 버튼들 */}
      <div className="flex flex-col gap-3">
        {earned && (
          <ShareCardModal badgeId={badgeRow.id} badgeName={badgeRow.name} />
        )}
        {badgeRow.patch_available && (
          <a
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-center bg-white border-[3px] border-jam-ink text-jam-ink font-black py-3 rounded-2xl text-base shadow-[3px_3px_0_0_#161616]"
          >
            실물 패치 보기 ↗
          </a>
        )}
      </div>

      {/* 미획득 안내 */}
      {!earned && (
        <Card className="text-center py-4 border-dashed">
          <p className="text-jam-ink/60 text-sm font-bold">아직 획득하지 못한 배지예요</p>
          <p className="text-jam-ink/40 text-xs mt-1 font-semibold">조건을 달성하면 자동으로 획득됩니다</p>
        </Card>
      )}
    </div>
  )
}
