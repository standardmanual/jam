import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { LockedTile } from './LockedTile';

const meta: Meta<typeof LockedTile> = {
  title: 'MODULAR/Cards/LockedTile',
  component: LockedTile,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '잠긴 아이템 배지의 «잠금 타일» — 티켓 20261018_0054 2회. 한 변 `size`, `--radius-2xl`, 면 `--background`, 1px `--border`, ' +
          '가운데 `LockIcon`(`--muted`). 같은 모양이 BadgeRevealCarousel · BadgeGridCard(`locked`) · 잠긴 상세 세 곳에서 나온다. ' +
          '등급 색·그라데이션·글로우는 없다(등급은 칩 하나로만 전달). 장식이라 `aria-hidden`이다.',
      },
    },
  },
  argTypes: { size: { control: { type: 'number', min: 40, max: 240 } } },
};

export default meta;
type Story = StoryObj<typeof LockedTile>;

/** 흰 면(`--surface`) 위에서 크림 타일의 1px `--border`가 경계를 맡는다. */
export const Default: Story = {
  name: '기본 — 90px',
  render: () => (
    <div data-testid="surface" style={{ background: 'var(--surface)', padding: 16 }}>
      <LockedTile size={90} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tile = canvasElement.querySelector<HTMLElement>('[data-testid="surface"] > div')!;
    expect(tile).toBeTruthy();
    expect(Math.round(tile.getBoundingClientRect().width)).toBe(90);
    expect(Math.round(tile.getBoundingClientRect().height)).toBe(90);
    expect(tile.getAttribute('aria-hidden')).toBe('true');
    expect(tile.querySelector('svg')).toBeTruthy();
    expect(getComputedStyle(tile).borderTopWidth).toBe('1px');
  },
};

export const Sizes: Story = {
  name: '크기 — 56 · 90 · 144',
  render: () => (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, background: 'var(--surface)', padding: 16 }}>
      <LockedTile size={56} />
      <LockedTile size={90} />
      <LockedTile size={144} />
    </div>
  ),
};

/** 부모가 `size`보다 좁으면 정사각형을 유지한 채 줄어든다(320px 화면의 3열 그리드). */
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
