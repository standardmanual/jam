/**
 * «횟수와 양» 템플릿 정의 (티켓 20261117_1300).
 * 이름과 값이 모두 직선 한 줄이라 TemplateSlot 꼴로 적는다.
 * 수치는 사용자가 준 `Group 18.svg`의 글자 속성이고, 원본의 translate는 x·y에 더해 적었다.
 * 가운데 맞춤은 그림의 세로 가운데 축(x = 791)에 둔다. 최대 폭은 안쪽 마름모에서 양쪽 여백 40을 뺀 값이다.
 */
import type { BadgeTemplateDef } from '../templateDef'
import type { TemplateSlot } from '../templateSvg'
import { COUNT_TEMPLATE_SVG } from './countSvg'

const common = {
  found: true,
  isText: true,
  x: 791,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fill: '#000000',
  letterSpacing: '-0.08em',
  textAnchor: 'middle',
  transform: null,
} as const

const name: TemplateSlot = {
  ...common,
  y: 487.64,
  fontSize: 101.84,
  placeholder: '벼룩시장 건너편',
  maxWidth: 663.4,
}

const value: TemplateSlot = {
  ...common,
  y: 626.35,
  fontSize: 92.01,
  placeholder: '5가지',
  maxWidth: 376.2,
}

export const COUNT_TEMPLATE: BadgeTemplateDef = {
  classKey: 'count',
  svg: COUNT_TEMPLATE_SVG,
  slots: { viewBoxWidth: 1582, viewBoxHeight: 958, name, value },
}
