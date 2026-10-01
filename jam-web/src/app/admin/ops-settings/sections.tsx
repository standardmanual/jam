/**
 * 운영 설정(S7)의 구역 목록 (티켓 20260930_1459 조각 B, 채원 확정 설계). **구역을 더하는 일은 이 배열 한 줄과 구역 본문 컴포넌트 하나다.**
 * 구역 이동 링크(`OpsSettingsNav`)와 페이지가 이 배열 하나를 읽는다. 지금 구역: 밸런스 규칙(`balance`, 1459 조각 B), 신호 기준값(`signals`, 1459 조각 C).
 * 다음에 붙을 구역: 슬랙 알림 대상·제출 토큰 상태(`slack`, 20261001_1221).
 */
import type { ReactElement } from 'react'
import { BALANCE_SECTION_DESCRIPTION, BALANCE_SECTION_TITLE } from '@/lib/admin/opsInbox/balance/settings'
import { SIGNAL_SECTION_DESCRIPTION, SIGNAL_SECTION_ID, SIGNAL_SECTION_TITLE } from '@/lib/admin/opsSignals/thresholdSettings'
import { BalanceSection } from './BalanceSection'
import { SignalSection } from './SignalSection'

export interface OpsSettingsSectionDef {
  /** 구역 앵커 ID. */
  id: string
  /** 구역 이동 링크의 글자. */
  label: string
  /** 구역 제목(h2). */
  title: string
  /** 제목 아래 설명 문단들. */
  description: readonly string[]
  /** 구역 본문(서버 컴포넌트, 자기 데이터를 읽는다). 페이지가 `Suspense`로 감싼다. */
  Body: () => Promise<ReactElement> | ReactElement
}

export const OPS_SETTINGS_SECTIONS: readonly OpsSettingsSectionDef[] = [
  { id: 'balance', label: BALANCE_SECTION_TITLE, title: BALANCE_SECTION_TITLE, description: BALANCE_SECTION_DESCRIPTION, Body: BalanceSection },
  { id: SIGNAL_SECTION_ID, label: SIGNAL_SECTION_TITLE, title: SIGNAL_SECTION_TITLE, description: SIGNAL_SECTION_DESCRIPTION, Body: SignalSection },
]
