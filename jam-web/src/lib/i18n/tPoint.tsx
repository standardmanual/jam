import { Fragment, type ReactNode } from 'react'
import { PointText } from '@ds/components/patterns/PointText'
import { t } from './index'

/**
 * `t()`와 같은 `{변수}` 보간 헬퍼. 템플릿 속 «[+-]{변수} 포인트» 조각만 `PointText inline`으로 칠해
 * ReactNode를 돌려준다(티켓 20261104_2319 2회차, 규칙: UX Writing 가이드 «포인트» 행).
 *
 * - 부호(+, -)는 오렌지에 포함한다. 조사와 나머지 문장은 부모 글자색을 따른다.
 * - 포인트 조각이 없는 템플릿은 `t()`와 같은 문자열을 돌려준다.
 * - 조각의 변수가 vars에 없으면 그 조각은 칠하지 않고 `t()`처럼 원문(`{변수}`)을 남긴다.
 * - 색은 PointText 한 곳에서만 정한다. 이 파일은 색 클래스를 적지 않는다.
 */
const POINT_PIECE = /([+-]?)\{(\w+)\} 포인트/g

export function tPoint(template: string, vars?: Record<string, string | number>): ReactNode {
  if (!vars) return template
  const nodes: ReactNode[] = []
  let cursor = 0
  let painted = false
  for (const match of template.matchAll(POINT_PIECE)) {
    const [whole, sign, key] = match
    if (!(key in vars)) continue
    const start = match.index ?? 0
    if (start > cursor) nodes.push(<Fragment key={`t${cursor}`}>{t(template.slice(cursor, start), vars)}</Fragment>)
    nodes.push(<PointText key={`p${start}`} value={`${sign}${String(vars[key])}`} />)
    cursor = start + whole.length
    painted = true
  }
  if (!painted) return t(template, vars)
  if (cursor < template.length) nodes.push(<Fragment key={`t${cursor}`}>{t(template.slice(cursor), vars)}</Fragment>)
  return <>{nodes}</>
}

/**
 * 이미 완성된 문자열(알림 문구, 오늘 카드 줄 등)에서 «[부호]숫자 포인트» 조각만 `PointText inline`으로 칠한다
 * (티켓 20261104_2319 3회차). `tPoint`를 쓸 수 없는 곳 전용이다.
 *
 * - 부호는 `+`, `-`, `−`(U+2212)를 오렌지에 포함한다. 숫자는 천 단위 쉼표를 허용한다.
 * - 조각이 없으면 같은 문자열을 그대로 돌려준다.
 * - 값은 이미 포맷된 문자열이라 그대로 PointText에 넘긴다. 색 클래스는 적지 않는다.
 */
const POINT_IN_TEXT = /([+\-−]?\d[\d,]*) 포인트/g

export function pointify(text: string): ReactNode {
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(POINT_IN_TEXT)) {
    const start = match.index ?? 0
    if (start > cursor) nodes.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, start)}</Fragment>)
    nodes.push(<PointText key={`p${start}`} value={match[1]} />)
    cursor = start + match[0].length
  }
  if (cursor === 0) return text
  if (cursor < text.length) nodes.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>)
  return <>{nodes}</>
}
