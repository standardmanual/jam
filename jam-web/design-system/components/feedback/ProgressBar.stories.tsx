import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { ProgressBar, PROGRESS_TRACK_GRADIENT } from './ProgressBar';

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
    trackColor: 'var(--surface)',
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
      padding: 'var(--layout-card-padding)', background: 'var(--background)',
      borderRadius: 'var(--radius-2xl)',
    }}>
      {/* MissionDetailClient — streak 미션 8일 중 5일, 60% */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
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
        trackColor="var(--surface)"
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
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{pct}%</span>
          <ProgressBar percent={pct} fillMode="track-gradient" trackColor="var(--progress-track)" height={6} radius="var(--radius-sm)" />
          {/* 비교용 — fill 안에서 압축되는 예전 방식 */}
          <ProgressBar
            percent={pct}
            color="linear-gradient(to right, var(--progress-short), var(--progress-done))"
            trackColor="var(--progress-track)"
            height={6}
            radius="var(--radius-sm)"
          />
        </div>
      ))}
    </div>
  ),
};

/**
 * 20260906_2140 — `PROGRESS_TRACK_GRADIENT`가 **CSS 토큰
 * `--progress-sweep`을 가리킨다.** 그라데이션 정의가 `colors.css` 한 군데에만 남는다.
 *
 * 왜 옮겼나: 배지 트리의 레일 연결선·진행 테두리는 JSX가 아니라 CSS 문자열 안에서 채움을
 * 그려 이 JS 상수를 import할 수 없었고, 그래서 한 화면에서 진행 표현이 셋으로 갈라져 있었다.
 *
 * ⚠️ 값이 `to right`(sRGB 보간) → `90deg in oklab`으로 바뀐다. amber↔lime은 인접 색상이라
 * 시각 변화는 미미하지만, 이 컴포넌트를 쓰는 서비스 8곳 + `DualAxisGauge`에 **실제로
 * 반영되는** 변경이다.
 */
export const TrackGradientToken: Story = {
  name: '20260906_2140 — 채움 스윕은 --progress-sweep 토큰 하나',
  render: () => (
    <div data-testid="bars" style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ProgressBar percent={20} fillMode="track-gradient" trackColor="var(--progress-track)" height={10} />
      <ProgressBar percent={60} fillMode="track-gradient" trackColor="var(--progress-track)" height={10} />
      <ProgressBar percent={100} fillMode="track-gradient" trackColor="var(--progress-track)" height={10} />
    </div>
  ),
  play: async () => {
    // 상수는 토큰만 가리킨다 — 색값을 여기서 다시 적지 않는다.
    expect(PROGRESS_TRACK_GRADIENT).toBe('var(--progress-sweep)');
  },
};

/**
 * outlined — 트랙 외곽선 (티켓 20261018_0054).
 *
 * `outlined`(기본 false)가 켜지면 트랙에 1px `--border`를 두고 `box-sizing: border-box`라서 `height`가 외곽선을 포함한다
 * (`height={10}`이면 채움이 그려지는 안쪽은 8px). 채움은 외곽선 안쪽에만 그려져 외곽선이 가려지지 않는다.
 * 기본 `trackColor`가 `--border`와 같은 색이라 외곽선이 보이려면 `trackColor`를 따로 정한다 —
 * 위 두 줄이 서비스 캡슐과 잠긴 아이템 배지가 쓰는 호출이다(`track-gradient`, `--background` 트랙, 라벨 없음).
 * 맨 아래 줄은 `outlined`를 생략한 기존 호출이고, 위 두 줄과 달리 외곽선이 없어야 한다.
 */
export const Outlined: Story = {
  name: 'outlined — 외곽선 있는 게이지, 기본 호출은 그대로',
  render: () => (
    <div
      data-testid="outlined-bars"
      style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12, padding: 16, background: 'var(--surface)' }}
    >
      <ProgressBar outlined percent={35} fillMode="track-gradient" trackColor="var(--background)" height={10} labelType="none" />
      <ProgressBar outlined percent={100} fillMode="track-gradient" trackColor="var(--background)" height={10} labelType="none" />
      <ProgressBar percent={35} fillMode="track-gradient" trackColor="var(--progress-track)" height={10} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tracks = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-testid="outlined-bars"] > div > div'));
    const [first, second, plain] = tracks.map((track) => getComputedStyle(track));
    expect(first.borderTopWidth).toBe('1px');
    expect(second.borderTopWidth).toBe('1px');
    // 기본 호출은 외곽선이 없다 — 기존 호출부가 그대로라는 근거
    expect(plain.borderTopWidth).toBe('0px');
    // border-box라 height 10이 외곽선을 포함한다
    expect(tracks[0].offsetHeight).toBe(10);
  },
};
