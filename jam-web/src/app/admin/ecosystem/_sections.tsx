/**
 * 생태계 상황판의 구역 (티켓 20261026_2027 3-1, PRD admin-boards §7)
 *
 * 구역마다 따로 읽고(`page.tsx`의 `Suspense`), 한 구역이 실패하면 그 구역만 안내 카드(`OpsSectionNotice`)가 된다. 원인은 서버 로그에만 남긴다.
 * 스냅샷(`loadEcosystemSnapshot`)은 던지지 않지만 방어로 감싸고, 한 번만 읽어 요약·목표 대비·지도 세 구역에 같이 넘긴다.
 * 정책 패널은 마디가 선택됐을 때만 설정값과 열린 개발 요청을 읽는다.
 */
import { EcosystemGoalRows } from '@/components/admin/ecosystem/EcosystemGoalRows'
import { EcosystemLoopMap } from '@/components/admin/ecosystem/EcosystemLoopMap'
import { EcosystemPolicyPanel } from '@/components/admin/ecosystem/EcosystemPolicyPanel'
import { EcosystemSummary } from '@/components/admin/ecosystem/EcosystemSummary'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { listDevRequests } from '@/lib/admin/devRequests/store'
import { loadEcosystemSnapshot } from '@/lib/admin/ecosystem/load'
import type { EcosystemNodeId, EcosystemSnapshot } from '@/lib/admin/ecosystem/types'
import { openRequestByPolicy, summaryOf } from '@/lib/admin/ecosystem/view'
import { loadPolicyLiveValues } from '@/lib/admin/policyDashboard/liveValues'
import { POLICIES_DATA } from '@/lib/admin/policyDashboard/policiesData'
import { createServiceClient } from '@/lib/supabase/server'

/** 구역별 조회 실패 제목. 받침에 따라 조사가 달라 문장으로 적는다 */
export const ECOSYSTEM_NOTICE_TITLES = {
  goal: '목표 대비를 불러오지 못했어요',
  map: '순환 지도를 불러오지 못했어요',
  policy: '정책을 불러오지 못했어요',
} as const

export type SnapshotRead = { ok: true; snapshot: EcosystemSnapshot } | { ok: false }

/** 스냅샷을 읽기 시작한다. 거절되지 않는다(실패는 `{ ok: false }`로 담는다) */
export async function startSnapshot(): Promise<SnapshotRead> {
  try {
    return { ok: true, snapshot: await loadEcosystemSnapshot(createServiceClient(), new Date()) }
  } catch (error) {
    console.error('[admin/ecosystem] 스냅샷 읽기 오류:', error)
    return { ok: false }
  }
}

/** 요약 줄. 스냅샷을 못 읽으면 목표 대비·지도 구역이 안내 카드를 보이므로 여기서는 아무것도 그리지 않는다 */
export async function SummarySection({ read }: { read: Promise<SnapshotRead> }) {
  const result = await read
  if (!result.ok) return null
  const { attention, errors } = summaryOf(result.snapshot)
  return <EcosystemSummary attention={attention} errors={errors} generatedAt={result.snapshot.generatedAt} />
}

export async function GoalSection({ read }: { read: Promise<SnapshotRead> }) {
  const result = await read
  if (!result.ok) return <OpsSectionNotice icon="ecosystem" title={ECOSYSTEM_NOTICE_TITLES.goal} />
  return <EcosystemGoalRows rows={result.snapshot.goalRows} />
}

export async function MapSection({ read, selected }: { read: Promise<SnapshotRead>; selected: EcosystemNodeId | null }) {
  const result = await read
  if (!result.ok) return <OpsSectionNotice icon="ecosystem" title={ECOSYSTEM_NOTICE_TITLES.map} />
  return <EcosystemLoopMap nodes={result.snapshot.nodes} selected={selected} />
}

export async function PolicySection({ node }: { node: EcosystemNodeId | null }) {
  let liveValues: Record<string, unknown> = {}
  let openRequests = openRequestByPolicy([])
  if (node !== null) {
    try {
      const [values, requests] = await Promise.all([
        loadPolicyLiveValues(),
        listDevRequests(createServiceClient(), { status: 'requested' }),
      ])
      liveValues = values
      openRequests = openRequestByPolicy(requests)
    } catch (error) {
      console.error('[admin/ecosystem] 정책 패널 읽기 오류:', error)
      return <OpsSectionNotice icon="ecosystem" title={ECOSYSTEM_NOTICE_TITLES.policy} />
    }
  }
  return <EcosystemPolicyPanel nodeId={node} policies={POLICIES_DATA} liveValues={liveValues} openRequests={openRequests} />
}
