import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { tPoint } from '../tPoint'
import { t } from '../index'

// 저장소에 jsdom·testing-library가 없어 서버 렌더 마크업으로 검사한다.
function paint(node: ReturnType<typeof tPoint>) {
  const html = renderToStaticMarkup(<p>{node}</p>)
  return {
    text: html.replace(/<[^>]+>/g, ''),
    pieces: Array.from(html.matchAll(/<span class="text-point-text"[^>]*>(.*?)<\/span>/g)).map((m) => m[1]),
  }
}

describe('tPoint', () => {
  it('«값 포인트» 조각만 point-text로 칠하고 조사는 밖에 둔다', () => {
    const r = paint(tPoint('{need} 포인트가 필요해요', { need: '1,200' }))
    expect(r.pieces).toEqual(['1,200 포인트'])
    expect(r.text).toBe('1,200 포인트가 필요해요')
  })

  it('부호를 오렌지 조각에 포함한다', () => {
    const r = paint(tPoint('+{points} 포인트', { points: '50' }))
    expect(r.pieces).toEqual(['+50 포인트'])
  })

  it('문장 중간 조각과 다른 변수는 앞뒤 글자를 그대로 둔다', () => {
    const r = paint(tPoint('배지 {count}개와 {points} 포인트를 획득했어요', { count: 2, points: '300' }))
    expect(r.pieces).toEqual(['300 포인트'])
    expect(r.text).toBe('배지 2개와 300 포인트를 획득했어요')
  })

  it('값 0도 그린다', () => {
    expect(paint(tPoint('{points} 포인트', { points: 0 })).pieces).toEqual(['0 포인트'])
  })

  it('변수가 없으면 원문을 유지하고 칠하지 않는다', () => {
    const r = paint(tPoint('{points} 포인트를 받았어요', { other: 1 }))
    expect(r.pieces).toEqual([])
    expect(r.text).toBe('{points} 포인트를 받았어요')
  })

  it('포인트 조각이 없는 템플릿은 t()와 같은 문자열을 돌려준다', () => {
    expect(tPoint('배지 {count}개를 받았어요', { count: 3 })).toBe(t('배지 {count}개를 받았어요', { count: 3 }))
    expect(tPoint('포인트로 열 수 있어요')).toBe('포인트로 열 수 있어요')
  })
})
