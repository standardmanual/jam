/**
 * «쌓은 날» 템플릿 정의 (티켓 20261117_1140).
 * 이름은 위쪽 원호(운동 수치 템플릿과 같은 방식), 값은 직선(이어 온 날 템플릿과 같은 방식)이다.
 * 아래 수치는 사용자가 준 `Group 15.svg`의 샘플 글자 모양에 Noto Sans KR 900을 겹쳐 맞춘 값이다.
 * 그림을 바꾸면 다시 맞춘다. 굵기는 사용자가 말하지 않아 겹침이 가장 큰 900으로 정했다.
 */
import type { BadgeTemplateDef, TemplateArcSlot } from '../templateDef'
import type { TemplateSlot } from '../templateSvg'
import { DAYS_ORIGINAL_SVG } from './daysSvg'

/**
 * `id`가 Union·Line으로 시작하지 않는 <path id="…">를 문서 순서대로 앞에서부터 name·value로 바꾼 사본.
 * 그런 <path>가 정확히 둘이 아니면 원본을 그대로 돌려준다(시험이 둘인지 확인한다)
 */
export function nameSampleShapes(svg: string): string {
  const pattern = /<path id="(?!Union|Line)[^"]*"/g
  if ((svg.match(pattern) ?? []).length !== 2) return svg
  let n = 0
  return svg.replace(pattern, () => `<path id="${++n === 1 ? 'name' : 'value'}"`)
}

const name: TemplateArcSlot = {
  kind: 'arc',
  cx: 351,
  cy: 300.49,
  baselineRadius: 178.13,
  centerDeg: 0.25,
  facing: 'outward',
  maxSpanDeg: 177.2,
  fontFamily: 'Noto Sans KR',
  fontWeight: '900',
  fontSize: 84,
  letterSpacingEm: -0.0802,
  fill: '#000000',
}

const value: TemplateSlot = {
  found: true,
  isText: true,
  x: 350.51,
  y: 949.75,
  fontFamily: 'Noto Sans KR',
  fontSize: 116.44,
  fontWeight: '900',
  fill: '#000000',
  letterSpacing: '-0.0756em',
  textAnchor: 'middle',
  transform: null,
  placeholder: '1000일',
}

export const DAYS_TEMPLATE: BadgeTemplateDef = {
  classKey: 'days',
  svg: nameSampleShapes(DAYS_ORIGINAL_SVG),
  slots: { viewBoxWidth: 702, viewBoxHeight: 1098, name, value },
}
