/**
 * «운동 수치» 템플릿 정의 (티켓 20261116_1435).
 * 아래 수치(글자 크기·자간·기준선 반지름·각도)는 원본에 겹쳐 맞춘 값이다. 그림을 바꾸면 다시 맞춘다.
 */
import type { BadgeTemplateDef, TemplateArcSlot } from '../templateDef'
import { METRIC_TEMPLATE_SVG } from './metricSvg'

const common = { kind: 'arc', cx: 461, cy: 461, fontFamily: 'Noto Sans KR', fontWeight: '900', fill: '#FFFFFF' } as const

const name: TemplateArcSlot = {
  ...common,
  baselineRadius: 302.56,
  centerDeg: 0,
  facing: 'outward',
  maxSpanDeg: 208.5,
  fontSize: 106.5,
  letterSpacingEm: -0.11,
}

const value: TemplateArcSlot = {
  ...common,
  baselineRadius: 383.56,
  centerDeg: 180,
  facing: 'inward',
  maxSpanDeg: 91,
  fontSize: 107,
  letterSpacingEm: 0.06,
}

export const METRIC_TEMPLATE: BadgeTemplateDef = {
  classKey: 'metric',
  svg: METRIC_TEMPLATE_SVG,
  slots: { viewBoxWidth: 922, viewBoxHeight: 922, name, value },
}
