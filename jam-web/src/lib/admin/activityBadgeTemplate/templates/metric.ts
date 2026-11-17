/**
 * «운동 수치» 템플릿 정의 (티켓 20261116_1435, 새 그림으로 교체: 티켓 20261117_1920).
 * 이름은 위쪽 원호(글자 윗부분이 바깥), 값은 가로 직선(왼쪽 위 기준, 쌓은 날·이어 온 날 템플릿과 같은 방식)이다.
 * 이름 수치(글자 크기·자간·기준선 반지름·각도)는 사용자가 준 `Group 20.svg`의 샘플 글자 모양에 Noto Sans KR 900을 겹쳐 맞춘 값이고,
 * 값 수치는 원본 <text>의 글자 속성 그대로다. 그림을 바꾸면 다시 맞춘다.
 */
import type { BadgeTemplateDef, TemplateArcSlot } from '../templateDef'
import type { TemplateSlot } from '../templateSvg'
import { METRIC_TEMPLATE_SVG } from './metricSvg'

const name: TemplateArcSlot = {
  kind: 'arc',
  cx: 382,
  cy: 382,
  baselineRadius: 267.93,
  centerDeg: 0.09,
  facing: 'outward',
  maxSpanDeg: 166.95,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fontSize: 71.34,
  letterSpacingEm: -0.0669,
  fill: '#000000',
}

const value: TemplateSlot = {
  found: true,
  isText: true,
  x: 98.4085,
  y: 535.408,
  fontFamily: 'Noto Sans KR',
  fontSize: 108.333,
  fontWeight: '900',
  fill: '#000000',
  letterSpacing: '-0.08em',
  textAnchor: null,
  transform: null,
  placeholder: '1829283km',
  // 아래 반원의 너비 안에 머물도록 샘플보다 조금 넓은 폭까지만 쓴다(샘플 폭 약 568)
  maxWidth: 620,
}

export const METRIC_TEMPLATE: BadgeTemplateDef = {
  classKey: 'metric',
  svg: METRIC_TEMPLATE_SVG,
  slots: { viewBoxWidth: 764, viewBoxHeight: 764, name, value },
}
