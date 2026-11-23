import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'
import ChipTitle from './ChipTitle'

/**
 * 제목 속 칩 `ChipTitle` (티켓 20261120_2144, 상위 20261120_2026 3회차-2). 서비스 전용(홈피드 한정).
 * 제목 문자열은 그대로 두고, 칩으로 만들 낱말(최대 2개)을 따로 받아 그 자리를 칩으로 감싼다. 칩이 있으면 제목 줄 높이가 칩만큼 커진다.
 * 낱말이 제목에 없거나 목록이 비면 글자로만 그린다.
 */

const meta: Meta<typeof ChipTitle> = {
  title: '서비스/Today/ChipTitle',
  component: ChipTitle,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '제목 속 칩. 낱말 쪼개기 규칙(최대 2개·없는 낱말 무시·중복·겹침)은 `lib/today/titleChips.ts`에 있다. 칩 색은 낱말마다 색 키로 받는다. 서비스 전용 컴포넌트라 MODULAR이 아니다.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

function Case({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <section className="mb-6 w-[328px] max-w-full">
      <p className="mb-2 text-sm text-muted break-keep wrap-break-word">{caption}</p>
      <div className="rounded-xl bg-card-bg p-4">{children}</div>
    </section>
  )
}

const TITLE_CLASS = 'text-2xl font-bold text-foreground'

/** 칩 1개와 2개. 칩 색은 낱말마다 다르다. */
export const WithChips: Story = {
  name: '칩 있음 — 1개 · 2개',
  render: () => (
    <>
      <Case caption="낱말 1개">
        <ChipTitle title="이번 주말 문경에서 달려요" words={['문경']} size="sm" colors={['green']} className={TITLE_CLASS} />
      </Case>
      <Case caption="낱말 2개 — 색이 낱말마다 다르다">
        <ChipTitle
          title="문경새재 걷고 완주 배지 받기"
          words={['문경새재', '완주']}
          size="sm"
          colors={['blue', 'pink']}
          tilts={[-6, 6]}
          className={TITLE_CLASS}
        />
      </Case>
    </>
  ),
}

/** 큰 칩과 작은 칩. 칩이 줄 높이를 밀어 올린다. */
export const Sizes: Story = {
  name: '큰 칩 · 작은 칩',
  render: () => (
    <>
      <Case caption="큰 칩(40px)">
        <ChipTitle title="한강 러닝 챌린지 시작" words={['러닝']} size="lg" colors={['yellow']} className={TITLE_CLASS} />
      </Case>
      <Case caption="작은 칩(32px)">
        <ChipTitle title="한강 러닝 챌린지 시작" words={['러닝']} size="sm" colors={['yellow']} className={TITLE_CLASS} />
      </Case>
    </>
  ),
}

/** 칩이 없을 때: 목록이 비었을 때, 낱말이 제목에 없을 때. 둘 다 글자로만 그린다. */
export const WithoutChips: Story = {
  name: '칩 없음 — 목록이 빔 · 낱말이 제목에 없음',
  render: () => (
    <>
      <Case caption="목록이 비었다">
        <ChipTitle title="이번 주말 문경에서 달려요" words={[]} className={TITLE_CLASS} />
      </Case>
      <Case caption="낱말이 제목에 없다(무시)">
        <ChipTitle title="이번 주말 문경에서 달려요" words={['부산']} className={TITLE_CLASS} />
      </Case>
    </>
  ),
}

/** 줄바꿈이 생기는 긴 제목. 칩은 쪼개지지 않고 통째로 다음 줄로 넘어간다. */
export const LongTitle: Story = {
  name: '줄바꿈이 있는 긴 제목',
  render: () => (
    <Case caption="328px 폭에서 두 줄 이상">
      <ChipTitle
        title="성수동 골목을 천천히 걸으며 숨은 가게를 찾아보는 주말 탐험"
        words={['성수동', '탐험']}
        size="sm"
        colors={['yellow', 'red']}
        className={TITLE_CLASS}
      />
    </Case>
  ),
}
