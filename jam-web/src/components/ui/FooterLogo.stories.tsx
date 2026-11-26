import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import FooterLogo from './FooterLogo';

const meta: Meta<typeof FooterLogo> = {
  title: 'UI/Navigation/FooterLogo',
  component: FooterLogo,
  parameters: { layout: 'centered' },
  // 푸터와 같은 반전 면 위에서만 쓰인다
  decorators: [(Story) => <div style={{ width: 360, padding: '24px 16px 0', background: 'var(--background-inverse)' }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof FooterLogo>;

/** 푸터 맨 아래 JAM! 로고 (보이기 시작하면 아래에서 올라온다) */
export const Default: Story = {
  name: '기본',
};
