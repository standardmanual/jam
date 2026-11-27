/**
 * 미션 현황 화면이 `/api/missions/[id]/status`에서 받는 응답 모양 (티켓 20261127_1145에서 `MissionStatusClient.tsx`에서 옮겼다).
 * 응답 계약은 바꾸지 않았다.
 */
export interface RankingEntry {
  userId: string
  /** 표시용 이름 — display_name 우선, 없으면 username, 그마저 없으면 '익명' (라우팅 불가) */
  displayName: string
  /** 라우팅용 원본 users.username 컬럼값 — 탈퇴 등으로 유저 레코드가 없으면 null */
  username: string | null
  avatarUrl: string | null
  progressValue: number
  isCompleted: boolean
  completedAt: string | null
  rank: number
}

export interface AchievementEntry {
  userId: string
  /** 표시용 이름 — display_name 우선, 없으면 username, 그마저 없으면 '익명' (라우팅 불가) */
  displayName: string
  /** 라우팅용 원본 users.username 컬럼값 — 탈퇴 등으로 유저 레코드가 없으면 null */
  username: string | null
  avatarUrl: string | null
  achieved: boolean
  achievedAt: string | null
}

export type StatusResponse =
  | { type: 'ranking'; entries: RankingEntry[]; me: RankingEntry | null; totalParticipants: number }
  | { type: 'achievement'; entries: AchievementEntry[]; me: AchievementEntry | null; totalParticipants: number }
