/**
 * 미션 트라이브 접근 판정 — 티켓 20261019_1311 (운영 로직 13.2절)
 *
 * 미션에는 «참가할 수 있는 트라이브»를 정해 둘 수 있다(`mission_allowed_tribes`, 미션 하나에 트라이브마다 한 행).
 * 행이 없으면 모든 유저가 참가하는 공통 미션이고, 행이 있으면 그 트라이브의 유저만 보고 참가한다.
 *
 * 판정 규칙만 둔 순수 함수 파일이다(Supabase 의존 없음) — 목록·상세·참가·순위가 같은 규칙을 쓴다.
 * 판정에 필요한 데이터(유저 트라이브, 미션별 허용 목록)를 읽는 `loadMissionTribeAccess`는
 * `visibility-server.ts`에 있다(`visibility.ts`가 이 파일을 가져오므로 서버 모듈을 끌어오지 않게 나눴다).
 */
export interface MissionTribeAccess {
  /** 유저의 트라이브. 온보딩 전이면 null */
  userTribeId: string | null
  /** 미션 id → 참가할 수 있는 트라이브 id 목록. 키가 없으면 제한 없는 공통 미션 */
  allowedTribeIdsByMission: ReadonlyMap<string, readonly string[]>
}

/**
 * 이 트라이브의 유저에게 미션이 열려 있는가.
 *
 * - 허용 목록이 없거나 비어 있으면 공통 미션이라 모두에게 열려 있다
 * - 목록이 있으면 유저 트라이브가 들어 있을 때만 열려 있다. 트라이브가 아직 없는 유저(온보딩 전)는 공통 미션만 본다
 */
export function isMissionOpenToTribe(
  allowedTribeIds: readonly string[] | null | undefined,
  userTribeId: string | null | undefined,
): boolean {
  if (!allowedTribeIds || allowedTribeIds.length === 0) return true
  if (!userTribeId) return false
  return allowedTribeIds.includes(userTribeId)
}

/** `loadMissionTribeAccess`가 돌려준 값으로 미션 하나의 접근을 판정한다 */
export function isMissionOpenToUser(access: MissionTribeAccess, missionId: string): boolean {
  return isMissionOpenToTribe(access.allowedTribeIdsByMission.get(missionId), access.userTribeId)
}
