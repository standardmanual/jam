import { notFound, redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ActivityType, BadgeCondition, BadgeRow, PoiRow, UserActivityBadgeRow } from '@/types/database'
import RarityBadge from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import ShareCardModal from './ShareCardModal'
import PoiMapButton from './PoiMapButton'
import LocalDate from '@/components/LocalDate'
import BackButton from './BackButton'

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  cycling: '자전거 타기',
  running: '러닝',
  trail_running: '트레일러닝',
  hiking: '하이킹',
  walking: '걷기',
}

const SEASON_LABELS: Record<string, string> = {
  spring: '봄(3~5월)',
  summer: '여름(6~8월)',
  fall: '가을(9~11월)',
  winter: '겨울(12~2월)',
  all: '전 계절',
}

const MONTH_LABELS: Record<number, string> = {
  1: '1월', 2: '2월', 3: '3월', 4: '4월', 5: '5월', 6: '6월',
  7: '7월', 8: '8월', 9: '9월', 10: '10월', 11: '11월', 12: '12월',
}

// "HH:MM" 시작 시간을 사람이 읽기 쉬운 시간대 이름으로 변환
function timeSlotLabel(start: string): string {
  const [h] = start.split(':').map(Number)
  if (Number.isNaN(h)) return ''
  if (h >= 4 && h < 8) return '새벽'
  if (h >= 8 && h < 11) return '아침'
  if (h >= 11 && h < 14) return '점심'
  if (h >= 14 && h < 18) return '오후'
  if (h >= 18 && h < 22) return '저녁'
  return '심야'
}

function formatConditionText(condition: BadgeCondition | null): string {
  if (!condition || Object.keys(condition).length === 0) {
    return '관리자에 의해 특별 발급되는 배지입니다.'
  }

  const actType = condition.activity_type ? ACTIVITY_LABELS[condition.activity_type] : '활동'
  const parts: string[] = []

  if (condition.distance_km !== undefined) {
    parts.push(`${actType}으로 누적 ${condition.distance_km}km 이상 달성`)
  }
  if (condition.total_count !== undefined) {
    parts.push(`${actType} ${condition.total_count}회 이상 완료`)
  }
  if (condition.streak_days !== undefined) {
    parts.push(`${condition.streak_days}일 연속으로 활동 완료`)
  }
  if (condition.elevation_gain_m !== undefined) {
    parts.push(`누적 고도 상승 ${condition.elevation_gain_m}m 이상 달성`)
  }
  if (condition.min_speed_kmh !== undefined) {
    parts.push(`단일 ${actType} 활동의 평균 속도 ${condition.min_speed_kmh}km/h 이상`)
  }
  if (condition.duration_minutes !== undefined) {
    parts.push(`단일 ${actType} 활동 ${condition.duration_minutes}분 이상 이동`)
  }
  if (condition.weekend_duration_hours !== undefined) {
    parts.push(`주말 ${actType} 활동 ${condition.weekend_duration_hours}시간 이상 이동`)
  }
  if (condition.weekly_count !== undefined) {
    parts.push(`한 주에 ${actType} ${condition.weekly_count}회 이상 완료`)
  }
  if (condition.monthly_km !== undefined) {
    const monthLabel = condition.month ? `${MONTH_LABELS[condition.month] ?? `${condition.month}월`} 한 달간` : '한 달간'
    parts.push(`${monthLabel} ${actType}으로 ${condition.monthly_km}km 이상 달성`)
  } else if (condition.month !== undefined) {
    parts.push(`${MONTH_LABELS[condition.month] ?? `${condition.month}월`}에 ${actType} 활동 완료`)
  }
  if (condition.season_count !== undefined && condition.season) {
    parts.push(`${SEASON_LABELS[condition.season] ?? condition.season}에 ${actType} ${condition.season_count}회 이상 완료`)
  }
  if (condition.temperature_min_c !== undefined) {
    parts.push(`활동 중 기온이 ${condition.temperature_min_c}°C 이상인 조건에서 ${actType} 완료`)
  }
  if (condition.temperature_max_c !== undefined) {
    parts.push(`활동 중 기온이 ${condition.temperature_max_c}°C 이하인 조건에서 ${actType} 완료`)
  }
  if (condition.time_range) {
    const { start, end } = condition.time_range
    const slot = timeSlotLabel(start)
    parts.push(`${slot ? `${slot} 시간대(${start}~${end})` : `${start}~${end} 시간대`}에 ${actType} 활동`)
  }
  if (condition.poi_id) {
    parts.push('지정된 장소를 직접 방문하여 위치 인증')
  }

  if (parts.length === 0) {
    return '관리자에 의해 특별 발급되는 배지입니다.'
  }

  // 서로 다른 활동에서 각각 달성해도 인정되는 속성 조건이 2개 이상이면 안내 추가
  const perActivityAttrs = [
    condition.min_speed_kmh,
    condition.duration_minutes,
    condition.elevation_gain_m,
    condition.temperature_min_c,
    condition.temperature_max_c,
  ].filter((v) => v !== undefined).length
  const crossAttrNote = perActivityAttrs >= 2
    ? ' (각 조건은 서로 다른 활동에서 달성해도 인정돼요)'
    : ''

  return parts.join(', ') + '하면 획득할 수 있습니다.' + crossAttrNote
}

