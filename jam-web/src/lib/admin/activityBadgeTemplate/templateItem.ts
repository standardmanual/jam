/**
 * 제작 화면이 쓰는 분류 목록과 템플릿 항목 (티켓 20261116_1513). 템플릿은 코드(templates/)에 정의한다.
 */
import { BADGE_TEMPLATE_CLASS_LABEL, type BadgeTemplateClassKey } from './resolveTemplateText'
import type { TemplateDefSlots } from './templateDef'
import { getBadgeTemplateDef } from './templates'

export const TEMPLATE_CLASS_KEYS: BadgeTemplateClassKey[] = ['metric', 'days', 'streak', 'count']

export function isTemplateClassKey(v: string): v is BadgeTemplateClassKey {
  return (TEMPLATE_CLASS_KEYS as string[]).includes(v)
}

export interface TemplateItem {
  classKey: BadgeTemplateClassKey
  label: string
  svg: string | null
  slots: TemplateDefSlots | null
}

/** 네 분류를 정해진 순서로 돌려준다. 코드에 정의가 없는 분류는 svg와 slots가 null이다. */
export function listTemplateItems(): TemplateItem[] {
  return TEMPLATE_CLASS_KEYS.map((classKey) => {
    const def = getBadgeTemplateDef(classKey)
    return { classKey, label: BADGE_TEMPLATE_CLASS_LABEL[classKey], svg: def?.svg ?? null, slots: def?.slots ?? null }
  })
}
