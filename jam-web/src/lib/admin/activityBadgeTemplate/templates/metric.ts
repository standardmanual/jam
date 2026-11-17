/**
 * «운동 수치» 템플릿 정의 (티켓 20261116_1435, 새 그림으로 교체: 티켓 20261117_1920).
 * 이름은 위쪽 원호(글자 윗부분이 바깥), 값은 가로 직선(왼쪽 위 기준, 쌓은 날·이어 온 날 템플릿과 같은 방식)이다.
 * 이름 수치(글자 크기·자간·기준선 반지름·각도)는 사용자가 준 `Group 20.svg`의 샘플 글자 모양에 Noto Sans KR 900을 겹쳐 맞춘 값이고,
 * 값 수치는 원본 <text>의 글자 속성 그대로다. 그림을 바꾸면 다시 맞춘다.
 */
import type { BadgeTemplateDef, TemplateArcSlot } from '../templateDef'
import type { TemplateSlot } from '../templateSvg'
import { METRIC_TEMPLATE_SVG } from './metricSvg'

/**
 * 아래 반원의 초록 그라데이션을 대신하는 단색(티켓 20261117_2025, 사용자 지시 2026-11-17: «아래 반원은 그린 컬러로 적용하고 색 칸에 추가»).
 * 원본 그라데이션의 두 끝색(#005B3B·#14BA80)의 가운데 색이다. 어드민 색 칸에서 바꿀 수 있다.
 */
export const METRIC_LOWER_HALF_GREEN = '#0A8B5E'

/**
 * 원본의 아래 반원(`<g id="Subtract_2">`, 원뿔 그라데이션을 `foreignObject`로 그린 묶음)을 같은 모양의 단색 `<path>`로 바꾼 사본.
 * 그라데이션은 색 칸으로 읽히지 않아 색 조정이 먹지 않기 때문이다. 해당 묶음이 없으면 원본을 그대로 돌려준다(시험이 확인한다).
 */
export function flattenLowerHalf(svg: string): string {
  const group = /<g id="Subtract_2">[\s\S]*?data-figma-gradient-fill="[^"]*"\/>\n<\/g>/
  const shape = svg.match(/<path d="(M382 764C[^"]*)" data-figma-gradient-fill=/)?.[1]
  if (!group.test(svg) || !shape) return svg
  return svg.replace(group, `<path id="Subtract_2" d="${shape}" fill="${METRIC_LOWER_HALF_GREEN}"/>`)
}

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
  svg: flattenLowerHalf(METRIC_TEMPLATE_SVG),
  slots: { viewBoxWidth: 764, viewBoxHeight: 764, name, value },
}
