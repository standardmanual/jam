/**
 * 자원 → 아이콘 선택(`resourceIconOf`) 테스트 (티켓 20261001_1737, 상위 20260930_1453 조각 b3)
 *
 * `BriefCard`의 64px 칸과 `HeroCard`의 이미지 없음 자리 표시가 같은 함수를 쓰므로, 같은 카드가 모양만 바꿔도 같은 아이콘이 나온다.
 */
import { describe, it, expect } from 'vitest'
import { createElement, type ComponentType, type SVGProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
import { CARD_RESOURCES, type CardResource } from '@/lib/today/cardView'
import { resourceIconOf } from '../resourceIcon'

const EXPECTED: Record<CardResource, typeof TargetIcon> = {
  mission: TargetIcon,
  drop: PackageIcon,
  recipe: FlaskIcon,
  badge: MedalIcon,
  article: NewspaperIcon,
  ranking: RankingIcon,
  collection: BookIcon,
  auto: HourglassIcon,
}

const CLASS = 'w-6 h-6'
/** 기대 아이콘 컴포넌트를 같은 className으로 그린 마크업 */
const expected = (Icon: ComponentType<SVGProps<SVGSVGElement>>) => renderToStaticMarkup(createElement(Icon, { className: CLASS }))
/** 함수가 돌려준 요소의 마크업 */
const drawn = (view: Parameters<typeof resourceIconOf>[0]) => renderToStaticMarkup(resourceIconOf(view, { className: CLASS }))

describe('resourceIconOf', () => {
  it.each(CARD_RESOURCES.map((resource) => [resource]))('%s의 아이콘이 정해진 모양이다', (resource) => {
    expect(drawn({ resource })).toBe(expected(EXPECTED[resource]))
  })

  it('8개 자원의 아이콘 모양은 서로 다르다', () => {
    const shapes = new Set(CARD_RESOURCES.map((resource) => drawn({ resource })))
    expect(shapes.size).toBe(CARD_RESOURCES.length)
  })

  it('props(className)를 아이콘에 그대로 넘긴다 — 크기·색은 호출부 몫이다', () => {
    const html = renderToStaticMarkup(resourceIconOf({ resource: 'mission' }, { className: 'w-8 h-8 text-text/60' }))
    expect(html).toContain('class="w-8 h-8 text-text/60"')
    expect(html).toContain('aria-hidden="true"')
  })

  it('자동 카드는 지역 값이 있으면 핀(지역 트렌드), 없으면 모래시계(진행 알림)다', () => {
    expect(drawn({ resource: 'auto' })).toBe(expected(HourglassIcon))
    expect(drawn({ resource: 'auto', regionLabel: '성수동' })).toBe(expected(PinIcon))
  })

  it('지역 값이 있어도 자동 카드가 아니면 자원 아이콘이 그대로다', () => {
    expect(drawn({ resource: 'mission', regionLabel: '성수동' })).toBe(expected(TargetIcon))
    expect(drawn({ resource: 'drop', regionLabel: '한강공원' })).toBe(expected(PackageIcon))
  })
})
