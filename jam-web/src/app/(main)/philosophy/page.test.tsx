/**
 * /philosophy FAQ — 확률 안내·동기화 체크인·어뷰징 답변을 정책에 맞춤 (티켓 20261021_1250 1회, 운영 로직 18.3·16.1·1616줄 근처 동기화 판정)
 *
 * 고정하는 것:
 * - 「아이템은 어떻게 드랍되나요?」: 개수·등급을 숫자로 적지 않고 `/probability` 링크로 보낸다. «드랍이 없을 수도», «확률에 따라 드랍»이 없다.
 * - 「장소에서 배지를 받으려면」: 체크인 판정은 동기화 때 활동 경로로 한다. «지나가면 자동으로 체크인»이 없다.
 * - 「갑자기 배지나 아이템을 못 받는 것 같아요」: «보상만 조용히 줄어든다»와 에세이를 가리키는 문장이 없고, 걸러진 활동이 모든 보상에서 같게 빠진다고 쓴다. 임계값 수치가 없다.
 * - 수정 금지 원고(`SECTIONS` 에세이)는 그대로다. 에세이에 남은 «조용히 비워둡니다»는 정책과 어긋나지만 사용자가 새 원고를 줄 때까지 고치지 않는다.
 *
 * 서버 컴포넌트를 정적 렌더한다. 상단 바(Provider 필요)와 아코디언(클라이언트 상태)은 제목·본문을 그대로 그리는 대역으로 바꾼다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/philosophy/page.test.tsx"
 */
import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/components/ui/TopNav', () => ({ default: ({ title }: { title: string }) => <header>{title}</header> }))
vi.mock('./FaqAccordion', () => ({
  default: ({ items }: { items: Array<{ title: string; content: ReactNode }> }) => (
    <div>
      {items.map((item, i) => (
        <section key={i} data-faq={item.title}>
          <h3>{item.title}</h3>
          {item.content}
        </section>
      ))}
    </div>
  ),
}))

import PhilosophyPage from './page'

const html = renderToStaticMarkup(<PhilosophyPage />)
const textOf = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')

/** 질문 제목으로 FAQ 답변 하나의 마크업을 꺼낸다 */
function faq(title: string): string {
  const match = html.match(new RegExp(`<section data-faq="${title.replace(/[?]/g, '\\?')}"[^>]*>([\\s\\S]*?)</section>`))
  expect(match, `FAQ «${title}»를 찾지 못했다`).not.toBeNull()
  return match![1]
}

describe('FAQ — 아이템은 어떻게 드랍되나요?', () => {
  const answer = faq('아이템은 어떻게 드랍되나요?')

  it('개수와 등급 확률은 확률 안내에서 보라고 안내하고, 링크가 /probability로 간다', () => {
    expect(textOf(answer)).toContain('Strava 동기화를 하면 아이템 배지를 받을 수 있어요.')
    expect(textOf(answer)).toContain('개수와 등급 확률은 확률 안내에서 볼 수 있어요.')
    expect(answer).toMatch(/<a [^>]*href="\/probability"[^>]*>확률 안내<\/a>/)
    // 기존 개인정보처리방침 링크와 같은 서식
    expect(answer).toContain('class="underline underline-offset-2"')
  })

  it('숫자를 적지 않는다(설정이 바뀌면 낡는다). «드랍이 없을 수도»·«확률에 따라 드랍»이 없다', () => {
    expect(textOf(answer)).not.toMatch(/\d/)
    expect(textOf(answer)).not.toContain('드랍이 없을 수도')
    expect(textOf(answer)).not.toContain('확률에 따라')
  })
})

describe('FAQ — 장소에서 배지를 받으려면 어떻게 하나요?', () => {
  const text = textOf(faq('장소에서 배지를 받으려면 어떻게 하나요?'))

  it('체크인 판정이 동기화 때 활동 경로로 이뤄진다고 쓴다', () => {
    expect(text).toContain('동기화하면 활동 경로를 확인해서, 경로가 장소 반경을 지나갔다면 체크인돼요.')
    expect(text).toContain('체크인 배지를 받아요.')
    expect(text).toContain('따로 인증하거나 신청할 필요는 없어요.')
  })

  it('«지나가면 자동으로 체크인»이 없다', () => {
    expect(text).not.toContain('지나가면 자동으로')
    expect(text).not.toContain('지도에 표시된 장소 근처')
  })
})

describe('FAQ — 갑자기 배지나 아이템을 못 받는 것 같아요', () => {
  const text = textOf(faq('갑자기 배지나 아이템을 못 받는 것 같아요. 왜 그런가요?'))

  it('걸러진 활동이 모든 보상에서 같게 빠지고 보상만 따로 줄이지 않는다고 쓴다', () => {
    expect(text).toContain('자동으로 걸러져요.')
    expect(text).toContain('잼, 배지, 아이템 배지, 미션 어디에서도 똑같이 빠지고, 보상만 따로 줄이지는 않아요.')
    expect(text).toContain('아래 문의하기로 알려 주세요.')
  })

  it('«보상만 조용히 줄어든다»와 에세이를 가리키는 문장이 없고, 임계값 수치도 없다', () => {
    expect(text).not.toContain('조용히')
    expect(text).not.toContain('줄어들 수 있어요')
    expect(text).not.toContain('Philosophy에 담았어요')
    expect(text).not.toContain('위쪽')
    expect(text).not.toMatch(/\d/)
  })
})

describe('수정 금지 원고(SECTIONS 에세이)', () => {
  it('에세이 문단은 손대지 않았다 — 정책과 어긋나는 문장도 새 원고가 올 때까지 그대로 둔다', () => {
    const text = textOf(html)
    expect(text).toContain('"기록을 속이면 어떻게 되나요?" JAM을 만들며 가장 자주 듣는 질문입니다.')
    expect(text).toContain(
      '우리가 의심스러운 계정을 바로 차단하지 않는 이유입니다. 겉으로는 평소처럼 작동하되, 탐나는 보상만 조용히 비워둡니다. 꼼수를 쓰던 사람이 다른 꼼수를 찾지 못하도록. 무엇보다, 오해받은 정직한 분이 입을 상처를 줄이기 위해서입니다.'
    )
    expect(text).toContain('시스템의 실수로 억울하게 오해받은, 정직하게 땀 흘린 한 사람의 마음입니다.')
  })
})