interface BadgeDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ u?: string }>
}

export default async function BadgeDetailPage({ params, searchParams }: BadgeDetailPageProps) {
  const { id } = await params
  const { u } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // ?u=username — 다른 유저의 프로필/피드에서 진입한 경우 그 유저 기준으로 획득 정보를 보여준다
  // user_activity_badges는 RLS로 본인 행만 조회 가능해서, 다른 유저 조회는 service client 필요
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
  const isOwnBadge = subjectId === user.id

  const [{ data: badge }, { data: earnedRow }, { data: ownedBadgesRaw }] = await Promise.all([
    supabase.from('badges').select('*').eq('id', id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any)
      .from('user_activity_badges')
      .select('*, poi:triggered_by_poi_id(id, name, latitude, longitude)')
      .eq('user_id', subjectId)
      .eq('badge_id', id)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).from('user_activity_badges').select('badge_id').eq('user_id', subjectId),
  ])

  if (!badge) notFound()

  const badgeRow = badge as BadgeRow
  const earned = earnedRow as (UserActivityBadgeRow & { poi: PoiRow | null }) | null

  // 선행 배지 보유 여부 계산
  const prereqs = badgeRow.condition_json?.prerequisite_badge_names ?? []
  let prereqStatus: { name: string; owned: boolean }[] = []
  if (prereqs.length > 0) {
    const ownedBadgeIds = new Set((ownedBadgesRaw ?? []).map((b: { badge_id: string }) => b.badge_id))
    const { data: prereqBadgesRaw } = await supabase
      .from('badges')
      .select('id, name')
      .in('name', prereqs)
    const prereqBadges = (prereqBadgesRaw ?? []) as { id: string; name: string }[]
    prereqStatus = prereqs.map((name) => {
      const match = prereqBadges.find((b) => b.name === name)
      return { name, owned: match ? ownedBadgeIds.has(match.id) : false }
    })
  }

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
      <BackButton href={!isOwnBadge && subjectUsername ? `/${subjectUsername}` : undefined} />

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

      {/* 배지 설명 */}
      <p className="text-sm text-jam-ink/70 leading-relaxed font-semibold px-1">{badgeRow.description}</p>

      {/* 잼 포인트 안내 — 이 배지에 포인트가 붙어 있을 때만 */}
      {badgeRow.point_reward > 0 && (
        <div className="flex items-center gap-3 bg-jam-lime border-[3px] border-jam-ink rounded-2xl shadow-[3px_3px_0_0_#161616] px-4 py-3">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border-[2px] border-jam-ink font-black text-jam-ink shrink-0">P</span>
          <p className="text-sm font-black text-jam-ink">
            {earned
              ? `이 배지는 ${badgeRow.point_reward.toLocaleString('ko-KR')} 포인트를 함께 드렸어요`
              : `이 배지를 획득하면 ${badgeRow.point_reward.toLocaleString('ko-KR')} 포인트를 함께 드려요`}
          </p>
        </div>
      )}

      {/* 선행 배지 조건 (prerequisite) */}
      {prereqStatus.length > 0 && (
        <Card className={prereqStatus.some((p) => !p.owned) && !earned ? 'border-amber-500/40 bg-amber-500/5' : ''}>
          <h2 className="text-xs font-black text-jam-ink/40 uppercase tracking-wider mb-3">선행 배지 필요</h2>
          <p className="text-xs text-jam-ink/50 mb-3 font-semibold">아래 배지 중 하나를 먼저 획득해야 이 배지를 받을 수 있어요.</p>
          <div className="flex flex-col gap-2">
            {prereqStatus.map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className={p.owned ? 'text-green-500' : 'text-jam-ink/30'}>
                  {p.owned ? '✓' : '○'}
                </span>
                <span className={`text-sm font-bold ${p.owned ? 'text-jam-ink' : 'text-jam-ink/50'}`}>
                  {p.name}
                </span>
                {p.owned && <span className="text-xs text-green-500 font-semibold ml-auto">보유</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 획득 조건 */}
      <Card>
        <h2 className="text-xs font-black text-jam-ink/40 uppercase tracking-wider mb-2">획득 조건</h2>
        <p className="text-sm text-jam-ink/80 leading-relaxed font-semibold">
          {formatConditionText(badgeRow.condition_json)}
        </p>
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
