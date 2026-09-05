import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeStampRow } from './BadgeStampRow';

const meta: Meta<typeof BadgeStampRow> = {
  title: 'MODULAR/Patterns/BadgeStampRow',
  component: BadgeStampRow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '반복형 계열 한 줄 — 티켓 20260905_0036. 반복형(v5 139종)은 같은 조건을 몇 번 다시 ' +
          '채웠는지가 전부다("한 주에 3회"를 1·8·26·52회 반복). **누적 횟수는 `×N` 칩 하나로만 ' +
          '그린다 — 점 그리드를 쓰지 않는다.** 47회를 점 47개로 그리면 100회를 넘는 순간 의미를 ' +
          '잃고, 축약하면(한 점 = 5회 같은 식) 임의로 정한 기준이 화면에 그대로 드러난다. ' +
          '그리드는 `BadgeLevelGauge`와 같다 — 칩 자리 폭이 52px로 고정이라 레벨형·반복형이 ' +
          '섞여 있어도 이름 시작 x가 같다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeStampRow>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

// v5 실데이터 — walking "이번 주의 약속"(한 주에 3회 / 1·8·26·52회), "스물넷의 산책"
export const Default: Story = {
  name: '기본 — 이번 주의 약속 Rare, 누적 12회',
  render: () => (
    <Frame>
      <BadgeStampRow name="이번 주의 약속" rarity="rare" count={12} caption="한 주(월~일)에 3회" />
    </Frame>
  ),
};

/**
 * 횟수가 아무리 커져도 칩 하나뿐이라 줄 높이가 변하지 않는다 — 점 그리드였다면 여기서
 * 무너진다.
 */
export const CountScale: Story = {
  name: '1회 → 999회 — 칩 하나라 줄이 변하지 않는다',
  render: () => (
    <Frame>
      <div data-testid="rows" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="이번 주의 약속" rarity="common" count={1} caption="한 주(월~일)에 3회" />
        <BadgeStampRow name="이번 주의 약속" rarity="epic" count={47} caption="한 주(월~일)에 3회" />
        <BadgeStampRow name="이번 주의 약속" rarity="mystic" count={999} caption="한 주(월~일)에 3회" />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="rows"] > div')) as HTMLElement[];
    const heights = rows.map((r) => r.getBoundingClientRect().height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    // 누적은 칩 «하나»로만 — 점 그리드로 회귀하면 여기서 걸린다.
    expect(rows[1].textContent).toContain('×47');
  },
};

export const Unearned: Story = {
  name: '미획득 — 이름·칩·카운터에서 색을 거둔다',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="리듬 브레이커" rarity="rare" count={3} caption="3일 연속 서로 다른 시간대" />
        <BadgeStampRow name="리듬 브레이커" rarity="epic" count={null} caption="3회 반복하면 받아요" earned={false} />
      </div>
    </Frame>
  ),
};

export const AlignsWithLevelGauge: Story = {
  name: '레벨형과 섞여도 이름 시작 x가 같다 (칩 자리 52px 고정)',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeStampRow name="스물넷의 산책" rarity="mystic" count={12} caption="24시간 안에 3회" />
        <BadgeStampRow name="이번 주의 약속" rarity="common" count={1} caption="한 주(월~일)에 3회" />
      </div>
    </Frame>
  ),
};
