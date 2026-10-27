/**
 * 서비스 운영 정책 대시보드 타입 정의 (티켓 20261022_1631, 저장 경로 제거 티켓 20261022_1717)
 */
import type { EcosystemNodeId } from '@/lib/admin/ecosystem/types'

export type PolicyType =
  | 'admin_link' // 어드민 설정 화면에서 값을 바꾸는 정책 (대시보드는 값을 읽어 보여 주고 링크만 둔다)
  | 'code_constant' // 엔진/코드 고정 상수
  | 'ticket_decision' // JAM 2.0 티켓 세부 결정
  | 'pre_launch_pending' // 오픈 전 적용 대기

/**
 * 값을 바꾸는 화면으로 가는 링크. 대시보드는 값을 직접 저장하지 않는다 —
 * 변경 이력·동시 수정 검사·확률 확인창은 설정 화면이 지킨다.
 */
export interface PolicyAdminLink {
  /** `/admin/balance#<구역 키>`. 설정 화면은 밸런스 설정 하나뿐이다(7-3 3회에서 시스템 드랍이 마지막으로 옮겨 왔다). */
  href: string
  /** 카드에 «현재 DB 실측값»으로 읽어 보여 줄 칸 이름(`liveValues`의 키). 칸이 여럿이면 비운다. */
  liveField?: string
  /** `liveField` 값 뒤에 붙일 단위 */
  unit?: string
}

export interface PolicyItem {
  id: string
  chapter: number
  chapterTitle: string
  title: string
  type: PolicyType
  currentSpec: string
  defaultValue?: string | number
  dbTable?: string
  dbColumn?: string
  codeLocation?: string
  userExperience: string
  basisDoc: string
  ticketId?: string
  adminLink?: PolicyAdminLink
  /** 이 정책이 걸린 생태계 순환 마디(티켓 20261026_2027). 마디가 없는 정책은 비운다 */
  nodes?: readonly EcosystemNodeId[]
}

export interface ChapterSummary {
  chapter: number
  title: string
  totalCount: number
  adminLinkCount: number
  codeConstantCount: number
  ticketDecisionCount: number
  preLaunchPendingCount: number
}

export interface PolicyDashboardData {
  policies: PolicyItem[]
  liveValues: Record<string, unknown>
  updatedAt: string
}
