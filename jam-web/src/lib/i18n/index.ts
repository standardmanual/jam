import { ko, type Dictionary } from './ko'


type Locale = 'ko'

const dictionaries = { ko } satisfies Record<Locale, Dictionary>

const DEFAULT_LOCALE: Locale = 'ko'

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
