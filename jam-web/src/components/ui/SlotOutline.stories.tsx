import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect, waitFor } from 'storybook/test';
import { SlotOutline } from './SlotOutline';

const SAMPLE = '/badges/sample/s331.png';

const meta: Meta<typeof SlotOutline> = {
  title: 'UI/Cards/SlotOutline',
  component: SlotOutline,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '슬롯 칸의 «점선 외곽선» — 티켓 20261112_1627. 이미지는 그리지 않고 이미지 알파 윤곽을 따라가는 점선 SVG 한 장만 그린다. ' +
          '`--muted` 불투명 2px, 선 3 · 간격 4, `vector-effect: non-scaling-stroke`(칸이 줄어도 굵기 · 점선 길이 그대로). 움직이지 않는다. ' +
          '화면 근처에 들어올 때 추적을 시작하고 이미지당 한 번만 추적한다. 추적 실패 · 주소 없음이면 fallback="box"는 둥근 사각형 점선, "none"은 아무것도 그리지 않는다.',
      },
    },
  },
  argTypes: {
    fallback: { control: 'select', options: ['box', 'none'] },
    size: { control: { type: 'number', min: 40, max: 240 } },
    inset: { control: { type: 'number', min: 0, max: 16 } },
  },
};

export default meta;
type Story = StoryObj<typeof SlotOutline>;

const Surface = ({ children, width = 90 }: { children: React.ReactNode; width?: number }) => (
  <div data-testid="surface" style={{ width, background: 'var(--card-bg)', borderRadius: 'var(--radius-2xl)' }}>
    {children}
  </div>
);

/** 컬렉션 격자(`BadgeGridCard`)에서 후보가 없는 칸 — 이미지 윤곽을 따라가는 점선 path가 150ms 페이드로 나타난다. 이미지는 그리지 않는다. */
export const Traced: Story = {
  name: '추적 성공 — 윤곽 점선',
  render: () => (
    <Surface>
      <SlotOutline src={SAMPLE} label="한강 마스터 윤곽" />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')!;
    await waitFor(() => expect(svg.getAttribute('data-outline-state')).toBe('ready'));
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('d')).toMatch(/^M[\d. L]+Z/);
    expect(path.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    const style = getComputedStyle(path);
    expect(style.strokeDasharray.replace(/px/g, '')).toBe('3, 4');
    expect(style.strokeWidth).toBe('2px');
    expect(style.fill).toBe('none');
    expect(canvasElement.querySelector('img')).toBeNull();
    expect(svg.getAttribute('role')).toBe('img');
  },
};

/** 컬렉션 격자(`BadgeGridCard`)의 후보 없는 칸 — 주소가 없으면 둥근 사각형 점선(inset 4, 반경 12). 가진 게 없는 칸이 버그처럼 보이지 않게 한다. */
export const FallbackBox: Story = {
  name: '추적 실패 · 주소 없음 — 둥근 사각형 점선',
  render: () => (
    <Surface>
      <SlotOutline src={null} fallback="box" />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')!;
    expect(svg.getAttribute('data-outline-state')).toBe('box');
    const rect = svg.querySelector('rect')!;
    expect(rect.getAttribute('x')).toBe('4');
    expect(rect.getAttribute('rx')).toBe('12');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  },
};

/** 컬렉션 격자(`BadgeGridCard`)에서 이미지가 함께 보이는 칸(넣을 수 있는 칸)은 실패해도 사각형을 그리지 않는다. */
export const FallbackNone: Story = {
  name: '추적 실패 — 아무것도 그리지 않음',
  render: () => (
    <Surface>
      <SlotOutline src={null} fallback="none" />
    </Surface>
  ),
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg')!;
    expect(svg.getAttribute('data-outline-state')).toBe('none');
    expect(svg.querySelector('path, rect')).toBeNull();
  },
};
