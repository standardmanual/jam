import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { BadgeSilhouette } from './BadgeSilhouette';

const meta: Meta<typeof BadgeSilhouette> = {
  title: 'MODULAR/Cards/BadgeSilhouette',
  component: BadgeSilhouette,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          '미획득 배지의 «외형 비공개» 표시 — 티켓 20260905_0036. 지금까지 미획득 배지는 원본 ' +
          '`imageUrl`을 그대로 `<img>`에 넣고 `filter: grayscale(1)`만 걸었는데, grayscale은 ' +
          '그려진 뒤 적용되는 CSS 필터라 **원본 URL이 그대로 네트워크에 나간다** — 네트워크 탭· ' +
          '직접 열기로 컬러 원본을 볼 수 있어 「아직 안 보여준다」가 성립하지 않았다. 이 ' +
          '컴포넌트는 배지별 이미지를 아예 요청하지 않고 모든 배지가 공유하는 공통 SVG 한 장을 ' +
          '`opacity .22`로 그린다. 어떤 배지인지는 조건 텍스트가 말한다. 색은 `currentColor` ' +
          '상속이라 새 토큰을 만들지 않는다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeSilhouette>;

function Frame({ children, size = 44 }: { children: React.ReactNode; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface)', color: 'var(--color-text)',
        boxShadow: 'inset 0 0 0 1px var(--color-border-light)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </span>
  );
}

export const Default: Story = {
  name: '기본 (44px 눈금 안)',
  render: () => <Frame><BadgeSilhouette size={30} /></Frame>,
};

export const Sizes: Story = {
  name: '크기별 — 레일 눈금 44 · 시트 56 · 게이지 64',
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Frame size={36}><BadgeSilhouette size={26} /></Frame>
      <Frame size={44}><BadgeSilhouette size={30} /></Frame>
      <Frame size={56}><BadgeSilhouette size={40} /></Frame>
      <Frame size={64}><BadgeSilhouette size={44} /></Frame>
    </div>
  ),
};

/**
 * 회귀 고정 — 이 컴포넌트는 **`<img>`를 만들지 않는다.** 여기서 `<img>`가 하나라도 생기면
 * 원본 URL이 다시 네트워크에 나가는 것이므로 「외형 비공개」가 깨진 것이다.
 */
export const NoNetworkRequest: Story = {
  name: '회귀 — <img>를 만들지 않는다',
  render: () => (
    <div data-testid="silhouette-root">
      <Frame><BadgeSilhouette size={30} /></Frame>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector('[data-testid="silhouette-root"]')!;
    expect(root.querySelectorAll('img').length).toBe(0);
    expect(root.querySelectorAll('svg').length).toBe(1);
    // 접근성: 실루엣은 모든 배지가 같은 그림이라 정보를 담지 않는다 — 항상 aria-hidden.
    expect(root.querySelector('[aria-hidden="true"]')).toBeTruthy();
  },
};
