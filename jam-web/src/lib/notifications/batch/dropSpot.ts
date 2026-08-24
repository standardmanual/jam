/**
 * ③ #18 내 드랍 지점 활성 (티켓 20260825_002)
 * 스펙: PRD §3 ③, DATA_MODEL §2-1
 *
 * "다녀갔다"는 **누군가 그 POI를 열어서 확인한 것**이다(2026-08-24 확정). 픽업 여부와
 * 무관하고, **본인의 열람은 제외**한다 — 내가 내 드랍을 확인한 걸 세면 안 된다.
 *
 * ## 주 1회
 *
 * PRD §4 T2 표가 "주간 집계(주 1회만)"로 규정한다. 요일 게이트 대신
 * `drop_spot_active:{poi_id}:{KST주}` + `once`로 건다 — 집계 창이 "지난 7일 롤링"이라
 * 어느 요일에 돌아도 결과가 같고, cron 재시도·요일 누락에 흔들리지 않는다.
 */
import { scopedGroupKey } from '@/lib/notifications/groupKey'
import {
  DAY_MS,
  fetchAllRows,
  fetchAllRowsIn,
  kstDateOffset,
  kstWeekKey,
  type BatchContext,
  type NotificationDraft,
  type StepOutput,
} from './shared'

/** 집계 창 — 지난 7일(KST 날짜 기준) */
export const DROP_SPOT_WINDOW_DAYS = 7

export interface DropSpotInput {
  /** 내 활성 드랍이 있는 (드랍한 사람, POI) 쌍 */
  activeDrops: { dropperUserId: string; poiId: string }[]
  /** poi_id → 이름 */
  poiNames: Map<string, string>
  /** 지난 7일 POI 열람 기록 (poi_id → 열람한 유저 id 집합) */
  viewersByPoi: Map<string, Set<string>>
  /** group_key에 쓸 주 키 */
  weekKey: string
}

/**
 * #18 판정 (순수 함수 — 테스트 대상).
 *
 * **visitor_count가 0이면 만들지 않는다**(§3-3). 렌더러의 `num()`이 키 없음/0을 모두
 * 0으로 돌려 "0명이 다녀갔어요"가 그대로 나간다.
 */
export function selectDropSpotDrafts(input: DropSpotInput): NotificationDraft[] {
  const drafts: NotificationDraft[] = []
  const seen = new Set<string>()

  for (const drop of input.activeDrops) {
    const pairKey = `${drop.dropperUserId}:${drop.poiId}`
    if (seen.has(pairKey)) continue // 같은 POI에 여러 개 드랍했어도 소식은 1건
    seen.add(pairKey)

    const viewers = input.viewersByPoi.get(drop.poiId)
    if (!viewers) continue
    // 본인 열람 제외
    const visitorCount = viewers.has(drop.dropperUserId) ? viewers.size - 1 : viewers.size
    if (visitorCount <= 0) continue

    const poiName = input.poiNames.get(drop.poiId)
    if (!poiName) continue // 이름이 없으면 착지점 계산은 되지만 문구가 빈 슬롯이 된다

    drafts.push({
      userId: drop.dropperUserId,
      type: 'drop_spot_active',
      payload: { poi_id: drop.poiId, poi_name: poiName, visitor_count: visitorCount },
      groupKey: scopedGroupKey('drop_spot_active', drop.poiId, input.weekKey),
      mode: 'once',
    })
  }

  return drafts
}

/** `scanned`는 **활성 드랍 수**다. 드랍이 있는데 초안이 0이면 열람 집계나 POI 이름 매칭이 깨진 것 */
export async function buildDropSpotDrafts(ctx: BatchContext): Promise<StepOutput> {
  const { supabase, startedAt } = ctx

  const drops = await fetchAllRows<{ dropper_user_id: string | null; poi_id: string }>(
    'poi_drops(active)',
    'id',
    () =>
      supabase
        .from('poi_drops')
        .select('dropper_user_id, poi_id')
        .eq('is_available', true)
        .not('dropper_user_id', 'is', null)
  )

  const activeDrops = drops
    .filter((d): d is { dropper_user_id: string; poi_id: string } => Boolean(d.dropper_user_id))
    .map((d) => ({ dropperUserId: d.dropper_user_id, poiId: d.poi_id }))
  if (activeDrops.length === 0) return { drafts: [], scanned: 0 }

  const poiIds = [...new Set(activeDrops.map((d) => d.poiId))]

  // "KST 7일 전" — 반드시 kst.ts를 경유한다(§3-2). poi_views.viewed_on이 KST DATE라
  // UTC 기준으로 자르면 하루가 밀린다.
  const since = kstDateOffset(new Date(startedAt.getTime() - DROP_SPOT_WINDOW_DAYS * DAY_MS), 0)

  const [pois, views] = await Promise.all([
    fetchAllRowsIn<{ id: string; name: string }, string>('poi', 'id', poiIds, (chunk) =>
      supabase.from('poi').select('id, name').in('id', chunk)
    ),
    fetchAllRowsIn<{ poi_id: string; user_id: string }, string>('poi_views', 'id', poiIds, (chunk) =>
      supabase.from('poi_views').select('poi_id, user_id').in('poi_id', chunk).gte('viewed_on', since)
    ),
  ])

  const poiNames = new Map(pois.map((p) => [p.id, p.name]))
  const viewersByPoi = new Map<string, Set<string>>()
  for (const v of views) {
    const set = viewersByPoi.get(v.poi_id) ?? new Set<string>()
    set.add(v.user_id)
    viewersByPoi.set(v.poi_id, set)
  }

  return {
    drafts: selectDropSpotDrafts({
      activeDrops,
      poiNames,
      viewersByPoi,
      weekKey: kstWeekKey(startedAt),
    }),
    scanned: activeDrops.length,
  }
}
