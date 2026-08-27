/**
 * pathname이 href와 정확히 같거나 href 하위 경로인지 판정한다.
 * 단순 `pathname.startsWith(href)` 접두어 매칭은 `/admin/points`가 `/admin/poi`에
 * 오매칭되는 등 문자열 접두어 사고를 일으킨다(티켓 20260827_003, 20260827_006).
 */
export function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}
