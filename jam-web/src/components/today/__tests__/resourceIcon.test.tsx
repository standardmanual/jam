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
    const html = renderToStaticMarkup(resourceIconOf({ resource: 'mission' }, { className: 'w-8 h-8 text-foreground/60' }))
    expect(html).toContain('class="w-8 h-8 text-foreground/60"')
    expect(html).toContain('aria-hidden="true"')
  })

  it('자동 카드는 템플릿이 지역 트렌드면 핀, 진행 알림이면 모래시계다', () => {
    expect(drawn({ resource: 'auto', template: 'location_trend' })).toBe(expected(PinIcon))
    expect(drawn({ resource: 'auto', template: 'progress_nudge' })).toBe(expected(HourglassIcon))
  })

  it('구분 값(template)이 없는 직접 만든 표시 데이터의 자동 카드는 자원의 기본 아이콘(모래시계)이다', () => {
    expect(drawn({ resource: 'auto' })).toBe(expected(HourglassIcon))
  })

  it('지역 값은 아이콘을 정하지 않는다 — 진행 알림은 지역 값이 있어도 모래시계다', () => {
    const view = { resource: 'auto', template: 'progress_nudge', regionLabel: '성수동' } as const
    expect(drawn(view as Parameters<typeof resourceIconOf>[0])).toBe(expected(HourglassIcon))
  })

  it('레시피 공개 카드(recipe_reveal)는 플라스크다', () => {
    expect(drawn({ resource: 'recipe', template: 'recipe_reveal' })).toBe(expected(FlaskIcon))
  })

  it('자원을 모르는 카드(처음 보는 템플릿 값, 자원이 undefined)는 던지지 않고 아이콘을 그리지 않는다(티켓 20261006_1217)', () => {
    const unknown = { resource: undefined, template: 'future_template' } as unknown as Parameters<typeof resourceIconOf>[0]
    expect(() => resourceIconOf(unknown, { className: CLASS })).not.toThrow()
    expect(resourceIconOf(unknown, { className: CLASS })).toBeNull()
    expect(renderToStaticMarkup(<>{resourceIconOf(unknown, { className: CLASS })}</>)).toBe('')
  })

  it('템플릿이 지역 트렌드여도 자동 카드가 아닌 자원이면 자원 아이콘이 그대로다', () => {
    expect(drawn({ resource: 'mission', template: 'location_trend' })).toBe(expected(TargetIcon))
    expect(drawn({ resource: 'drop', template: 'location_trend' })).toBe(expected(PackageIcon))
  })
})
