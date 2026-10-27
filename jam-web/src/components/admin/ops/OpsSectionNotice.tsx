'use client'

import { useRouter } from 'next/navigation'
import {
  IconBell,
  IconBooks,
  IconCalendarWeek,
  IconChartBar,
  IconChartLine,
  IconDatabase,
  IconHistory,
  IconRecycle,
  IconShieldCheck,
} from '@tabler/icons-react'
import { NoticeCard } from './OpsRuleCardParts'
import type { OpsIcon } from './opsIcons'

/**
 * 운영 홈·일정표의 구역 안내 카드 (티켓 20261006_1340 ②-b, 채원 판정 「두 화면 공통 규칙」 구역 상태).
 *
 * `NoticeCard`(S7이 쓰는 안내 카드)를 감싼다. 서버 컴포넌트는 함수(아이콘 컴포넌트·새로 고침 동작)를 클라이언트 컴포넌트에 넘길 수 없어서,
 * 아이콘은 **키 문자열**로 받고 [새로 고치기]는 여기서 `router.refresh`로 만든다. 한 구역이 못 읽혀도 다른 구역은 그대로 보이게
 * 구역마다 따로 쓴다(③ 일정표도 같은 부품을 쓴다).
 *
 * 제목은 호출부가 문장으로 준다(「이번 주 상태를 불러오지 못했어요」처럼 받침에 따라 조사가 달라 여기서 만들지 않는다).
 * 설명을 안 주면 조회 실패 고정 문장이고, `retry={false}`면 [새로 고치기]를 그리지 않는다(빈 상태 안내 등).
 */

const ICONS = {
  week: IconCalendarWeek,
  signal: IconBell,
  history: IconHistory,
  // 티켓 20261006_1341 ②-c: 운영 홈의 나머지 구역(서비스 점검·주간 핵심 지표·배지 경제 흐름·통계). 주간 캘린더는 `week`를 쓴다.
  service: IconShieldCheck,
  kpi: IconChartBar,
  trend: IconChartLine,
  stats: IconDatabase,
  // 티켓 20261008_1400: 패턴 사전(S5)의 구역.
  patterns: IconBooks,
  // 티켓 20261026_2027 3-1: 생태계 상황판(`/admin/ecosystem`)의 구역.
  ecosystem: IconRecycle,
} as const satisfies Record<string, OpsIcon>

export type OpsSectionNoticeIcon = keyof typeof ICONS

const LOAD_FAILED_DESCRIPTION = '서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요'
const RETRY_LABEL = '새로 고치기'

interface OpsSectionNoticeProps {
  icon: OpsSectionNoticeIcon
  /** 예: 「이번 주 상태를 불러오지 못했어요」. */
  title: string
  description?: string
  /** [새로 고치기] 버튼을 그릴지. 기본은 그린다. */
  retry?: boolean
}

export function OpsSectionNotice({ icon, title, description = LOAD_FAILED_DESCRIPTION, retry = true }: OpsSectionNoticeProps) {
  const router = useRouter()
  return (
    <NoticeCard
      Icon={ICONS[icon]}
      title={title}
      description={description}
      onRetry={retry ? { label: RETRY_LABEL, run: () => router.refresh() } : undefined}
    />
  )
}
