/**
 * «이어 온 날» 템플릿 정의 (티켓 20261116_1634).
 * 글자는 원호가 아니라 직선이라 TemplateSlot 꼴로 적는다.
 * 아래 자리 수치는 사용자가 준 `Group 14.svg`의 글자 속성 그대로이고, 원본과 같은 위치에 놓이는 것을 카리나가 확인했다.
 */
import type { BadgeTemplateDef } from '../templateDef'
import type { TemplateSlot } from '../templateSvg'
import { STREAK_ORIGINAL_SVG } from './streakSvg'

/** 두 <text>의 id를 앞에서부터 name·value로 바꾼 사본. <text>가 둘이 아니면 원본을 그대로 돌려준다(시험이 둘인지 확인한다) */
export function nameSampleTextLayers(svg: string): string {
  if ((svg.match(/<text\b/g) ?? []).length !== 2) return svg
  let n = 0
  return svg.replace(/<text id="[^"]*"/g, () => `<text id="${++n === 1 ? 'name' : 'value'}"`)
}

const common = {
  found: true,
  isText: true,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fill: '#000000',
  letterSpacing: '-0.08em',
  textAnchor: null,
  transform: null,
} as const

const name: TemplateSlot = {
  ...common,
  x: 40.4758,
  y: 345.745,
  fontSize: 90,
  placeholder: '동해물과 백두산이 백두산이',
}

const value: TemplateSlot = {
  ...common,
  x: 197.157,
  y: 574.845,
  fontSize: 129,
  placeholder: '연속 3000일',
}

export const STREAK_TEMPLATE: BadgeTemplateDef = {
  classKey: 'streak',
  svg: nameSampleTextLayers(STREAK_ORIGINAL_SVG),
  slots: { viewBoxWidth: 1021, viewBoxHeight: 834, name, value },
}
