import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeLevelChip } from './BadgeLevelChip';

const meta: Meta<typeof BadgeLevelChip> = {
  title: 'UI/Cards/BadgeLevelChip',
  component: BadgeLevelChip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '무한레벨형 배지의 «Lv.N» 칩 — 티켓 20260905_0036. `RarityBadge`에 분기를 넣지 않고 ' +
          '별도 컴포넌트로 뺐다: `RarityBadge`는 «등급»(Common~Mystic)을 그리는 컴포넌트이고, ' +
          'v5 무한레벨형 193종은 `rarity`가 **NULL**이고 `level`만 있다. 서로 다른 축이라 한 ' +
          '컴포넌트에 합치면 "등급 칩인데 등급이 없다"는 모순이 API에 남는다(게다가 ' +
          '`RarityBadge`는 서비스 9곳이 쓴다 — 비파괴로만 둔다). 색은 중립 칩 — `--default-soft` 채움 + ' +
          '`--foreground` 글자. 폭은 52px 고정 — 계열 카드 ' +
          '1행 그리드 `[52px 칩][1fr 이름][auto 카운터]`에서 이름 시작 x를 모든 계열에 맞추기 위해서다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeLevelChip>;

/** 홈 피드(`FeedSection`)와 미션 목록(`MissionsListClient`)의 행 안 레벨 칩 — 12px 글자 · 높이 20px */
export const RowSize: Story = {
  name: '행 안 칩 — row',
  render: () => (
    <span data-testid="row">
      <BadgeLevelChip level={7} size="row" />
    </span>
  ),
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-testid="row"] span') as HTMLElement;
    expect(getComputedStyle(el).fontSize).toBe('12px');
    expect(el.getBoundingClientRect().height).toBeCloseTo(20, 0);
    expect(el.textContent).toBe('Lv.7');
  },
};

/** 세 자리 레벨도 폭 52px 안에 들어간다(행 안 칩 기준) */
export const RowSizeWide: Story = {
  name: '행 안 칩 — Lv.128',
  render: () => (
    <span data-testid="row-long">
      <BadgeLevelChip level={128} size="row" />
    </span>
  ),
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-testid="row-long"] span') as HTMLElement;
    expect(el.getBoundingClientRect().width).toBeCloseTo(52, 0);
  },
};

/** 배지 상세의 제목 박스(`TicketTitleBoxes`)·히어로(`BadgeHeroSection`)·획득 연출의 레벨 칩 — 12px 글자 · 높이 20px */
export const MdSize: Story = {
  name: '상세 칩 — md',
  render: () => (
    <span data-testid="md">
      <BadgeLevelChip level={7} size="md" />
    </span>
  ),
  play: async ({ canvasElement }) => {
    const el = canvasElement.querySelector('[data-testid="md"] span') as HTMLElement;
    expect(getComputedStyle(el).fontSize).toBe('12px');
    expect(el.getBoundingClientRect().height).toBeCloseTo(20, 0);
  },
};
