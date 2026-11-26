import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import SwapText from './SwapText';
import { d } from '@/lib/i18n';

const meta: Meta<typeof SwapText> = {
  title: 'UI/Patterns/SwapText',
  component: SwapText,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof SwapText>;

// 글자가 바뀌는 순간을 보이려고 마운트 1.5초 뒤 값을 한 번 바꾼다
function ChangingText({ from, to }: { from: string; to: string }) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    const timer = setTimeout(() => setValue(to), 1500);
    return () => clearTimeout(timer);
  }, [to]);
  return <SwapText value={value} />;
}

/** 프로필의 «팔로우» 버튼 글자가 «팔로잉»으로 바뀔 때 */
export const FollowToFollowing: Story = {
  name: '팔로우 → 팔로잉',
  render: () => <ChangingText from={d.profile.followButton} to={d.profile.followingButton} />,
};

/** 믹스 결과 시트의 «받기» 버튼 글자가 «받는 중»으로 바뀔 때 */
export const ClaimToClaiming: Story = {
  name: '받기 → 받는 중',
  render: () => <ChangingText from={d.combine.pendingSheet.claim} to={d.combine.pendingSheet.claiming} />,
};
