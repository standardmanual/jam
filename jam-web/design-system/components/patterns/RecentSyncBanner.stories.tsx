import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { RecentSyncBanner } from './RecentSyncBanner';

const meta: Meta<typeof RecentSyncBanner> = {
  title: 'MODULAR/Patterns/RecentSyncBanner',
  component: RecentSyncBanner,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '직전 동기화 배너. 1차 범위는 boolean 이벤트만 표시(20260903_2329). ' +
          '3b(20260904_1425)에서 `comparisonMessage` prop을 얹어 user_family_progress 기반 ' +
          '"직전 상태값과의 비교" 문구를 표시한다 — 없으면 기본 `message`로 폴백. ' +
          '색은 --status-latest-solid(시안) 전용.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof RecentSyncBanner>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

export const Visible: Story = {
  name: '최근 동기화 있음',
  render: () => (
    <Frame>
      {/* comparisonMessage는 기본값을 두지 않는 prop이라(BadgeStageRail.jsx의 frontierProgress와
          동일한 이유) 항상 명시적으로 넘긴다 — null이면 기본 message로 표시된다. */}
      <RecentSyncBanner visible comparisonMessage={null} />
    </Frame>
  ),
};

export const CustomMessage: Story = {
  name: '메시지 커스텀',
  render: () => (
    <Frame>
      <RecentSyncBanner visible message="오늘 걷기 활동이 동기화됐어요" comparisonMessage={null} />
    </Frame>
  ),
};

export const Hidden: Story = {
  name: '최근 동기화 없음 (렌더 안 함)',
  render: () => (
    <Frame>
      <p style={{ color: '#929292', fontSize: 13 }}>visible=false면 아무것도 렌더하지 않습니다.</p>
      <RecentSyncBanner visible={false} comparisonMessage={null} />
    </Frame>
  ),
};

export const SyncComparisonMessage: Story = {
  name: '직전 상태값과의 비교 (3b)',
  render: () => (
    <Frame>
      <RecentSyncBanner visible comparisonMessage="직전 동기화보다 누적 거리 1.2km 가까워졌어요" />
    </Frame>
  ),
};

export const ComparisonFallback: Story = {
  name: '비교 문구 없음 → 기본 메시지로 폴백',
  render: () => (
    <Frame>
      <p style={{ color: '#929292', fontSize: 13 }}>
        comparisonMessage가 null(비교할 진전 없음)이면 message 기본값으로 자동 폴백합니다.
      </p>
      <RecentSyncBanner visible comparisonMessage={null} />
    </Frame>
  ),
};
