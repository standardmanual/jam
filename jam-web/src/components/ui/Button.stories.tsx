import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import Button from './Button';
import { d } from '@/lib/i18n';

const meta: Meta<typeof Button> = {
  title: 'UI/Buttons/Button',
  component: Button,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Button>;

const wide = (Story: React.ComponentType) => (
  <div style={{ width: 320 }}>
    <Story />
  </div>
);

/** 투데이 TopNav의 «동기화» 버튼 */
export const PrimarySubCompact: Story = {
  name: '기본 버튼 · 밝은 바탕용 · 아주 작게',
  args: { variant: 'primary', surface: 'sub', size: 'xs', children: d.today.syncButton },
};

/** 투데이 사용자 검색창의 «검색» 버튼 */
export const PrimarySubSmall: Story = {
  name: '기본 버튼 · 밝은 바탕용 · 작게',
  args: { variant: 'primary', surface: 'sub', size: 'sm', children: d.today.searchButton },
};

/** 믹스 화면 맨 위 배너의 «받기» 버튼 (폭은 글자만큼) */
export const PrimaryAuto: Story = {
  name: '기본 버튼 · 폭 자동',
  args: { variant: 'primary', children: d.combine.pendingBanner.action },
};

/** 배지 상세 하단의 «Strava에서 보기» 링크 버튼 (바깥 주소) */
export const PrimaryExternalLink: Story = {
  name: '기본 버튼 · 바깥 링크',
  args: {
    variant: 'primary',
    fullWidth: true,
    href: 'https://www.strava.com/activities/1',
    external: true,
    children: d.badges.viewOnStrava,
  },
  decorators: [wide],
};

/** 정지 안내 배너의 «문의» 버튼 */
export const PrimaryCompactFull: Story = {
  name: '기본 버튼 · 아주 작게 · 폭 전체',
  args: { variant: 'primary', surface: 'main', size: 'xs', fullWidth: true, children: d.suspension.bannerInquireCta },
  decorators: [wide],
};

/** 미션 상세 하단의 «참가하기» 버튼 */
export const PrimaryLarge: Story = {
  name: '기본 버튼 · 크게 · 폭 전체',
  args: { variant: 'primary', surface: 'main', size: 'lg', fullWidth: true, children: d.missions.joinButton },
  decorators: [wide],
};

/** 미션 참가 확인 시트에서 요청이 진행 중일 때의 버튼 */
export const PrimaryLoading: Story = {
  name: '기본 버튼 · 불러오는 중',
  args: { variant: 'primary', fullWidth: true, loading: true, children: d.missions.joinButtonPending },
  decorators: [wide],
};

/** 드랍 상세 시트에서 픽업할 수 없을 때의 «픽업» 버튼 */
export const PrimaryDisabled: Story = {
  name: '기본 버튼 · 비활성',
  args: { variant: 'primary', surface: 'main', fullWidth: true, disabled: true, children: d.drops.pickupButton },
  decorators: [wide],
};

/** 철학 페이지의 검정 바탕 위 «이메일 보내기» 버튼 */
export const PrimaryDark: Story = {
  name: '기본 버튼 · 어두운 바탕용',
  args: { variant: 'primary', surface: 'dark', href: 'mailto:sihyunrr@gmail.com', children: '이메일 보내기' },
  decorators: [
    (Story) => (
      <div style={{ background: 'var(--background-inverse)', padding: 24 }}>
        <Story />
      </div>
    ),
  ],
};

/** 드랍 상세 시트의 «취소» 버튼 */
export const Secondary: Story = {
  name: '보조 버튼 · 폭 전체',
  args: { variant: 'secondary', fullWidth: true, children: d.drops.cancel },
  decorators: [wide],
};

/** 다른 사용자 프로필에서 이미 팔로우 중일 때의 «팔로잉» 버튼 */
export const SecondarySubCompact: Story = {
  name: '보조 버튼 · 밝은 바탕용 · 아주 작게',
  args: { variant: 'secondary', surface: 'sub', size: 'xs', children: d.social.followingButton },
};

/** 포인트 내역 오류 뒤의 «다시 시도» 버튼 */
export const SecondarySub: Story = {
  name: '보조 버튼 · 밝은 바탕용',
  args: { variant: 'secondary', surface: 'sub', children: d.points.retry },
};

/** 캡슐 차단 카드의 안내 버튼 */
export const SecondaryCompact: Story = {
  name: '보조 버튼 · 아주 작게',
  args: { variant: 'secondary', size: 'xs', children: d.chapterGauge.blocked.cta },
};

/** 인벤토리의 «믹스» 링크 버튼 (앱 안 이동) */
export const SecondaryInternalLink: Story = {
  name: '보조 버튼 · 앱 안 링크',
  args: { variant: 'secondary', fullWidth: true, href: '/combine', children: d.inventory.combineButton },
  decorators: [wide],
};

/** 프로필 하단의 «로그아웃» 버튼 */
export const Outline: Story = {
  name: '외곽 버튼 · 폭 전체',
  args: { variant: 'outline', surface: 'main', fullWidth: true, children: d.profile.logoutButton },
  decorators: [wide],
};

/** 프로필 상단의 «편집» 버튼 */
export const OutlineCompact: Story = {
  name: '외곽 버튼 · 아주 작게',
  args: { variant: 'outline', surface: 'main', size: 'xs', children: d.profile.editButton },
};

/** 회원 탈퇴 시트의 «탈퇴하기» 버튼 */
export const Danger: Story = {
  name: '위험 버튼 · 폭 전체',
  args: { variant: 'danger', fullWidth: true, children: d.withdrawSheet.confirm },
  decorators: [wide],
};

/** 미션 상세 보상 조회 실패 안내의 «다시 시도» 버튼 */
export const Ghost: Story = {
  name: '글자 버튼',
  args: { variant: 'ghost', children: d.missions.pendingCard.retry },
};
