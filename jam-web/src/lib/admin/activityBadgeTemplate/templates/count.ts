/**
 * «횟수와 양» 템플릿 정의 (티켓 20261118_1506).
 * 이름은 위쪽 원호(글자 윗부분이 바깥), 값은 아래쪽 원호(글자 윗부분이 중심)다.
 * 수치는 사용자가 준 `Group 30.svg`의 샘플 글자 모양에 Noto Sans KR 900(크기 54, 자간 −6.5%)을 겹쳐 맞춘 값이다.
 * 크기·자간은 사용자가 지정한 값이 아니라 두 자리를 같게 두고 맞춘 값이다.
 * pathRadius는 글자 사이 간격을 재는 호의 반지름이다.
 * 그림 아래 바깥의 «JOIN AND MOVE»(`<g id="Vector">`)는 그림의 일부이고 글자 자리가 아니다.
 */
import type { BadgeTemplateDef, TemplateArcSlot } from '../templateDef'
import { COUNT_TEMPLATE_SVG } from './countSvg'

const name: TemplateArcSlot = {
  kind: 'arc',
  cx: 308.625,
  cy: 735.25,
  baselineRadius: 650,
  pathRadius: 666.25,
  centerDeg: 0,
  facing: 'outward',
  maxSpanDeg: 40,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fontSize: 54,
  letterSpacingEm: -0.065,
  fill: '#000000',
}

const value: TemplateArcSlot = {
  kind: 'arc',
  cx: 308.375,
  cy: -352.125,
  baselineRadius: 656,
  pathRadius: 633,
  centerDeg: 180,
  facing: 'inward',
  maxSpanDeg: 40,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fontSize: 54,
  letterSpacingEm: -0.065,
  fill: '#000000',
}

export const COUNT_TEMPLATE: BadgeTemplateDef = {
  classKey: 'count',
  svg: COUNT_TEMPLATE_SVG,
  slots: { viewBoxWidth: 616, viewBoxHeight: 409, name, value },
}
