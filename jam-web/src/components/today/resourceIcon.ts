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
 * 자원 → 아이콘 (티켓 20261001_1737, 상위 20260930_1453 조각 b3). `BriefCard`의 64px 칸과 `HeroCard`의 이미지 없음 자리 표시가 같은
 * 선택을 해야 한다 — 같은 카드가 모양만 바꿔도 같은 아이콘이어야 하고, 나중에 표시 데이터에 템플릿 구분 값이 생기면(b7) 고칠 곳이 여기 하나다.
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
export type ResourceIconView = Pick<CardView, 'resource' | 'regionLabel'>

/**
 * 카드의 자원 아이콘을 그린 요소를 돌려준다. 크기·색은 호출부가 `props.className`으로 준다.
 * 컴포넌트 타입이 아니라 요소를 돌려주는 이유: 호출부(렌더 중)가 `const Icon = resourceIconOf(view)`로 컴포넌트를 받아 `<Icon />`으로 그리면
 * 렌더 중에 컴포넌트를 만드는 것으로 보여 `react-hooks/static-components` 규칙에 걸린다.
 */
export function resourceIconOf(view: ResourceIconView, props: SVGProps<SVGSVGElement> = {}): ReactElement {
  // `auto`는 진행 알림(`progress_nudge`)과 지역 트렌드(`location_trend`)를 한 값으로 묶어서 템플릿을 구분할 수 없다. 그래서 지역 값이
  // 있으면 핀, 없으면 모래시계로 가른다(옛 렌더러의 구분을 그대로 지키는 임시 판별 — 템플릿 구분이 따로 필요해지면 b7에서 표시 데이터에
  // 구분 값을 더한다).
  const Icon = view.resource === 'auto' && view.regionLabel ? PinIcon : RESOURCE_ICON[view.resource]
  return createElement(Icon, props)
}
