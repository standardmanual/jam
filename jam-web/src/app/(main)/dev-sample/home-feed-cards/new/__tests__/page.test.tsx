/**
 * 홈피드 새 카드 개발용 미리보기 페이지 (티켓 20261121_0155, 상위 20261120_2026 4회차-4)
 *
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) `renderToStaticMarkup`으로 서버가 내보내는 HTML을 단언한다.
 *
 * 확인하는 것: ① 서버에서 오류 없이 그려지고 구역 6개(유형·박스·상태·폭 320·자동 배정·모션)와 자동 배정 요약이 있다,
 * ② 가짜 데이터만 쓴다(서비스 데이터 조회·세션·계측 모듈을 불러오지 않고, 링크·트래커가 없고, 외부 주소가 없다),
 * ③ `noindex`다, ④ 옛 7모양 샘플 페이지 파일을 건드리지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/dev-sample/home-feed-cards/new/__tests__/page.test.tsx"
 */
import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from '@/lib/testing/renderStable'

// 서비스 데이터·세션을 읽는 모듈이 불려 오면 즉시 실패하게 한다(가짜 데이터만 쓰는지 확인).
const forbidden = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('@/lib/supabase/server', () => {
  forbidden.calls.push('supabase/server')
  return {
    createClient: () => {
      throw new Error('미리보기 페이지가 Supabase 클라이언트를 만들었다')
    },
    createServiceClient: () => {
      throw new Error('미리보기 페이지가 Supabase 서비스 클라이언트를 만들었다')
    },
  }
})
vi.mock('@/lib/today/cards', () => {
  forbidden.calls.push('today/cards')
  return {
    getTodayCards: () => {
      throw new Error('미리보기 페이지가 getTodayCards를 불렀다')
    },
  }
})
vi.mock('@/lib/today/events', () => {
  forbidden.calls.push('today/events')
  return {}
})
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

import Page, { metadata } from '../page'
import { PREVIEW_AUTO_COUNT, buildAutoAssignment, formatChipSummary } from '@/lib/today/feedPreviewData'

describe('홈피드 새 카드 미리보기 페이지', () => {
  const html = renderToStaticMarkup(<Page />)

  it('noindex 메타다', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false })
  })

  it('구역 6개와 제목이 있다', () => {
    for (const id of ['types', 'boxes', 'states', 'narrow', 'auto', 'motion']) {
      expect(html).toContain(`id="${id}"`)
      expect(html).toContain(`href="#${id}"`)
    }
    expect(html).toContain('유형 8개')
    expect(html).toContain('박스 모양 5종')
    expect(html).toContain('컬렉션 모션')
  })

  it('유형 8개 이름과 전체 배경 이미지의 꺼짐 표시가 있다', () => {
    for (const name of ['히어로', '텍스트', '배지 소개', '배지만', '컬렉션 소개', '드랍·픽업', '목록형']) expect(html).toContain(name)
    expect(html).toContain('전체 배경 이미지')
    expect(html).toContain('꺼짐 상태예요')
  })

  it('자동 배정 요약이 카드 수·규칙 위반·제외 조합 겹침·되돌림을 숫자로 보인다', () => {
    const value = (name: string) => new RegExp(`data-summary="${name}">(\\d+)<`).exec(html)?.[1]
    expect(value('카드 수')).toBe(String(PREVIEW_AUTO_COUNT))
    expect(value('규칙 위반')).toBe('0')
    expect(value('제외 조합과 겹침')).toBe('0')
    expect(value('되돌림 기본 조합')).toBe('0')
    // 카드 120장이 모두 그려진다(이름표 «001 ·»부터 «120 ·»까지)
    expect(html).toContain('001 · ')
    expect(html).toContain('120 · ')
  })

  it('자동 배정 요약 아래에 칩 배치 요약이 한 줄로 있고 위반 수가 계산값과 같다', () => {
    const line = /data-summary="칩 배치">([^<]*)</.exec(html)?.[1]
    expect(line).toBe(formatChipSummary(buildAutoAssignment().summary.chips))
    expect(line).toMatch(/^칩 배치: 스티커 \d+장 · 알약 \d+장 · 물러서기 0단계 \d+장 \/ 1~2단계 \d+장 \/ 3~6단계 \d+장 · 연속·앞 카드 규칙 위반 \d+$/)
  })

  it('컬렉션 모션 구역에 모인·퍼진 상태와 스크롤 재생 카드가 있다', () => {
    expect(html).toContain('모인 상태')
    expect(html).toContain('퍼진 상태')
    expect(html).toContain('스크롤 재생')
  })

  it('가짜 데이터만 쓴다: 서비스 데이터 모듈을 불러오지 않고 링크·트래커·외부 주소가 없다', () => {
    expect(forbidden.calls).toEqual([])
    expect(html).not.toMatch(/data-tracker|data-track-click/)
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/#[0-9a-fA-F]{6}/)
  })

  it('옛 7모양 샘플 페이지는 지웠고 이 페이지가 옛 페이지를 가져오지 않는다(티켓 20261122_1101)', () => {
    const source = readFileSync(path.resolve(__dirname, '../page.tsx'), 'utf-8')
    expect(source).not.toMatch(/from '\.\.\/page'/)
    expect(existsSync(path.resolve(__dirname, '../../page.tsx'))).toBe(false)
  })
})
