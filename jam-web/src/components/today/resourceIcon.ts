import { createElement, type ComponentType, type ReactElement, type SVGProps } from 'react'
import {
  BookIcon,
  FlaskIcon,
  HourglassIcon,
  MedalIcon,
  NewspaperIcon,
  PackageIcon,
  PinIcon,
  RankingIcon,
  TargetIcon,
} from '@/components/ui/icons'
import type { CardResource, CardView } from '@/lib/today/cardView'

/**
 * 자원 → 아이콘 (티켓 20261001_1737, 상위 20260930_1453 조각 b3). `BriefCard`의 64px 칸·`list` 타일·`CardImageSlot`의 이미지 없음 자리 표시가 같은
 * 선택을 해야 한다 — 같은 카드가 모양만 바꿔도 같은 아이콘이어야 하고, 고칠 곳이 여기 하나다. 자원 `auto`만 표시 데이터의 템플릿 구분 값(`template`)으로
 * 가른다(티켓 20261001_2244): 지역 트렌드는 핀, 진행 알림은 모래시계다.
 */

/**
 * 색이 아니라 아이콘 모양으로만 구분한다(제3의 컬러 도입 금지).
 * `Record<CardResource, …>`라 자원이 늘면 컴파일이 잡는다.
 */
const RESOURCE_ICON: Record<CardResource, ComponentType<SVGProps<SVGSVGElement>>> = {
  mission: TargetIcon,
  drop: PackageIcon,
  recipe: FlaskIcon,
  badge: MedalIcon,
  article: NewspaperIcon,
  ranking: RankingIcon,
  collection: BookIcon,
  auto: HourglassIcon,
}

/** 아이콘을 고르는 데 쓰는 표시 데이터 값. */
export type ResourceIconView = Pick<CardView, 'resource' | 'template'>

/**
 * 카드의 자원 아이콘을 그린 요소를 돌려준다. 크기·색은 호출부가 `props.className`으로 준다.
 * 자원을 모르는 카드(이 코드가 모르는 템플릿 값, `resourceOfTemplate`가 `undefined`를 준 경우)는 아이콘이 없어 `null`이다 — 던지지 않는다
 * (`createElement(undefined)`는 렌더 중에 던져 홈 전체를 오류 화면으로 만든다, 티켓 20261006_1217). 호출부 칸은 비어 남아 높이를 지킨다.
 * 컴포넌트 타입이 아니라 요소를 돌려주는 이유: 호출부(렌더 중)가 `const Icon = resourceIconOf(view)`로 컴포넌트를 받아 `<Icon />`으로 그리면
 * 렌더 중에 컴포넌트를 만드는 것으로 보여 `react-hooks/static-components` 규칙에 걸린다.
 */
export function resourceIconOf(view: ResourceIconView, props: SVGProps<SVGSVGElement> = {}): ReactElement | null {
  // `auto`는 진행 알림(`progress_nudge`)과 지역 트렌드(`location_trend`)를 한 값으로 묶는다. 지역 값(`regionLabel`)이 있다고 핀을 그리면 진행 알림 카드에
  // 지역이 들어 있을 때도 핀이 되므로, 표시 데이터의 템플릿 구분 값으로 가른다: 지역 트렌드만 핀이고 그 밖(진행 알림, 구분 값이 없는 직접 만든 표시 데이터)은 모래시계다.
  const Icon: ComponentType<SVGProps<SVGSVGElement>> | undefined =
    view.resource === 'auto' && view.template === 'location_trend' ? PinIcon : RESOURCE_ICON[view.resource]
  return Icon ? createElement(Icon, props) : null
}
