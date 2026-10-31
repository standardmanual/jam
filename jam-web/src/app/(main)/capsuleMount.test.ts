/**
 * 투데이의 캡슐 위젯 마운트 (티켓 20261018_0054 1회)
 *
 * 홈에는 챕터 번호가 없다(티켓 20261031_1806). 투데이 서버 페이지는 의존이 많아 렌더하지 않고 소스 구조로 고정한다. 고정하는 것:
 * - 위젯은 `TodayStatusStrip` 아래, `TodayCardStack` 위에 한 번만 있다.
 * - 서버 조회는 실패하면 던지지 않고 null로 접는다(위젯이 클라이언트에서 다시 가져온다).
 * - 서버 조회는 기존 `Promise.all`에 합쳐져 홈 응답을 늦추지 않는다.
 * - 위젯을 감싸는 곳에 z-index가 없다(시트가 탭바에 가려진 2026-08-25 사고).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/capsuleMount.test.ts"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('투데이 캡슐 위젯 묶음', () => {
  it('홈은 챕터를 읽지도 그리지도 않는다 — getMyChapter·챕터 글자가 없다(티켓 20261031_1806)', () => {
    expect(code).not.toMatch(/getMyChapter|chapterPromise|myChapter/)
    expect(code).not.toContain('d.chapter.line.chapter')
    expect(code).not.toMatch(/챕터/)
  })

  it('위젯을 묶음 div 없이 그대로 두어 홈 컬럼의 gap 하나로 위 요소와 이어진다', () => {
    const around = code.slice(code.indexOf('<TodayStatusStrip'), code.indexOf('<CapsuleWidget'))
    expect(around).not.toMatch(/<div/)
  })

  it('확률 안내 링크를 이 묶음에 새로 만들지 않는다(푸터의 링크를 쓴다)', () => {
    expect(code).not.toMatch(/\/probability|footerProbability|probabilityLink/)
  })
})

describe('투데이 캡슐 위젯', () => {
  it('TodayStatusStrip 아래, TodayCardStack 위에 한 번 있다', () => {
    const strip = code.indexOf('<TodayStatusStrip')
    const widget = code.indexOf('<CapsuleWidget')
    const stack = code.indexOf('<TodayCardStack')
    expect(code.match(/<CapsuleWidget/g)).toHaveLength(1)
    expect(strip).toBeGreaterThan(-1)
    expect(widget).toBeGreaterThan(strip)
    expect(stack).toBeGreaterThan(widget)
  })

  it('서버 초기값은 실패하면 null로 접고, 기존 Promise.all에 합쳐진다', () => {
    expect(code).toMatch(/getCapsuleStatus\(createServiceClient\(\), userId\)\.catch\(/)
    expect(code).toMatch(/return null\s*\}\)/)
    const all = code.slice(code.indexOf('await Promise.all(['), code.indexOf('])', code.indexOf('await Promise.all([')))
    expect(all).toContain('capsulePromise')
    expect(code).toContain('<CapsuleWidget initial={capsuleInitial} />')
  })

  it('위젯을 z-index가 있는 래퍼로 감싸지 않는다', () => {
    const around = code.slice(code.indexOf('<TodayStatusStrip'), code.indexOf('<TodayCardStack'))
    expect(around).not.toMatch(/z-\d|z-\[|zIndex|z-index/)
  })
})
