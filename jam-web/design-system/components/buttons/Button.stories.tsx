import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'MODULAR/Buttons/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: '버튼',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
    children: '버튼',
  },
};

export const Ghost: Story = {
  args: {
    variant: 'ghost',
    children: '버튼',
  },
};

export const Loading: Story = {
  args: {
    variant: 'primary',
    loading: true,
    children: '로딩 중',
  },
};

export const Small: Story = {
  args: {
    variant: 'secondary',
    size: 'sm',
    children: '동기화',
  },
};

export const DarkSurface: Story = {
  name: 'Dark Surface (--background-inverse 위, 글자 --snow)',
  render: () => (
    <div style={{ background: 'var(--background-inverse)', padding: 16, borderRadius: 12, display: 'flex', gap: 8 }}>
      <Button surface="dark" variant="secondary">보조</Button>
      <Button surface="dark" variant="ghost">더보기</Button>
    </div>
  ),
};
