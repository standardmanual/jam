import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { TopNav } from './TopNav';
import { IconButton } from '../buttons/IconButton';
import { Button } from '../buttons/Button';
import { BellIcon } from '../icons/IconCatalog';

// 20260901_1926: props API를 서비스 `src/components/ui/TopNav.tsx` 기준으로 재정렬
// (logoSlot→logo, style→headerStyle, avatarSlot 제거·rightSlot 합성, 타이포 오버라이드
// prop 4종 제거 — 서비스가 항상 넘기던 고정값을 기본값으로 흡수).
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

export const BackHref: Story = {
  name: '뒤로가기 (href, 프레임워크 비종속)',
  args: { title: '배지', showBack: true, backHref: '/badges' },
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

export const HeaderStyleOverride: Story = {
  name: '헤더 배경 오버라이드',
  args: {
    title: '아이템북',
    showBack: true,
    headerStyle: { background: 'var(--background)' },
  },
};

// 20260824_010: 3분할 확장 — 로고/동기화/우측(아바타 포함) 슬롯
function DemoLogo() {
  return (
    <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--foreground)' }}>
      JAM!
    </span>
  );
}

function DemoSyncButton() {
  return <Button variant="secondary" size="sm">동기화</Button>;
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
      {/* 사진이 없는 폴백 아바타: 카드 면 레시피(--surface + 1px --border). 크림 위 흰 원은 1.05:1이라 테두리가 필요하다. */}
      <span style={{
        width: 36, height: 36, borderRadius: '50%', background: 'var(--surface)',
        border: '1px solid var(--border)', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--foreground)', fontSize: 14,
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
    logo: <DemoLogo />,
  },
};

export const CenterAndRightSlot: Story = {
  name: '중앙 동기화 + 우측(아바타 포함)',
  args: {
    title: '뒤로',
    showBack: true,
    centerSlot: <DemoSyncButton />,
    rightSlot: <DemoAvatar />,
  },
};

export const FullThreeColumn: Story = {
  name: '3분할 전체 (로고+동기화+아바타)',
  args: {
    showBack: false,
    logo: <DemoLogo />,
    centerSlot: <DemoSyncButton />,
    rightSlot: <DemoAvatar />,
  },
};

export const RightSlotWithAvatar: Story = {
  name: '우측 액션 + 아바타 공존 (배지 상세 공유 버튼 케이스)',
  args: {
    title: '뒤로',
    showBack: true,
    centerSlot: <DemoSyncButton />,
    rightSlot: (
      <>
        <IconButton icon="share" label="공유" />
        <DemoAvatar />
      </>
    ),
  },
};

// 동기화 아이콘 서클 — 홈(/)을 뺀 화면에서 쓰는 모양. DS IconCatalog에 SyncIcon이 없어
// 서비스 `src/components/ui/icons.tsx`의 SyncIcon과 같은 path를 Story 안에 인라인으로 둔다.
// 규격은 서비스 `SyncIconButton.tsx`와 같다: 44×44 터치 영역 안 36px `--border` 면, 16px 아이콘.
function DemoSyncCircle() {
  return (
    <button
      type="button"
      aria-label="동기화"
      style={{
        width: 44, height: 44, marginRight: -4, padding: 0, border: 'none', background: 'transparent',
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: '50%', background: 'var(--border)', color: 'var(--foreground)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 00-14.5-4.5L4 8M4 4v4h4" />
          <path d="M4 13a8 8 0 0014.5 4.5L20 16M20 20v-4h-4" />
        </svg>
      </span>
    </button>
  );
}

function DemoBell() {
  return (
    <button
      type="button"
      aria-label="알림"
      style={{
        width: 44, height: 44, padding: 0, border: 'none', background: 'transparent',
        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}
    >
      <span style={{
        width: 36, height: 36, borderRadius: '50%', background: 'var(--border)', color: 'var(--foreground)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BellIcon width={16} height={16} />
      </span>
    </button>
  );
}

export const SyncIconCircle: Story = {
  name: '동기화 아이콘 서클 — 홈은 글자 알약, 나머지 화면은 아이콘 서클을 써요',
  args: {
    title: '뒤로',
    showBack: true,
    rightSlot: (
      <>
        <DemoSyncCircle />
        <DemoBell />
        <DemoAvatar />
      </>
    ),
  },
};
