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
      '움직인 시간으로 잼을 계산할 때 쓰는 강도 배율과, 한 번에 많은 잼을 받은 유저를 운영툴에 알리는 경보 기준이에요.',
      '잼 = 강도 배율 × 움직인 시간(분, 내림)이에요. 경보는 알리기만 하고 자동으로 제재하지 않아요.',
    ],
    Body: JamSection,
  },
  {
    binding: SYNC_BINDING,
    label: '동기화',
    title: '동기화',
    description: [
      '활동을 동기화할 때 받는 아이템 배지의 확정 개수와 보너스, 등급 확률이에요. 아래 «캡슐과 함께 쓰는 값»은 캡슐 구역에서도 같은 값을 써요.',
      '확정 개수와 보너스 기회를 모두 0으로 둘 수 있어요. 그러면 동기화로는 아이템 배지가 나오지 않아요. 여기 칸은 모두 확률 안내 페이지에 반영되므로 저장하기 전에 한 번 더 확인해요.',
    ],
    Body: SyncSection,
  },
  {
    binding: CAPSULE_BINDING,
    label: '캡슐',
    title: '캡슐',
    description: [
      '캡슐을 열 때 나오는 아이템 배지의 개수와 확률, 등급 확률, Epic 보정, 퀘스트 전 값, 챕터별로 채울 양이에요.',
      '챕터 번호는 늘리거나 줄이지 않고 값만 바꿔요. 이미 만들어진 캡슐이 채울 양은 그대로이고 바꾼 값은 앞으로 만들어지는 캡슐부터 적용돼요. 확률 안내 페이지에 반영되는 칸을 바꾸면 저장하기 전에 한 번 더 확인해요.',
    ],
    Body: CapsuleSection,
  },
  {
    binding: LOCKED_BINDING,
    label: '잠긴 아이템 배지',
    title: '잠긴 아이템 배지',
    description: [
      '잠긴 아이템 배지를 여는 데 필요한 양의 등급별 최소값이에요. 아이템 배지에 필요한 양을 따로 정하지 않았을 때 이 값을 써요.',
      '1 이상의 정수로 써요. 등급 사이의 순서는 따로 검사하지 않아요. 바꾼 값은 앞으로 잠기는 아이템 배지부터 적용돼요.',
    ],
    Body: LockedSection,
  },
  {
    binding: COLLECTION_BINDING,
    label: '컬렉션과 믹스',
    title: '컬렉션과 믹스',
    description: [
      '컬렉션을 등급별로 완성했을 때 주는 기본 포인트와, 믹스에 실패했을 때 주는 포인트예요.',
      '0 이상의 정수로 써요. 저장하면 다음 완성과 다음 믹스부터 바로 적용돼요.',
    ],
    Body: CollectionSection,
  },
]

/** 구역 키로 구역을 찾는다. 없으면 `undefined`(저장 라우트가 404로 답한다). */
export function findBalanceSection(id: string): BalanceSectionDef | undefined {
  return BALANCE_SECTIONS.find((section) => section.binding.id === id)
}
