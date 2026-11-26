import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import PopInNumber from './PopInNumber';

const meta: Meta<typeof PopInNumber> = {
  title: 'UI/Patterns/PopInNumber',
  component: PopInNumber,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof PopInNumber>;

// 값이 바뀌는 순간을 보이려고 마운트 1.5초 뒤 값을 한 번 바꾼다
function ChangingNumber({ from, to }: { from: number; to: number }) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    const timer = setTimeout(() => setValue(to), 1500);
    return () => clearTimeout(timer);
  }, [to]);
  return <PopInNumber value={value} />;
}

/** 프로필의 팔로워 수가 바뀔 때 */
export const Changing: Story = {
  name: '값이 바뀔 때',
  render: () => <ChangingNumber from={12} to={13} />,
};

/** 캡슐 게이지의 채운 양 숫자가 나타날 때 */
export const PlayOnMount: Story = {
  name: '처음 나타날 때',
  args: { value: 12, playOnMount: true },
};
