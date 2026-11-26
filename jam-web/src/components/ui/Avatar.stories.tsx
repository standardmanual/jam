import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Avatar from './Avatar';
import { d } from '@/lib/i18n';

const meta: Meta<typeof Avatar> = {
  title: 'UI/Cards/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

/** 팔로워 목록·검색 결과 행의 사진 있는 아바타 */
export const CircleImage: Story = {
  name: '원형 · 사진 있음',
  args: { src: '/dev-sample/card-cover-square.webp', alt: '', size: 48, unoptimized: true },
};

/** 팔로워 목록·검색 결과 행의 사진 없는 아바타 */
export const CircleFallback: Story = {
  name: '원형 · 사진 없음',
  args: { src: null, alt: '', size: 48, iconClassName: 'w-5 h-5 text-muted' },
};

/** 프로필 편집·온보딩 화면의 사진 있는 아바타 */
export const RoundedImage: Story = {
  name: '둥근 사각형 · 사진 있음',
  args: { src: '/dev-sample/card-cover-square.webp', alt: d.onboarding.avatarAlt, size: 96, shape: 'rounded', unoptimized: true },
};

/** 프로필 편집·온보딩 화면의 사진 없는 아바타 */
export const RoundedFallback: Story = {
  name: '둥근 사각형 · 사진 없음',
  args: { src: null, alt: d.onboarding.avatarAlt, size: 96, shape: 'rounded', iconClassName: 'w-10 h-10 text-muted' },
};
