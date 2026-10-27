/**
 * 개발·배포 상황판의 구역 (티켓 20261026_2028 3회차, PRD admin-boards §8)
 *
 * 스냅샷(`loadDevBoard`)은 한 번만 읽어 모든 구역이 같은 약속을 기다린다. `loadDevBoard`는 던지지 않지만 방어로 감싸고,
 * 실패하면 구역마다 안내 카드(`OpsSectionNotice`)가 된다. 원인은 서버 로그에만 남긴다.
 * 읽기 일부가 실패한 것은 읽기 안내 줄(`ReadNotices`)과 구역 안의 표시가 말하고, staging 색인을 못 읽으면 묶음·보드 자리가 안내 카드다.
 * 이 화면은 읽기만 한다(개발 요청 버튼 없음). 캐시하지 않는다.
 */
import { BoardColumns } from '@/components/admin/devBoard/BoardColumns'
import { BundleProgressList } from '@/components/admin/devBoard/BundleProgressList'
import { DeployStatusCards } from '@/components/admin/devBoard/DeployStatusCards'
import { ReadNotices } from '@/components/admin/devBoard/ReadNotices'
import { OpsSectionNotice } from '@/components/admin/ops/OpsSectionNotice'
import { getDefaultGithubReader } from '@/lib/admin/devBoard/github'
import { loadDevBoard } from '@/lib/admin/devBoard/load'
import { listBoardRequests } from '@/lib/admin/devBoard/requests'
import type { DevBoardSnapshot } from '@/lib/admin/devBoard/types'
import { indexUnavailableDescription, noticesOf } from '@/lib/admin/devBoard/view'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import { createServiceClient } from '@/lib/supabase/server'

/** 구역별 조회 실패 제목. 받침에 따라 조사가 달라 문장으로 적는다 */
export const DEV_BOARD_NOTICE_TITLES = {
  deploy: '배포 현황을 불러오지 못했어요',
  bundles: '묶음 진행을 불러오지 못했어요',
  board: '개발 항목 보드를 불러오지 못했어요',
} as const

export type DevBoardRead = { ok: true; snapshot: DevBoardSnapshot } | { ok: false }

/** 스냅샷을 읽기 시작한다. 거절되지 않는다(실패는 `{ ok: false }`로 담는다) */
export async function startDevBoard(): Promise<DevBoardRead> {
  try {
    const snapshot = await loadDevBoard(
      { reader: getDefaultGithubReader(), listRequests: () => listBoardRequests(createServiceClient()) },
      new Date()
    )
    return { ok: true, snapshot }
  } catch (error) {
    console.error('[admin/dev-board] 스냅샷 읽기 오류:', error)
    return { ok: false }
  }
}

/** 머리의 기준 시각. 스냅샷을 못 읽으면 아무것도 그리지 않는다(구역마다 안내 카드가 있다) */
export async function AsOfSection({ read }: { read: Promise<DevBoardRead> }) {
  const result = await read
  if (!result.ok) return null
  return (
    <p data-testid="dev-board-as-of" className="text-xs text-muted-foreground break-keep wrap-break-word">
      {formatKstYmdHm(result.snapshot.generatedAt)} 기준
    </p>
  )
}

/** 읽기 안내 줄. 문제가 없거나 스냅샷을 못 읽었으면 그리지 않는다 */
export async function NoticesSection({ read }: { read: Promise<DevBoardRead> }) {
  const result = await read
  if (!result.ok) return null
  return <ReadNotices notices={noticesOf(result.snapshot)} />
}

export async function DeploySection({ read }: { read: Promise<DevBoardRead> }) {
  const result = await read
  if (!result.ok) return <OpsSectionNotice icon="devboard" title={DEV_BOARD_NOTICE_TITLES.deploy} />
  return <DeployStatusCards deploy={result.snapshot.deploy} />
}

export async function BundleSection({ read }: { read: Promise<DevBoardRead> }) {
  const result = await read
  if (!result.ok) return <OpsSectionNotice icon="devboard" title={DEV_BOARD_NOTICE_TITLES.bundles} />
  const state = result.snapshot.sources.stagingIndex
  if (state !== 'ok') {
    return <OpsSectionNotice icon="devboard" title={DEV_BOARD_NOTICE_TITLES.bundles} description={indexUnavailableDescription(state)} />
  }
  return <BundleProgressList bundles={result.snapshot.bundles} />
}

export async function BoardSection({ read }: { read: Promise<DevBoardRead> }) {
  const result = await read
  if (!result.ok) return <OpsSectionNotice icon="devboard" title={DEV_BOARD_NOTICE_TITLES.board} />
  const { snapshot } = result
  if (snapshot.sources.stagingIndex !== 'ok') {
    return (
      <OpsSectionNotice
        icon="devboard"
        title={DEV_BOARD_NOTICE_TITLES.board}
        description={indexUnavailableDescription(snapshot.sources.stagingIndex)}
      />
    )
  }
  return (
    <BoardColumns
      columns={snapshot.columns}
      estimatedDeployed={snapshot.estimatedDeployed}
      undatedClosed={snapshot.undatedClosed}
    />
  )
}
