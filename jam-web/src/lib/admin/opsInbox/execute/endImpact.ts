/**
 * 「지금 종료」 확인창이 보이는 영향 유저 수 세기 (티켓 20261006_0950, 상위 20260930_1500 ⑪-a 가정 11) — **서버 전용**이다. 규칙의 정본은 `docs/service/prd/ops-tool/PRD.md` §8.7이다.
 *
 * 쓰기 없음. 센 도중 오류는 던진다 — 부르는 쪽(`end.ts`의 미리 보기)이 잡아 `impact: null`로 두고 미리 보기는 막지 않는다.
 * - 미션: 참가자 수(`user_mission_participations`)와 진행 중 유저 수(참가 − 완료, `user_mission_completions`). 미션 일괄 처리의 미리 보기(`api/admin/missions/bulk`)와 같은 세기다.
 * - 컬렉션: 채우는 중 유저 수 = 칸에 아이템 배지를 넣은 유저(`user_item_book_slots`, 같은 유저의 여러 칸은 한 명) 가운데 완성하지 않은 유저(`user_item_book_completions`).
 *   체크인 배지 획득 이력은 세지 않는다(운영툴 컬렉션은 아이템 배지로 채운다). 그래서 화면 문구는 「약 N명」이다.
 */
import { countRowsByKey, type CountRowsClient } from '@/lib/admin/list-counts'
import { sumInProgressUsers } from '@/lib/admin/mission-bulk'
import { fetchAllRows } from '@/lib/db/fetchAllRows'
import type { ExecuteServiceClient } from './handlers'

export interface MissionImpact {
  /** 참가한 유저 수. */
  participants: number
  /** 참가했지만 아직 끝내지 못한 유저 수. */
  inProgressUsers: number
}

/** 미션의 참가자 수와 진행 중 유저 수. 어느 표든 못 읽으면 던진다. */
export async function countMissionImpact(service: ExecuteServiceClient, missionId: string): Promise<MissionImpact> {
  const client = service as unknown as CountRowsClient
  const [participations, completions] = await Promise.all([
    countRowsByKey(client, 'user_mission_participations', 'mission_id', [missionId]),
    countRowsByKey(client, 'user_mission_completions', 'mission_id', [missionId]),
  ])
  return {
    participants: participations[missionId] ?? 0,
    inProgressUsers: sumInProgressUsers([missionId], participations, completions),
  }
}

/** 컬렉션을 채우는 중인 유저 수(완성한 유저 제외). 어느 표든 못 읽으면 던진다. */
export async function countCollectionFillingUsers(service: ExecuteServiceClient, itemBookId: string): Promise<number> {
  const slots = await fetchAllRows<{ id: string; user_id: string }>('컬렉션 칸', 'id', () =>
    service.from('user_item_book_slots').select('id, user_id').eq('item_book_id', itemBookId)
  )
  const completed = await fetchAllRows<{ user_id: string }>('컬렉션 완성', 'user_id', () =>
    service.from('user_item_book_completions').select('user_id').eq('item_book_id', itemBookId)
  )
  const completedUsers = new Set(completed.map((row) => row.user_id))
  const filling = new Set(slots.map((row) => row.user_id).filter((userId) => !completedUsers.has(userId)))
  return filling.size
}
