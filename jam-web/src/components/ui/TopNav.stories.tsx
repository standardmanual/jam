import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import TopNav from './TopNav';
import { ToastProvider } from './Toast';
import PendingItemsPickerProvider from '@/components/strava/PendingItemsPickerProvider';
import { TopNavDataProvider } from '@/lib/topNavData';
import type { StravaUiState } from '@/lib/strava/connection-state';
import { d } from '@/lib/i18n';

const meta: Meta<typeof TopNav> = {
  title: 'UI/Navigation/TopNav',
  component: TopNav,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/', query: {} } },
  },
};

export default meta;
type Story = StoryObj<typeof TopNav>;

/** 레이아웃이 공급자로 내려주는 값 그대로 — 로그인 유저 데이터와 Strava 연동 상태를 고른다. */
const withData = (stravaState: StravaUiState) =>
  function WithData(Story: React.ComponentType) {
    return (
      <TopNavDataProvider value={{ username: null, avatarUrl: null, stravaState, hasUnreadNotifications: false }}>
        <ToastProvider>
          <PendingItemsPickerProvider initialPendingCount={0}>
            <div style={{ width: 390 }}>
              <Story />
            </div>
          </PendingItemsPickerProvider>
        </ToastProvider>
      </TopNavDataProvider>
    );
  };

/** 문의 화면 등 하위 화면의 상단 바 — 제목과 뒤로가기, Strava 연동된 계정 */
export const TitleConnected: Story = {
  name: '제목 · 뒤로가기 · 연동됨',
  args: { title: d.voc.pageTitle },
  decorators: [withData('connected')],
};

/** 같은 상단 바 — 오류로 연동이 끊겨 «다시 동기화» 버튼이 보이는 계정 */
export const TitleReconnect: Story = {
  name: '제목 · 뒤로가기 · 다시 동기화',
  args: { title: d.voc.pageTitle },
  decorators: [withData('disconnected_error')],
};

/** 같은 상단 바 — Strava를 연동하지 않은 계정의 «동기화» 시작 버튼 */
export const TitleNotConnected: Story = {
  name: '제목 · 뒤로가기 · 연동 안 됨',
  args: { title: d.voc.pageTitle },
  decorators: [withData('none')],
};

/** 배지 탭 최상위 화면의 상단 바 — 로고와 탭 이름 */
export const LogoWithText: Story = {
  name: '로고 · 탭 이름',
  args: { logo: true, logoText: d.badges.title },
  decorators: [withData('connected')],
};

/** 프로필 등의 상단 바 — 로고만 */
export const LogoOnly: Story = {
  name: '로고만',
  args: { logo: true },
  decorators: [withData('connected')],
};

/** 홈의 상단 바 — 로고와 중앙의 «동기화» 알약 버튼 */
export const LogoPillSync: Story = {
  name: '로고 · 동기화 알약 (홈)',
  args: { logo: true, syncStyle: 'pill' },
  decorators: [withData('connected')],
};
