/**
 * 템플릿을 코드로 정의하는 자리·정의의 꼴 (티켓 20261116_1435).
 * 순수 모듈. 직선 자리(TemplateSlot)와 원호 자리(TemplateArcSlot)를 함께 담는다.
 */
import type { BadgeTemplateClassKey } from './resolveTemplateText'
import type { TemplateSlot } from './templateSvg'

export interface TemplateArcSlot {
  kind: 'arc'
  cx: number
  cy: number
  /** 글자의 기준선이 놓이는 원의 반지름 */
  baselineRadius: number
  /** 글자 묶음의 가운데가 놓이는 각도. 12시가 0, 시계 방향이 +, 6시가 180 */
  centerDeg: number
  /** outward: 글자 윗부분이 바깥을 향한다(위쪽 호). inward: 글자 윗부분이 중심을 향한다(아래쪽 호) */
  facing: 'outward' | 'inward'
  /** 글자 묶음이 이 각도를 넘으면 넘는 만큼 줄인다 */
  maxSpanDeg: number
  fontFamily: string
  /** '900'처럼 숫자를 글자로 적는다(TemplateSlot.fontWeight와 같은 꼴이라 resolveTemplateFont에 그대로 넘길 수 있다) */
  fontWeight: string
  fontSize: number
  letterSpacingEm: number
  fill: string
}

export type TemplateSlotDef = TemplateSlot | TemplateArcSlot

export function isArcSlot(slot: TemplateSlotDef): slot is TemplateArcSlot {
  return (slot as TemplateArcSlot).kind === 'arc'
}

export interface TemplateDefSlots {
  viewBoxWidth: number
  viewBoxHeight: number
  name: TemplateSlotDef
  value: TemplateSlotDef
}

export interface BadgeTemplateDef {
  classKey: BadgeTemplateClassKey
  svg: string
  slots: TemplateDefSlots
}
