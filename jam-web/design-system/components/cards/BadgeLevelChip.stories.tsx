import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeLevelChip } from './BadgeLevelChip';
import { RarityBadge } from './RarityBadge';

const meta: Meta<typeof BadgeLevelChip> = {
  title: 'MODULAR/Cards/BadgeLevelChip',
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
          '`RarityBadge`는 서비스 9곳이 쓴다 — 비파괴로만 둔다). 색은 `--color-secondary` 채움 + ' +
          '흰 텍스트로 카드 `#1a1a1a` 위에서 **5.86:1**(AA 통과). 폭은 52px 고정 — 계열 카드 ' +
          '1행 그리드 `[52px 칩][1fr 이름][auto 카운터]`에서 이름 시작 x를 모든 계열에 맞추기 위해서다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeLevelChip>;

export const Default: Story = { args: { level: 3 } };

export const LevelRange: Story = {
  name: '자릿수가 늘어도 폭이 흔들리지 않는다 (Lv.1 ~ Lv.128)',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      {[1, 8, 42, 128].map((lv) => (
        <BadgeLevelChip key={lv} level={lv} />
      ))}
    </div>
  ),
};

/**
 * 레벨형과 등급형은 **다른 칩**이다. v5 데이터에서 레벨형은 `rarity`가 NULL이라
 * `RarityBadge`가 아무것도 그리지 않고, 반대로 등급형은 `level`이 없다.
 */
export const VersusRarityBadge: Story = {
  name: '등급 칩과 나란히 — 축이 다르다',
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span data-testid="level-chip"><BadgeLevelChip level={5} /></span>
      <span data-testid="rarity-chip"><RarityBadge rarity="epic" /></span>
      {/* 레벨형에 등급 칩을 태우면 아무것도 안 그린다(v5: rarity가 NULL) */}
      <span data-testid="rarity-null"><RarityBadge rarity={null} /></span>
    </div>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('[data-testid="level-chip"]')?.textContent).toBe('Lv.5');
    expect(canvasElement.querySelector('[data-testid="rarity-chip"]')?.textContent).toBe('Epic');
    expect(canvasElement.querySelector('[data-testid="rarity-null"]')?.textContent?.trim()).toBe('');
  },
};

export const NoLevel: Story = {
  name: 'level=null — 아무것도 그리지 않는다',
  render: () => (
    <div data-testid="empty" style={{ minHeight: 20, minWidth: 60 }}>
      <BadgeLevelChip level={null} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('[data-testid="empty"]')?.textContent?.trim()).toBe('');
  },
};
