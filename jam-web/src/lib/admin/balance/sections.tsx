/**
 * 밸런스 설정(`/admin/balance`)의 구역 레지스트리 (티켓 20261022_1132 1회, 운영 설정 `app/admin/ops-settings/sections.tsx` 선례).
 * **구역을 더하는 일은 구역 연결 객체(`lib/admin/balance/<구역>.ts`) 하나, 구역 본문 컴포넌트 하나, 이 배열 한 줄이다.**
 * 화면(`app/admin/balance/page.tsx`)과 구역 이동 링크(`OpsSettingsNav`)와 저장 라우트(`/api/admin/balance/[section]`)가 이 배열 하나를 읽는다.
 *
 * 지금 구역: 잼(`jam`, 7-1 1회), 동기화(`sync`)와 캡슐(`capsule`, 7-1 2회), 잠긴 아이템 배지(`locked`)와 컬렉션과 믹스(`collection`, 7-2 1회). 다음에 붙을 구역: 챕터(7-2 2회), 인벤토리(7-3) 등.
 */
import type { ReactElement } from 'react'
import { CapsuleSection } from '@/components/admin/balance/CapsuleSection'
import { CollectionSection } from '@/components/admin/balance/CollectionSection'
import { JamSection } from '@/components/admin/balance/JamSection'
import { LockedSection } from '@/components/admin/balance/LockedSection'
import { SyncSection } from '@/components/admin/balance/SyncSection'
import { CAPSULE_BINDING } from './capsule'
import { COLLECTION_BINDING } from './collection'
import { JAM_BINDING } from './jam'
import { LOCKED_BINDING } from './locked'
import { SYNC_BINDING } from './sync'
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
      '활동 시간 기반 잼 산정식(강도 배율 × 활동 시간)과 대량 획득 경보 기준을 설정해요.',
      '경보는 운영 알림 전용이며 자동으로 제재하지 않아요.',
    ],
    Body: JamSection,
  },
  {
    binding: SYNC_BINDING,
    label: '동기화',
    title: '동기화',
    description: [
      '동기화 시 지급되는 아이템 배지 확정 개수, 보너스 기회, 등급별 확률을 설정해요.',
      '설정값은 유저 확률 안내 페이지에 실시간 반영돼요.',
    ],
    Body: SyncSection,
  },
  {
    binding: CAPSULE_BINDING,
    label: '캡슐',
    title: '캡슐',
    description: [
      '캡슐 개봉 시 배지 개수·확률, Epic 보정 장치, 챕터별 충전 게이지 요구량을 설정해요.',
      '변경된 충전 게이지는 신규 생성되는 캡슐부터 적용돼요.',
    ],
    Body: CapsuleSection,
  },
  {
    binding: LOCKED_BINDING,
    label: '잠긴 아이템 배지',
    title: '잠긴 아이템 배지',
    description: [
      '잠긴 아이템 배지 해금에 필요한 등급별 최소 활동 요구량이에요.',
      '개별 배지에 요구량이 없을 때 기본값으로 쓰이며, 변경 후 신규 배지부터 적용돼요.',
    ],
    Body: LockedSection,
  },
  {
    binding: COLLECTION_BINDING,
    label: '컬렉션과 믹스',
    title: '컬렉션과 믹스',
    description: [
      '컬렉션 등급별 완성 보상 포인트와 믹스 실패 시 지급하는 포인트를 설정해요.',
      '저장 즉시 다음 컬렉션 완성과 믹스부터 적용돼요.',
    ],
    Body: CollectionSection,
  },
]

/** 구역 키로 구역을 찾는다. 없으면 `undefined`(저장 라우트가 404로 답한다). */
export function findBalanceSection(id: string): BalanceSectionDef | undefined {
  return BALANCE_SECTIONS.find((section) => section.binding.id === id)
}
