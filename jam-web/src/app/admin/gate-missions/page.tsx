/**
 * 게이트 미션 관리 — 매트릭스 · 구조화 입력 · 노출 미리보기 · 정합성 검사
 * (티켓 20260905_0033)
 *
 * v5는 「종목당 8개 × 5종목 = 미션 40개」가 Mystic·Lv.8+를 여는 열쇠가 된다. 기간형 이벤트
 * 미션과 데이터 모델·운영 리듬이 완전히 달라 같은 화면에서 관리하면 실수가 난다 —
 * 기존 미션 화면(`/admin/missions`)에는 축 컬럼도, 게이트 배지 필터도, 노출 조건 입력도 없다.
 *
 * 판정·검사는 전부 순수 함수(`src/lib/missions/gateMissions.ts`)에 있고 이 화면은 그리기만
 * 한다 — 화면이 자기만의 판정을 갖는 순간 서비스와 어긋난다.
 */
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { MissionRow } from '@/types/database'
import { fetchActivityFamilyBadges } from '@/lib/admin/badge-families-query'
import { groupBadgesIntoFamilies } from '@/lib/admin/badge-families'
import {
  buildGateMatrix,
  checkGateMissionConsistency,
  isGateMission,
  isLegacyGateMission,
  type GateMissionBadge,
} from '@/lib/missions/gateMissions'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import GateMissionManager, { type GateFamilyOption } from './GateMissionManager'
import GateMissionPreview from './GateMissionPreview'
import GateConsistencyPanel from './GateConsistencyPanel'
import type { BadgeSearchResult } from '@/components/admin/BadgeSearchSelect'

/** 정합성 검사·보상 배지 표시에 필요한 컬럼 (소프트삭제된 배지도 가져와야 «삭제됨»을 구분한다) */
const REFERENCED_BADGE_COLUMNS =
  'id, name, rarity, level, family_key, deleted_at, condition_json, activity_types, type, point_reward'

type ReferencedBadgeRow = GateMissionBadge & { type: string; point_reward: number }

export default async function AdminGateMissionsPage() {
  const supabase = createServiceClient()

  const [{ data: missionsRaw, error: missionsError }, familyResult] = await Promise.all([
    supabase.from('missions').select('*').order('created_at', { ascending: false }),
    fetchActivityFamilyBadges(),
  ])

  const missions = (missionsRaw ?? []) as MissionRow[]
  const gateMissions = missions.filter(isGateMission)
  const legacyMissions = missions.filter(isLegacyGateMission)

  // 미션이 참조하는 배지만 bounded로 조회한다(전량 프리로드 금지 — 배지가 수천 건 규모다)
  const referencedIds = [
    ...new Set(
      [...gateMissions, ...legacyMissions]
        .flatMap((m) => [...(m.reward_badge_ids ?? []), m.gated_badge_id])
        .filter((id): id is string => !!id)
    ),
  ]
  const { data: referencedRaw } = referencedIds.length > 0
    ? await supabase.from('badges').select(REFERENCED_BADGE_COLUMNS).in('id', referencedIds)
    : { data: [] }
  const referencedRows = (referencedRaw ?? []) as unknown as ReferencedBadgeRow[]
  const referencedBadges = new Map<string, GateMissionBadge>(referencedRows.map((b) => [b.id, b]))

  const matrix = buildGateMatrix(gateMissions)
  const issues = checkGateMissionConsistency({
    missions,
    activityBadges: familyResult.badges,
    referencedBadges,
  })

  // 노출 조건 입력에 쓸 계열 목록 — **계열 키가 발급된 계열만** 고를 수 있다.
  // 키가 없는 계열은 교차 게이트·노출 조건의 대상이 될 수 없다(계열 관리 화면이 같은 경고를 쓴다).
  const families: GateFamilyOption[] = groupBadgesIntoFamilies(familyResult.badges)
    .filter((f) => !!f.familyKey)
    .map((f) => ({
      familyKey: f.familyKey as string,
      name: f.name,
      activityType: f.activityType,
      kind: f.kind,
      topLabel: f.topLabel,
    }))

  // 이미 미션에 연결된 보상 배지의 표시용 라벨 (신규 선택은 검색 API가 채운다)
  const rewardBadgeLabels: BadgeSearchResult[] = referencedRows.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    rarity: b.rarity ?? (b.level != null ? `Lv.${b.level}` : '등급없음'),
    point_reward: b.point_reward ?? 0,
  }))

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">게이트 미션 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          축을 여는 미션을 축 × 단계 격자로 관리해요. 기간형 이벤트 미션은{' '}
          <Link href="/admin/missions" className="underline underline-offset-4">
            미션 관리
          </Link>
          에서 다뤄요.
        </p>
      </div>

      {missionsError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          미션을 불러오지 못했어요. 목록이 비어 보일 수 있어요 — {missionsError.message}
        </div>
      )}
      {familyResult.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          배지 계열을 불러오지 못했어요. 정합성 검사 결과가 정확하지 않을 수 있어요 — {familyResult.error}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        게이트 미션 {gateMissions.length}개 · 축 {matrix.length}개 (두 단계가 다 채워진 축{' '}
        {matrix.filter((r) => r.complete).length}개)
        {legacyMissions.length > 0 && (
          <span className="ml-2 text-amber-700">· 폐기 대상(예전 방식) {legacyMissions.length}개</span>
        )}
      </div>

      <GateConsistencyPanel issues={issues} />

      <GateMissionManager
        missions={[...gateMissions, ...legacyMissions]}
        families={families}
        rewardBadgeLabels={rewardBadgeLabels}
        activityTypeLabels={ACTIVITY_TYPE_LABELS}
      />

      <GateMissionPreview />
    </div>
  )
}
