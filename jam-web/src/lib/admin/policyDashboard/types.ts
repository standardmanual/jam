/**
 * 서비스 운영 정책 대시보드 타입 정의 (티켓 20261022_1631)
 */

export type PolicyType =
  | 'db_editable' // 어드민 DB 즉시 수정 가능
  | 'code_constant' // 엔진/코드 고정 상수
  | 'ticket_decision' // JAM 2.0 티켓 세부 결정
  | 'pre_launch_pending' // 오픈 전 적용 대기

export interface PolicyEditableConfig {
  target: 'abusing_policy' | 'jam_policy' | 'combine_policy' | 'inventory_policy' | 'ambient_drop_config'
  field: string
  label: string
  unit?: string
  valueType: 'number' | 'integer' | 'boolean'
  min?: number
  max?: number
  step?: number
  relatedAdminUrl?: string
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
  editableConfig?: PolicyEditableConfig
}

export interface ChapterSummary {
  chapter: number
  title: string
  totalCount: number
  dbEditableCount: number
  codeConstantCount: number
  ticketDecisionCount: number
  preLaunchPendingCount: number
}

export interface PolicyDashboardData {
  policies: PolicyItem[]
  liveValues: Record<string, unknown>
  updatedAt: string
}
