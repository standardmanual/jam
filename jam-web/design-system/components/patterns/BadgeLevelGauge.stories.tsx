import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeLevelGauge } from './BadgeLevelGauge';

const WALK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M400-40 320-160l40-320-80 40-40 160-80-20 60-240 200-80 60 100 120 40v100l-100-20-40 140 80 300h-100Z"/></svg>'
  );

const meta: Meta<typeof BadgeLevelGauge> = {
  title: 'MODULAR/Patterns/BadgeLevelGauge',
  component: BadgeLevelGauge,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '무한레벨형 계열 한 줄 — 티켓 20260905_0036. v5는 194계열 630종이고 그중 무한레벨형이 ' +
          '193종이다. 레벨을 눈금으로 늘어놓으면 계열 하나가 Lv.1~8(현재 시딩 범위)만으로도 ' +
          '화면 한 페이지를 먹고, 레벨 상한이 없으니 앞으로 더 늘어난다. **그래서 이 ' +
          '컴포넌트는 레벨 수와 무관하게 높이가 고정이다** — 지나온 레벨을 하나도 그리지 않고 ' +
          '「지금 레벨 · 다음 목표 · 남은 양」만 말한다. `condition`·`metric`을 받지 않는다: ' +
          '배지 이름이 지표를 말하고(“걸어온 거리”) 값 행이 조건을 말한다. 값 행 그리드 ' +
          '`[5ch][auto][1fr][auto]`의 요점은 **현재값 5ch 우측 정렬** — 자릿수가 달라도 `/` ' +
          '구분자가 세로로 정렬된다. 진행 바는 `ProgressBar fillMode="track-gradient"`.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeLevelGauge>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 375, background: '#1a1a1a', padding: 16, borderRadius: 16 }}>{children}</div>;
}

// v5 실데이터 — walking:L1 "걸어온 거리"(누적 거리 5/15/40/75…km), walking:L2 "걸은 날들"
export const Default: Story = {
  name: '기본 — 걸어온 거리 Lv.3 → Lv.4',
  render: () => (
    <Frame>
      <BadgeLevelGauge name="걸어온 거리" level={3} current="52.4" next="75km" left="22.6km 남음" fraction={52.4 / 75} />
    </Frame>
  ),
};

/**
 * **높이 고정**이 이 컴포넌트의 존재 이유다. Lv.1과 Lv.128이 같은 높이여야 194계열이 한
 * 화면에 스캔된다 — 지나온 레벨을 렌더하지 않으므로 레벨 수는 높이에 전혀 영향을 주지 않고,
 * 계열 이름도 1줄 말줄임이라 이름 길이로도 흔들리지 않는다.
 */
export const FixedHeightAcrossLevels: Story = {
  name: '레벨 수·이름 길이와 무관하게 높이 고정',
  render: () => (
    <Frame>
      <div data-testid="gauges" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeLevelGauge name="걸어온 거리" level={1} current="3.2" next="5km" left="1.8km 남음" fraction={3.2 / 5} />
        <BadgeLevelGauge name="달려온 거리" level={8} current="1840" next="2400km" left="560km 남음" fraction={1840 / 2400} />
        <BadgeLevelGauge
          name="아주 길고 긴 계열 이름이 들어와도 한 줄로 말줄임 처리된다"
          level={128}
          current="98120"
          next="100000km"
          left="1880km 남음"
          fraction={0.98}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const rows = Array.from(canvasElement.querySelectorAll('[data-testid="gauges"] > div')) as HTMLElement[];
    expect(rows.length).toBe(3);
    const heights = rows.map((r) => r.getBoundingClientRect().height);
    // 레벨 1 · 8 · 128, 짧은 이름 · 아주 긴 이름 — 전부 같은 높이여야 한다.
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  },
};

/**
 * 값 행의 요점 — 현재값을 5ch 우측 정렬해 자릿수가 달라도 `/`가 세로로 정렬된다.
 * (레일·게이지가 세로로 쌓이는 트리에서 이 정렬 하나가 스캔 비용을 크게 줄인다)
 */
export const SlashAlignment: Story = {
  name: '값 행 — `/` 세로 정렬 (자릿수 1~5)',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeLevelGauge name="걸은 날들" level={1} current="2" next="3일" left="1일 남음" fraction={2 / 3} />
        <BadgeLevelGauge name="걸어온 거리" level={2} current="38.5" next="40km" left="1.5km 남음" fraction={38.5 / 40} />
        <BadgeLevelGauge name="달려온 거리" level={7} current="12840" next="15000km" left="2160km 남음" fraction={12840 / 15000} />
      </div>
    </Frame>
  ),
};

export const Complete: Story = {
  name: '다 채움 — 현재값이 라임(--status-done-solid)으로 바뀐다',
  render: () => (
    <Frame>
      <BadgeLevelGauge name="걸은 날들" level={4} current="40" next="40일" left="달성" fraction={1} />
    </Frame>
  ),
};

export const NoLevelYet: Story = {
  name: 'Lv.1도 못 받은 상태 — 칩 없음, 이름 시작 x는 그대로',
  render: () => (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BadgeLevelGauge name="달려온 거리" level={null} current="6.4" next="20km" left="13.6km 남음" fraction={6.4 / 20} />
        <BadgeLevelGauge name="걸어온 거리" level={1} current="8.0" next="15km" left="7km 남음" fraction={8 / 15} />
      </div>
    </Frame>
  ),
};

/**
 * 회귀 고정 — 다음 레벨 배지는 정의상 미획득이라 **원본 이미지를 `grayscale(1)`로** 그린다
 * (2026-09-06 확정). `imageUrl`을 넘기지 않으면 중성 자리 표시만 나온다.
 */
export const GrayscaleNextLevel: Story = {
  name: '회귀 — 다음 레벨 배지는 그레이 원본',
  render: () => (
    <Frame>
      <div data-testid="gauge">
        <BadgeLevelGauge
          name="걸어온 거리"
          level={3}
          current="52.4"
          next="75km"
          left="22.6km 남음"
          fraction={0.7}
          imageUrl={WALK_ICON}
        />
      </div>
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const gauge = canvasElement.querySelector('[data-testid="gauge"]')!;
    const img = gauge.querySelector('img');
    expect(img).not.toBeNull();
    expect(getComputedStyle(img!).filter).toContain('grayscale');
  },
};
