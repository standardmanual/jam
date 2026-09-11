import { createServiceClient } from '@/lib/supabase/server'
import { fetchActivityFamilyBadges } from '@/lib/admin/badge-families-query'
import { groupBadgesIntoFamilies } from '@/lib/admin/badge-families'
import { buildGateMatrix, isGateMission, type GateMissionBadge } from '@/lib/missions/gateMissions'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import type { MissionRow } from '@/types/database'
import type { BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'
import type { GateFamilyOption } from './GateMissionManager'

/** 정합성 검사·보상 배지 표시에 필요한 컬럼 (소프트삭제된 배지도 가져와야 «삭제됨»을 구분한다) */
const REFERENCED_BADGE_COLUMNS =
  'id, name, rarity, level, family_key, deleted_at, condition_json, activity_types, type, point_reward'

type ReferencedBadgeRow = GateMissionBadge & { type: string; point_reward: number }

/**
 * `GateMissionForm.tsx`가 필요로 하는 서버 조회 데이터 — 목록 페이지(`page.tsx`)의 조회 로직 중
 * 폼 전용 부분을 그대로 옮겨왔다(티켓 20260911_2035, 폼이 `new`/`[id]` 페이지로 분리되면서).
 */
export async function loadGateMissionFormData() {
  const supabase = createServiceClient()

  const [{ data: missionsRaw }, familyResult] = await Promise.all([
    supabase.from('missions').select('*').order('created_at', { ascending: false }),
    fetchActivityFamilyBadges(),
  ])
  const missions = (missionsRaw ?? []) as MissionRow[]
  const gateMissions = missions.filter(isGateMission)

  // 「축 선택」 드롭다운에 쓸 기존 축 목록
  const existingAxes = buildGateMatrix(gateMissions).map((r) => r.axis)

  // 미션이 참조하는 배지만 bounded로 조회한다(전량 프리로드 금지 — 배지가 수천 건 규모다)
  const referencedIds = [
    ...new Set(
      gateMissions.flatMap((m) => [...(m.reward_badge_ids ?? []), m.gated_badge_id]).filter((id): id is string => !!id)
    ),
  ]
  const { data: referencedRaw } = referencedIds.length > 0
    ? await supabase.from('badges').select(REFERENCED_BADGE_COLUMNS).in('id', referencedIds)
    : { data: [] }
  const referencedRows = (referencedRaw ?? []) as unknown as ReferencedBadgeRow[]

  // 노출 조건 입력에 쓸 계열 목록 — **계열 키가 발급된 계열만** 고를 수 있다.
  // 키가 없는 계열은 교차 게이트·노출 조건의 대상이 될 수 없다(계열 관리 화면이 같은 경고를 쓴다).
  //
  // ⚠️ JAM! 카테고리(admin_category='jam')는 예외다(티켓 20260910_2055) — family_key를
  // 발급하지 않는다(활동 종목이 없어 `buildFamilyKey`의 전제인 activityType이 없다). 대신
  // `familyKeyOf()`의 `#name:` 폴백 키를 그대로 쓴다 — `loadOwnedFamilyTiers`
  // (`visibility-server.ts`)가 이미 이 폴백 키를 `family_key IS NULL` + 이름 매칭으로
  // 평가하므로, 일반 계열과 같은 방식으로 게이트 대상이 될 수 있다.
  const families: GateFamilyOption[] = groupBadgesIntoFamilies(familyResult.badges)
    .filter((f) => !!f.familyKey || f.adminCategory === 'jam')
    .map((f) => ({
      familyKey: (f.familyKey ?? f.key) as string,
      name: f.name,
      activityType: f.activityType,
      kind: f.kind,
      topLabel: f.topLabel,
      adminCategory: f.adminCategory,
    }))

  // 이미 미션에 연결된 보상 배지의 표시용 라벨 (신규 선택은 검색 API가 채운다)
  const rewardBadgeLabels: BadgeSearchResult[] = referencedRows.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    rarity: b.rarity ?? (b.level != null ? `Lv.${b.level}` : '등급없음'),
    point_reward: b.point_reward ?? 0,
  }))

  return { families, rewardBadgeLabels, activityTypeLabels: ACTIVITY_TYPE_LABELS, existingAxes }
}
