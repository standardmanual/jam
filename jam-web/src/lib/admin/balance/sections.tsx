/**
 * 밸런스 설정(`/admin/balance`)의 구역 레지스트리 (티켓 20261022_1132 1회, 운영 설정 `app/admin/ops-settings/sections.tsx` 선례).
 * **구역을 더하는 일은 구역 연결 객체(`lib/admin/balance/<구역>.ts`) 하나, 구역 본문 컴포넌트 하나, 이 배열 한 줄이다.**
 * 화면(`app/admin/balance/page.tsx`)과 구역 이동 링크(`OpsSettingsNav`)와 저장 라우트(`/api/admin/balance/[section]`)가 이 배열 하나를 읽는다.
 *
 * 지금 구역: 잼(`jam`, 7-1 1회). 다음에 붙을 구역: 동기화·캡슐(7-1 2회), 잠긴 아이템 배지·인벤토리(7-2·7-3) 등.
 */
import type { ReactElement } from 'react'
import { JamSection } from '@/components/admin/balance/JamSection'
import { JAM_BINDING } from './jam'
import type { BalanceSectionBinding } from './types'

export interface BalanceSectionDef {
  /** 구역 연결(칸 정의, 읽기, 쓰기). 구역 키(앵커 ID·저장 경로·이력의 `section_key`)는 `binding.id`다. */
  binding: BalanceSectionBinding
  /** 구역 이동 링크의 글자. */
  label: string
  /** 구역 제목(h2). */
  title: string
  /** 제목 아래 설명 문단들. */
  description: readonly string[]
  /** 구역 본문(서버 컴포넌트, 자기 데이터를 읽는다). 페이지가 `Suspense`로 감싼다. */
  Body: () => Promise<ReactElement> | ReactElement
}

export const BALANCE_SECTIONS: readonly BalanceSectionDef[] = [
  {
    binding: JAM_BINDING,
    label: '잼',
    title: '잼',
    description: [
      '움직인 시간으로 잼을 계산할 때 쓰는 강도 배율과, 한 번에 많은 잼을 받은 유저를 운영툴에 알리는 경보 기준이에요.',
      '잼 = 강도 배율 × 움직인 시간(분, 내림)이에요. 경보는 알리기만 하고 자동으로 제재하지 않아요.',
    ],
    Body: JamSection,
  },
]

/** 구역 키로 구역을 찾는다. 없으면 `undefined`(저장 라우트가 404로 답한다). */
export function findBalanceSection(id: string): BalanceSectionDef | undefined {
  return BALANCE_SECTIONS.find((section) => section.binding.id === id)
}
