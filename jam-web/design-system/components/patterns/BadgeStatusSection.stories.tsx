import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect, userEvent } from 'storybook/test';
import { BadgeStatusSection } from './BadgeStatusSection';
import { BadgeLevelGauge } from './BadgeLevelGauge';
import { BadgeStampRow } from './BadgeStampRow';

const meta: Meta<typeof BadgeStatusSection> = {
  title: 'MODULAR/Patterns/BadgeStatusSection',
  component: BadgeStatusSection,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '배지 트리의 상태 섹션 하나 — 티켓 20260905_0036. 트리는 **「다음 목표」와 「받은 배지」 ' +
          '둘뿐**이다: 설계상의 분류(누적형·주기형·기록형…)는 발급 엔진의 사정이지 사용자의 ' +
          '질문이 아니라 화면에 노출하지 않는다. 접힘 상태에서도 **개수를 노출**해 숨은 콘텐츠에 ' +
          '힌트를 준다. 펼쳤을 때만 본문을 렌더하므로(display:none이 아니다) 호출부는 ' +
          '`onOpenChange`가 true로 올 때만 그 섹션의 진행 계산을 요청하면 된다 — 194계열을 ' +
          '전부 계산하지 않는다. DS `Accordion`을 쓰지 않은 이유는 그 API가 **「한 번에 하나만 ' +
          '열림」**이기 때문이다: 여기서는 두 섹션이 각각 독립으로 접히고 펼쳐진다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeStatusSection>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

export const TwoSections: Story = {
  name: '두 섹션 — 각각 독립으로 접힌다',
  render: () => (
    <Frame>
      <BadgeStatusSection title="다음 목표" count={7} defaultOpen>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
          <BadgeLevelGauge name="걸어온 거리" level={3} current="52.4" next="75km" left="22.6km 남음" fraction={0.7} />
          <BadgeStampRow name="이번 주의 약속" rarity="rare" count={null} caption="8회 반복하면 받아요" earned={false} />
        </div>
      </BadgeStatusSection>
      <BadgeStatusSection title="받은 배지" count={23}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12 }}>
          <BadgeStampRow name="스물넷의 산책" rarity="mystic" count={12} caption="24시간 안에 3회" />
        </div>
      </BadgeStatusSection>
    </Frame>
  ),
};

export const CollapsedShowsCount: Story = {
  name: '접힘 상태에서도 개수를 노출한다',
  render: () => (
    <Frame>
      <div data-testid="section">
        <BadgeStatusSection title="받은 배지" count={23}>
          <p data-testid="body">본문</p>
        </BadgeStatusSection>
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-testid="section"]')!;
    expect(root.textContent).toContain('받은 배지');
    expect(root.textContent).toContain('23');
    // 접힌 동안에는 본문이 «아예 렌더되지 않는다» — display:none으로 숨기면 본문에 붙은
    // 진행 계산 요청이 그대로 돌아 "펼친 섹션만 계산"이 성립하지 않는다.
    expect(root.querySelector('[data-testid="body"]')).toBeNull();
  },
};

/**
 * 펼쳤을 때만 본문이 생긴다 — `onOpenChange(true)`가 진행 계산 요청 신호다.
 */
export const LazyBodyOnExpand: Story = {
  name: '펼친 섹션만 본문을 렌더한다 (진행 계산 절감)',
  render: function LazyBody() {
    const [opened, setOpened] = React.useState<boolean[]>([]);
    return (
      <Frame>
        <div data-testid="section">
          <BadgeStatusSection title="다음 목표" count={7} onOpenChange={(o) => setOpened((prev) => [...prev, o])}>
            <p data-testid="body" style={{ margin: 0, color: 'var(--color-text)' }}>진행 계산 결과</p>
          </BadgeStatusSection>
        </div>
        <p data-testid="log" style={{ fontSize: 12, color: '#b2b2b2' }}>{opened.join(',')}</p>
      </Frame>
    );
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-testid="section"]')!;
    expect(root.querySelector('[data-testid="body"]')).toBeNull();
    await userEvent.click(root.querySelector('button')!);
    expect(root.querySelector('[data-testid="body"]')).not.toBeNull();
    expect(canvasElement.querySelector('[data-testid="log"]')?.textContent).toBe('true');
  },
};

export const Empty: Story = {
  name: '펼쳤는데 비어 있을 때',
  render: () => (
    <Frame>
      <BadgeStatusSection title="받은 배지" count={0} defaultOpen emptyText="아직 받은 배지가 없어요" />
    </Frame>
  ),
};
