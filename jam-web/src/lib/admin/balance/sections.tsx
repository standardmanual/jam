/**
 * 밸런스 설정(`/admin/balance`)의 구역 레지스트리 (티켓 20261022_1132 1회, 운영 설정 `app/admin/ops-settings/sections.tsx` 선례).
 * **구역을 더하는 일은 구역 연결 객체(`lib/admin/balance/<구역>.ts`) 하나, 구역 본문 컴포넌트 하나, 이 배열 한 줄이다.**
 * 화면(`app/admin/balance/page.tsx`)과 구역 이동 링크(`OpsSettingsNav`)와 저장 라우트(`/api/admin/balance/[section]`)가 이 배열 하나를 읽는다.
 *
 * 지금 구역: 잼(`jam`, 7-1 1회), 동기화(`sync`)와 캡슐(`capsule`, 7-1 2회), 잠긴 아이템 배지(`locked`)와 컬렉션과 믹스(`collection`, 7-2 1회), 챕터(`chapter`, 7-2 2회), 인벤토리(`inventory`, 7-3 1회), 어뷰징(`abusing`, 7-3 2회). 다음에 붙을 구역: 시스템 드랍(7-3 3회) 등.
 */
import type { ReactElement } from 'react'
import { AbusingSection } from '@/components/admin/balance/AbusingSection'
import { CapsuleSection } from '@/components/admin/balance/CapsuleSection'
import { ChapterSection } from '@/components/admin/balance/ChapterSection'
import { CollectionSection } from '@/components/admin/balance/CollectionSection'
import { InventorySection } from '@/components/admin/balance/InventorySection'
import { JamSection } from '@/components/admin/balance/JamSection'
import { LockedSection } from '@/components/admin/balance/LockedSection'
import { SyncSection } from '@/components/admin/balance/SyncSection'
import { ABUSING_BINDING } from './abusing'
import { CAPSULE_BINDING } from './capsule'
import { CHAPTER_BINDING } from './chapter'
import { COLLECTION_BINDING } from './collection'
import { INVENTORY_BINDING } from './inventory'
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
  {
    binding: CHAPTER_BINDING,
    label: '챕터',
    title: '챕터',
    description: [
      '챕터에 오르는 데 필요한 누적 점수와, 활동마다 점수를 세는 방법(단위당 점수, 주간 상한, 상한을 넘은 점수를 세는 비율)이에요.',
      '챕터 1은 퀘스트를 마치면 얻어서 필요한 점수가 0이에요. 챕터 번호는 늘리거나 줄이지 않고 값만 바꾸며, 필요한 점수는 앞 챕터보다 커야 해요. 주간 상한이 0이면 상한이 없어요. 저장하면 다음에 쌓는 점수부터 바로 적용돼요.',
    ],
    Body: ChapterSection,
  },
  {
    binding: INVENTORY_BINDING,
    label: '인벤토리',
    title: '인벤토리',
    description: [
      '유저 한 명이 가질 수 있는 인벤토리의 최대 칸 수예요. 지금 있는 유저 전원과 앞으로 가입할 유저에게 모두 적용돼요.',
      '새 최대치보다 많은 아이템을 가진 유저가 있으면 저장되지 않아요.',
    ],
    Body: InventorySection,
  },
  {
    binding: ABUSING_BINDING,
    label: '어뷰징',
    title: '어뷰징',
    description: [
      '비정상 이동(GPS 조작)과 교통수단 구간을 가리는 속도·거리 기준, 종목과 움직임이 맞지 않는 활동의 기준, 차단한 장소의 블록 유지 시간이에요.',
      '저장 즉시 다음 동기화와 장소 픽업부터 적용돼요.',
    ],
    Body: AbusingSection,
  },
]

/** 구역 키로 구역을 찾는다. 없으면 `undefined`(저장 라우트가 404로 답한다). */
export function findBalanceSection(id: string): BalanceSectionDef | undefined {
  return BALANCE_SECTIONS.find((section) => section.binding.id === id)
}
