import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { TopNav } from './TopNav';
import { IconButton } from '../buttons/IconButton';

const meta: Meta<typeof TopNav> = {
  title: 'MODULAR/Navigation/TopNav',
  component: TopNav,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof TopNav>;

export const Default: Story = {
  args: { title: '페이지 제목', showBack: true },
};

export const NoBack: Story = {
  name: '뒤로가기 없음',
  args: { title: '홈', showBack: false },
};

export const WithRightSlot: Story = {
  name: '우측 슬롯',
  args: {
    title: '배지',
    showBack: true,
    rightSlot: <IconButton icon="search" label="검색" />,
  },
};

export const WithMultipleRight: Story = {
  name: '우측 슬롯 (복수)',
  args: {
    title: '인벤토리',
    showBack: true,
    rightSlot: (
      <div style={{ display: 'flex', gap: 0 }}>
        <IconButton icon="search" label="검색" />
        <IconButton icon="menu" label="메뉴" />
      </div>
    ),
  },
};

export const LongTitle: Story = {
  name: '긴 제목 (말줄임)',
  args: { title: '아주아주아주아주아주아주아주아주아주아주아주아주아주 긴 페이지 제목 텍스트 오버플로 테스트', showBack: true },
};

export const NoBackNoTitle: Story = {
  name: '빈 상태',
  args: { title: '', showBack: false },
};

export const ServiceTitleSize: Story = {
  name: '서비스 타이틀 크기 (16px, 일반체)',
  args: {
    title: '배지',
    showBack: true,
    titleSize: 'var(--text-body)',
    titleWeight: 'var(--weight-body)',
    titleLineHeight: 'var(--leading-body)',
    titleTracking: 'normal',
  },
};

export const HeaderStyleOverride: Story = {
  name: '헤더 배경 오버라이드',
  args: {
    title: '아이템북',
    showBack: true,
    style: { background: 'var(--color-surface)' },
  },
};

// 20260824_010: 3분할 확장 — 로고/동기화/아바타 슬롯
function DemoLogo() {
  return (
    <span style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
      JAM!
    </span>
  );
}

function DemoSyncButton() {
  return (
    <button
      style={{
        minHeight: 44, padding: '10px 16px', borderRadius: 'var(--radius-nav-buttons)',
        border: 'none', background: 'rgba(0,0,0,0.04)', color: 'var(--color-text)',
        fontSize: 'var(--text-body-sm)', cursor: 'pointer',
      }}
    >
      동기화
    </button>
  );
}

function DemoAvatar() {
  return (
    <span
      aria-label="프로필"
      style={{
        width: 44, height: 44, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: '50%', background: 'var(--color-surface-elevated)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text)', fontSize: 14,
      }}>
        JM
      </span>
    </span>
  );
}

export const LogoSlot: Story = {
  name: '로고 슬롯 (탭 최상위)',
  args: {
    showBack: false,
    logoSlot: <DemoLogo />,
  },
};

export const CenterAndAvatarSlot: Story = {
  name: '중앙 동기화 + 우측 아바타',
  args: {
    title: '뒤로',
    showBack: true,
    centerSlot: <DemoSyncButton />,
    avatarSlot: <DemoAvatar />,
  },
};

export const FullThreeColumn: Story = {
  name: '3분할 전체 (로고+동기화+아바타)',
  args: {
    showBack: false,
    logoSlot: <DemoLogo />,
    centerSlot: <DemoSyncButton />,
    avatarSlot: <DemoAvatar />,
  },
};

export const RightSlotWithAvatar: Story = {
  name: '우측 액션 + 아바타 공존 (배지 상세 공유 버튼 케이스)',
  args: {
    title: '뒤로',
    showBack: true,
    centerSlot: <DemoSyncButton />,
    rightSlot: <IconButton icon="share" label="공유" />,
    avatarSlot: <DemoAvatar />,
  },
};
