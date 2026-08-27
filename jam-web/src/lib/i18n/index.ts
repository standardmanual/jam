import { ko, type Dictionary } from './ko'

export type { Dictionary }
export type Locale = 'ko'

export const dictionaries = { ko } satisfies Record<Locale, Dictionary>

export const DEFAULT_LOCALE: Locale = 'ko'

/**
 * 현재 로케일 딕셔너리.
 * Phase 1은 ko 단일 로케일이라 상수로 노출합니다.
 * 다국어를 붙일 때 이 함수만 로케일 컨텍스트를 읽도록 바꾸면 됩니다.
 */
export function getDictionary(locale: Locale = DEFAULT_LOCALE): Dictionary {
  return dictionaries[locale]
}

/** 컴포넌트에서 바로 쓰는 단축 참조. 예) `d.profile.editButton` */
export const d = dictionaries[DEFAULT_LOCALE]

/**
 * `{변수}` 보간 헬퍼.
 *
 *   t(d.profile.pointBalance, { count: '1,200' }) // "1,200 포인트"
 *
 * 보간이 필요 없는 문구는 딕셔너리를 직접 참조하세요.
 */
export function t(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  )
}
