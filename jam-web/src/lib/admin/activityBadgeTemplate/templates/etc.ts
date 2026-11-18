/**
 * «기타» 템플릿 정의 (티켓 20261118_1206).
 * 이름은 위쪽 원호(글자 윗부분이 바깥), 값은 아래쪽 원호(글자 윗부분이 중심)다.
 * 수치는 사용자가 준 `Group 28.svg`의 샘플 글자 모양에 사용자가 알려 준 글자 설정(크기 111, 자간 −8%)을 겹쳐 맞춘 값이다.
 * 이름의 왼쪽 끝은 샘플이 길 때 조금 어긋난다. pathRadius는 글자 사이 간격을 재는 호의 반지름이다.
 */
import type { BadgeTemplateDef, TemplateArcSlot } from '../templateDef'
import { ETC_TEMPLATE_SVG } from './etcSvg'

const name: TemplateArcSlot = {
  kind: 'arc',
  cx: 489,
  cy: 471.8,
  baselineRadius: 319.63,
  pathRadius: 369.34,
  centerDeg: 0,
  facing: 'outward',
  maxSpanDeg: 181.8,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fontSize: 111,
  letterSpacingEm: -0.08,
  fill: '#000000',
}

const value: TemplateArcSlot = {
  kind: 'arc',
  cx: 487.56,
  cy: 682,
  baselineRadius: 400.75,
  pathRadius: 372.5,
  centerDeg: 180,
  facing: 'inward',
  maxSpanDeg: 122.5,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fontSize: 111,
  letterSpacingEm: -0.08,
  fill: '#000000',
}

export const ETC_TEMPLATE: BadgeTemplateDef = {
  classKey: 'etc',
  svg: ETC_TEMPLATE_SVG,
  slots: { viewBoxWidth: 975, viewBoxHeight: 1153, name, value },
}
