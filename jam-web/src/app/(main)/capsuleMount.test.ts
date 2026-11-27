/**
 * 홈의 챕터 게이지 카드 마운트 (티켓 20261127_1735 C5b, 이전 캡슐 위젯 마운트 시험 20261018_0054를 교체)
 *
 * 투데이 서버 페이지는 의존이 많아 렌더하지 않고 소스 구조로 고정한다. 고정하는 것:
 * - 홈에서 `CapsuleWidget`·`getCapsuleStatus`가 사라지고 `getMyChapter`를 읽는다.
 * - 카드(`ChapterGaugeSection`)는 인사말 줄 바로 아래, `TodayStatusStrip`·`TodayCardStack` 위에 한 번만 있다.
 * - 서버 조회는 정리(settle) 뒤에 읽고, 실패하면 던지지 않고 null로 접히며, 기존 `Promise.all`에 합쳐진다.
 * - 막힘 안내는 이용 정지 중이면 없다(홈이 이미 읽는 정지 값을 쓴다).
 * - 카드를 감싸는 곳에 z-index가 없다(시트가 탭바에 가려진 2026-08-25 사고).
 * - `TodayStatusStrip`의 면은 바뀌지 않았다(2026-11-28 사용자 정정, 흰 면 유지).
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/capsuleMount.test.ts"
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('홈 챕터 게이지 카드 묶음', () => {
  it('홈에서 캡슐 위젯과 캡슐 조회가 사라졌다', () => {
    expect(code).not.toMatch(/CapsuleWidget|getCapsuleStatus|capsulePromise|capsuleInitial/)
    expect(code).not.toMatch(/캡슐/)
  })

  it('홈은 getMyChapter와 막힘 판정을 읽는다', () => {
    expect(code).toMatch(/getMyChapter\(createServiceClient\(\), userId\)/)
    expect(code).toMatch(/readCapsuleReceiveBlocked\(createServiceClient\(\), userId\)/)
  })

  it('카드를 묶음 div 없이 그대로 두어 홈 컬럼의 gap 하나로 위 요소와 이어진다', () => {
    const around = code.slice(code.indexOf('d.todayStatus.greeting'), code.indexOf('<ChapterGaugeSection'))
    expect(around).not.toMatch(/<div class[^>]*gap/)
    expect(code).toContain('<ChapterGaugeSection chapter={chapter} blocked={blocked} />')
  })

  it('확률 안내 링크를 이 묶음에 새로 만들지 않는다(푸터의 링크를 쓴다)', () => {
    expect(code).not.toMatch(/\/probability|footerProbability|probabilityLink/)
  })
})

describe('홈 챕터 게이지 카드 위치', () => {
  it('인사말 아래, 현황 스트립·TodayCardStack 위에 한 번 있다', () => {
    const greeting = code.indexOf('d.todayStatus.greeting')
    const section = code.indexOf('<ChapterGaugeSection')
    const strip = code.indexOf('<TodayStatusStrip')
    const stack = code.indexOf('<TodayCardStack')
    expect(code.match(/<ChapterGaugeSection/g)).toHaveLength(1)
    expect(greeting).toBeGreaterThan(-1)
    expect(section).toBeGreaterThan(greeting)
    expect(strip).toBeGreaterThan(section)
    expect(stack).toBeGreaterThan(section)
  })

  it('서버 조회는 정리 뒤에 읽고 실패하면 null로 접히며 기존 Promise.all에 합쳐진다', () => {
    expect(code).toMatch(/const settlePromise = settleAfterSlotsFreed\(createServiceClient\(\), userId\)/)
    expect(code).toMatch(/settlePromise\s*\.then\(\(\) => getMyChapter\(/)
    expect(code).toMatch(/settlePromise\s*\.then\(\(\) => readCapsuleReceiveBlocked\(/)
    expect(code.match(/return null\s*\}\)/g)?.length).toBeGreaterThanOrEqual(2)
    const all = code.slice(code.indexOf('await Promise.all(['), code.indexOf('])', code.indexOf('await Promise.all([')))
    expect(all).toContain('chapterPromise')
    expect(all).toContain('blockedPromise')
  })

  it('막힘 안내는 이용 정지 중이면 넘기지 않는다', () => {
    expect(code).toMatch(/receiveBlocked\?\.blocked && !suspension \? \{ pendingItemCount: receiveBlocked\.pending \} : null/)
  })

  it('카드를 z-index가 있는 래퍼로 감싸지 않는다', () => {
    const around = code.slice(code.indexOf('d.todayStatus.greeting'), code.indexOf('<TodayCardStack'))
    expect(around).not.toMatch(/z-\d|z-\[|zIndex|z-index/)
  })

  it('TodayStatusStrip은 흰 면 그대로다 — 반전·어두운 면을 넘기지 않는다', () => {
    expect(code).toContain('<TodayStatusStrip left={leftStatus} right={rightStatus} />')
    const strip = readFileSync(join(__dirname, 'TodayStatusStrip.tsx'), 'utf8')
    expect(strip).not.toMatch(/tone="inverse"|background-inverse|chapter-card-bg/)
  })
})
