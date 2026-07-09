import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BadgeRow, PoiRow, UserActivityBadgeRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import ShareCardModal from './ShareCardModal'
import PoiMapButton from './PoiMapButton'

interface BadgeDetailPageProps {
  params: Promise<{ id: string }>
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function BadgeDetailPage({ params }: BadgeDetailPageProps) {
  const { id } = await params
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
    <div className="px-5 py-6 flex flex-col gap-6">
      {/* 뒤로 가기 */}
      <Link href="/badges" className="flex items-center gap-1 text-white/50 text-sm w-fit hover:text-white transition-colors">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        배지 목록
      </Link>

      {/* 배지 이미지 (대형) */}
      <div className="flex flex-col items-center gap-4 py-6">
        <div
          className={[
            'w-40 h-40 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden',
            !earned ? 'grayscale opacity-50' : '',
          ].join(' ')}
        >
          {badgeRow.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={badgeRow.image_url}
              alt={badgeRow.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-7xl">🏅</span>
          )}
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-black mb-2">{badgeRow.name}</h1>
          <RarityBadge rarity={badgeRow.rarity} />
        </div>
      </div>

      {/* 배지 정보 */}
      <Card>
        <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">획득 조건</h2>
        <p className="text-sm text-white/80 leading-relaxed">{badgeRow.description}</p>
      </Card>

      {/* 획득 정보 */}
      {earned && (
        <Card glow>
          <h2 className="text-xs font-semibold text-[#AEEA00]/60 uppercase tracking-wider mb-3">획득 정보</h2>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/50">획득 일시</span>
              <span className="text-sm font-medium">{formatDateTime(earned.earned_at)}</span>
            </div>
            {earned.triggered_by && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-white/50">트리거 활동</span>
                <span className="text-sm font-medium">{earned.triggered_by}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* POI 위치 보기 */}
      {poi && (
        <Card>
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">연결 위치</h2>
          <p className="text-sm text-white/70 mb-3">{poi.name}</p>
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
            className="w-full text-center bg-transparent border border-white/20 text-white/70 font-bold py-3 rounded-xl text-base hover:border-white/40 transition-colors"
          >
            실물 패치 보기 ↗
          </a>
        )}
      </div>

      {/* 미획득 안내 */}
      {!earned && (
        <Card className="text-center py-4 border-dashed">
          <p className="text-white/40 text-sm">아직 획득하지 못한 배지예요</p>
          <p className="text-white/30 text-xs mt-1">조건을 달성하면 자동으로 획득됩니다</p>
        </Card>
      )}
    </div>
  )
}
