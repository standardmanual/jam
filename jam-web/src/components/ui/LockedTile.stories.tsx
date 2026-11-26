import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { LockedTile } from './LockedTile';

const meta: Meta<typeof LockedTile> = {
  title: 'UI/Cards/LockedTile',
  component: LockedTile,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '잠긴 아이템 배지의 «잠금 타일» — 티켓 20261018_0054 2회. 한 변 `size`, `--radius-2xl`, 면 `--card-bg`(흰색), 외곽선 없음, ' +
          '가운데 `LockIcon`(`--muted`). 같은 모양이 BadgeRevealCarousel · BadgeGridCard(`locked`) · 잠긴 상세 세 곳에서 나온다. ' +
          '등급 색·그라데이션·글로우는 없다(등급은 칩 하나로만 전달). 장식이라 `aria-hidden`이다.',
      },
    },
  },
  argTypes: { size: { control: { type: 'number', min: 40, max: 240 } } },
};

export default meta;
type Story = StoryObj<typeof LockedTile>;

/** 잠긴 아이템 배지 상세(`LockedItemDetail`)의 히어로 자리. 회색 바탕 위에서 흰 타일이 면 대비로 구분된다(외곽선 없음). */
export const Default: Story = {
  name: '상세 히어로 — 200px',
  render: () => (
    <div data-testid="surface" style={{ background: 'var(--background)', padding: 16 }}>
      <LockedTile size={200} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tile = canvasElement.querySelector<HTMLElement>('[data-testid="surface"] > div')!;
    expect(tile).toBeTruthy();
    expect(Math.round(tile.getBoundingClientRect().width)).toBe(200);
    expect(Math.round(tile.getBoundingClientRect().height)).toBe(200);
    expect(tile.getAttribute('aria-hidden')).toBe('true');
    expect(tile.querySelector('svg')).toBeTruthy();
    expect(getComputedStyle(tile).borderTopWidth).toBe('0px');
  },
};

/** 미션 상세(`MissionDetailClient`)의 잠긴 보상 행 앞쪽 작은 타일 */
export const MissionLead: Story = {
  name: '미션 보상 행 — 48px',
  render: () => (
    <div style={{ background: 'var(--surface)', padding: 16 }}>
      <LockedTile size={48} />
    </div>
  ),
};

/** 부모가 `size`보다 좁으면 정사각형을 유지한 채 줄어든다(`BadgeGridCard`의 3열 격자, 320px 화면). */
export const NarrowParent: Story = {
  name: '좁은 부모 — 정사각형 유지',
  render: () => (
    <div data-testid="narrow" style={{ width: 66, background: 'var(--surface)' }}>
      <LockedTile size={90} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tile = canvasElement.querySelector<HTMLElement>('[data-testid="narrow"] > div')!;
    const rect = tile.getBoundingClientRect();
    expect(Math.round(rect.width)).toBe(66);
    expect(Math.round(rect.height)).toBe(66);
  },
};
