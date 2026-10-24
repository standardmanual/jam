/**
 * 어드민 어뷰징 화면의 «이용 정지» 탭 (티켓 20261017_1426 2회)과 탭 구성 (티켓 20261022_1134 2회: «정책 설정» 탭을 밸런스 설정 «어뷰징» 구역으로 옮겼다)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 마크업만 고정한다. 가짜 props만 쓰며 공용 DB는 부르지 않는다.
 *
 * 고정하는 것: 탭 이름이 «이용 정지»(옛 «섀도우밴» 탭이 아니다)이고 진행 중 건수가 붙는다, 걸기 폼에 사유 입력과
 * «유저에게 그대로 보여요» 안내가 있고 레벨 선택(Soft/Hard)이 없다, 네이티브 select가 없다, 이력 표가 정지 사유·푼 기록을 보인다.
 * 탭 구성(7-3 2회): 탭은 이용 정지·장소 블록 둘뿐이고 «정책 설정» 탭·기준값 입력칸·«정책 저장» 버튼이 없다. 이용 정지·장소 블록 탭은 그대로다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/abusing',
  useSearchParams: () => new URLSearchParams('tab=suspensions'),
}))

import AbusingClient from './AbusingClient'
import type { SuspensionRow } from '@/lib/admin/suspension-list'

const ROWS: SuspensionRow[] = [
  {
    id: 's1',
    user_id: '11111111-1111-4111-8111-111111111111',
    reason: 'GPS 조작이 반복돼서 정지했어요.',
    suspended_at: '2026-10-17T03:00:00.000Z',
    suspended_by: 'admin@jam.test',
    lifted_at: null,
    lifted_by: null,
    lift_note: null,
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'runner@jam.test', username: 'runner' },
  },
  {
    id: 's2',
    user_id: '22222222-2222-4222-8222-222222222222',
    reason: '지난 정지',
    suspended_at: '2026-09-01T03:00:00.000Z',
    suspended_by: 'admin@jam.test',
    lifted_at: '2026-09-05T03:00:00.000Z',
    lifted_by: 'ops@jam.test',
    lift_note: '소명 확인 후 해제',
    user: { id: '22222222-2222-4222-8222-222222222222', email: 'old@jam.test', username: 'old' },
  },
]

function render(tab: 'suspensions' | 'poi-blocks', suspensions: SuspensionRow[] = ROWS) {
  return renderToStaticMarkup(
    <AbusingClient
      tab={tab}
      counts={{ suspensions: 1, poiBlocks: 0 }}
      suspensions={suspensions}
      poiBlocks={[]}
      listTotal={suspensions.length}
      page={1}
      totalPages={1}
    />
  )
}

describe('AbusingClient — 이용 정지 탭', () => {
  const html = render('suspensions')

  it('탭 이름은 «이용 정지»이고 진행 중 건수가 붙으며 옛 «섀도우밴» 탭은 없다', () => {
    expect(html).toContain('이용 정지')
    expect(html).toContain('href="/admin/abusing?tab=suspensions"')
    expect(html).not.toContain('tab=bans')
    expect(html).not.toContain('>섀도우밴<')
  })

  it('걸기 폼에 사유 입력과 «유저에게 그대로 보여요» 안내가 있다', () => {
    expect(html).toContain('이용 정지 걸기')
    expect(html).toContain('placeholder="정지 사유 (필수)"')
    expect(html).toContain('유저에게 그대로 보여요')
    expect(html).toContain('aria-describedby="suspension-reason-hint"')
    expect(html).toContain('id="suspension-reason-hint"')
  })

  it('레벨 선택(Soft/Hard)과 네이티브 select가 없다', () => {
    expect(html).not.toContain('Soft-ban')
    expect(html).not.toContain('Hard-ban')
    expect(html).not.toContain('<select')
  })

  it('이력 표가 사유·정지 중 표시·푼 기록을 보인다', () => {
    expect(html).toContain('GPS 조작이 반복돼서 정지했어요.')
    expect(html).toContain('정지 중')
    expect(html).toContain('소명 확인 후 해제')
    expect(html).toContain('ops@jam.test')
    expect(html).toContain('풀기') // 진행 중인 줄에만 있다
    expect(html.match(/>풀기</g)).toHaveLength(1)
  })

  it('이력이 없으면 빈 상태 문구가 보인다', () => {
    expect(render('suspensions', [])).toContain('조건에 맞는 이용 정지가 없어요.')
  })

  it('한국어 줄바꿈 클래스가 붙은 안내 문구가 있다', () => {
    expect(html).toMatch(/id="suspension-reason-hint" class="[^"]*break-keep[^"]*wrap-break-word/)
  })
})

describe('AbusingClient — 탭 구성 («정책 설정» 탭은 밸런스 설정으로 옮겼다)', () => {
  for (const tab of ['suspensions', 'poi-blocks'] as const) {
    const html = render(tab)

    it(`${tab} 탭: 탭은 이용 정지·장소 블록 둘이고 «정책 설정» 탭이 없다`, () => {
      expect(html).toContain('href="/admin/abusing?tab=suspensions"')
      expect(html).toContain('href="/admin/abusing?tab=poi-blocks"')
      expect(html.match(/href="\/admin\/abusing\?tab=/g)).toHaveLength(2)
      expect(html).not.toContain('정책 설정')
      expect(html).not.toContain('tab=policy')
      expect(html).not.toContain('tab=bans')
    })

    it(`${tab} 탭: 기준값 입력칸(숫자 칸)과 «정책 저장» 버튼이 없다`, () => {
      expect(html).not.toContain('type="number"')
      expect(html).not.toContain('정책 저장')
      for (const label of ['이동 속도 임계값', '하루 누적 이동거리 상한', '차량 속도 필터', '교통수단 감지', '종목 불일치', '장소 블록 지속 시간']) {
        expect(html, label).not.toContain(label)
      }
    })
  }

  it('머리말은 장소 GPS 조작 감지와 이용 정지를 말하고 줄바꿈 클래스가 붙는다', () => {
    const html = render('suspensions')
    expect(html).toContain('장소 GPS 조작 감지 + 이용 정지')
    expect(html).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word[^"]*"[^>]*>장소 GPS 조작 감지 \+ 이용 정지/)
  })

  it('장소 블록 탭은 이용 정지 걸기 폼 없이 장소 블록 표를 보인다', () => {
    const html = render('poi-blocks')
    expect(html).not.toContain('이용 정지 걸기')
    expect(html).toContain('조건에 맞는 장소 블록이 없어요.')
  })
})
