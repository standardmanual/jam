import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'MODULAR/Feedback/ProgressBar',
  component: ProgressBar,
  parameters: { layout: 'centered' },
  argTypes: {
    labelType: { control: 'radio', options: ['none', 'percent', 'fraction'] },
    labelPosition: { control: 'radio', options: ['inline', 'top'] },
  },
};

export default meta;
type Story = StoryObj<typeof ProgressBar>;

/** ①단독 — 바만, 부가 텍스트 없음 (MissionStatusClient 랭킹 바 케이스) */
export const Standalone: Story = {
  name: '단독',
  args: { percent: 45, labelType: 'none' },
  render: (args) => <div style={{ width: 280 }}><ProgressBar {...args} /></div>,
};

/** ②바 + 퍼센트 — 미션 진행 60% (MissionDetailClient 실측값) */
export const WithPercent: Story = {
  name: '+ 퍼센트',
  args: { percent: 60, labelType: 'percent' },
  render: (args) => <div style={{ width: 280 }}><ProgressBar {...args} /></div>,
};

/** ③바 + n/n — 컬렉션 슬롯 3/10 (ItemBookHeroSection 실측값) */
export const WithFraction: Story = {
  name: '+ n/n',
  args: { current: 3, total: 10, labelType: 'fraction' },
  render: (args) => <div style={{ width: 280 }}><ProgressBar {...args} /></div>,
};

/** ④radius 오버라이드 — 3px(임의값), 순위 그라데이션 (MissionStatusClient 랭킹 바 실측값) */
export const RadiusOverride: Story = {
  name: 'radius 오버라이드',
  args: {
    percent: 78,
    labelType: 'none',
    height: 6,
    color: 'linear-gradient(90deg, #00CC66, #33E580)',
    trackColor: 'var(--color-surface-elevated)',
    radius: '3px',
  },
  render: (args) => <div style={{ width: 280 }}><ProgressBar {...args} /></div>,
};

export const AllVariants: Story = {
  name: '전체 변형',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: 280 }}>
      <ProgressBar percent={45} labelType="none" />
      <ProgressBar percent={60} labelType="percent" />
      <ProgressBar current={3} total={10} labelType="fraction" />
    </div>
  ),
};

export const RealServiceContext: Story = {
  name: '실사용 맥락',
  render: () => (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 20, width: 320,
      padding: 'var(--layout-card-padding)', background: 'var(--color-surface)',
      borderRadius: 'var(--radius-card)',
    }}>
      {/* MissionDetailClient — streak 미션 8일 중 5일, 60% */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 'var(--text-small)', color: 'var(--color-text-secondary)' }}>
          8일 중 5일
        </p>
        <ProgressBar current={5} total={8} percent={60} labelType="percent" labelPosition="top" />
      </div>
      {/* ItemBookHeroSection — 컬렉션 슬롯 3/10 */}
      <ProgressBar current={3} total={10} labelType="fraction" />
      {/* MissionStatusClient — 랭킹 바, 색상 오버라이드(그라데이션) + radius 3px 예시 */}
      <ProgressBar
        percent={78}
        labelType="none"
        height={6}
        color="linear-gradient(90deg, #00CC66, #33E580)"
        trackColor="var(--color-surface-elevated)"
        radius="3px"
      />
    </div>
  ),
};

/**
 * fillMode="track-gradient" — 트랙 기준 그라데이션 (티켓 20260905_0036).
 *
 * 기본 'solid'는 단색 fill의 **폭**을 늘린다. 그래서 `color`에 그라데이션 문자열을 넣으면
 * 그라데이션이 fill 안에서 압축돼 진행률이 10%든 90%든 늘 같은 그림이 보인다 —
 * 아래 두 줄을 나란히 보면 그 차이가 바로 읽힌다.
 * 'track-gradient'는 그라데이션을 트랙 전체 폭에 깔아 두고 `clip-path`의 `inset()`으로
 * 진행률만큼 잘라 보여준다(진행률은 인라인 커스텀 프로퍼티 하나로만 들어간다).
 *
 * **기본 동작은 그대로다** — 서비스 8곳 + `DualAxisGauge`가 이 컴포넌트를 쓰기 때문에
 * 새 표현은 반드시 새 prop으로만 켠다.
 */
export const TrackGradient: Story = {
  name: '트랙 기준 그라데이션 — fill 안 압축과 비교',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: 320 }}>
      {[20, 55, 90].map((pct) => (
        <div key={pct} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-text-secondary)' }}>{pct}%</span>
          <ProgressBar percent={pct} fillMode="track-gradient" trackColor="var(--status-idle-track)" height={6} radius="var(--radius-xs)" />
          {/* 비교용 — fill 안에서 압축되는 예전 방식 */}
          <ProgressBar
            percent={pct}
            color="linear-gradient(to right, var(--status-short-solid), var(--status-done-solid))"
            trackColor="var(--status-idle-track)"
            height={6}
            radius="var(--radius-xs)"
          />
        </div>
      ))}
    </div>
  ),
};
