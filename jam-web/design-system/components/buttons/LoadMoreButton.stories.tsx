import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LoadMoreButton } from './LoadMoreButton';

const meta: Meta<typeof LoadMoreButton> = {
  title: 'MODULAR/Buttons/LoadMoreButton',
  component: LoadMoreButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 361 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof LoadMoreButton>;

export const Default: Story = {
  name: '기본 (폭 전체 · 52px · --btn-secondary 알약 · 위 16px)',
  args: {
    children: '더보기',
    onClick: () => {},
  },
};

export const Loading: Story = {
  name: '로딩 (스피너 + 비활성)',
  args: {
    loading: true,
    children: '불러오는 중',
    onClick: () => {},
  },
};

export const Disabled: Story = {
  name: '비활성 (로딩 중 중복 탭 차단과 같은 모양)',
  render: () => <LoadMoreButton loading onClick={() => {}}>더보기</LoadMoreButton>,
};

export const ErrorRetry: Story = {
  name: '오류 («다시 시도» — 같은 버튼, 글자만 바뀐다)',
  render: () => (
    <div>
      <p style={{ textAlign: 'center', fontSize: 'var(--text-base)', color: 'var(--muted)', margin: 0 }}>
        소식을 불러오지 못했어요.
      </p>
      <LoadMoreButton onClick={() => {}}>다시 시도</LoadMoreButton>
    </div>
  ),
};
