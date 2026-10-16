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

export const Danger: Story = {
  name: 'Danger (글자 --foreground, 흰 글자 3.57:1이라 쓰지 않음)',
  args: {
    variant: 'danger',
    children: '삭제',
  },
};

export const Outline: Story = {
  name: 'Outline (투명 + 1px --field-border)',
  args: {
    variant: 'outline',
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

export const AllVariants: Story = {
  name: '5변형 (크림 바탕)',
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <Button variant="primary">primary</Button>
      <Button variant="secondary">secondary</Button>
      <Button variant="danger">danger</Button>
      <Button variant="outline">outline</Button>
      <Button variant="ghost">ghost</Button>
    </div>
  ),
};

export const OnCard: Story = {
  name: '흰 Card 위 (확인 패널: secondary 취소 | primary 확인)',
  render: () => (
    <div
      style={{
        width: 320, padding: 16, display: 'flex', gap: 8,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-2xl)',
      }}
    >
      <Button variant="secondary" fullWidth>취소</Button>
      <Button variant="primary" fullWidth>확인</Button>
    </div>
  ),
};

export const OnSheetFooter: Story = {
  name: '시트 푸터 (--surface, secondary | primary 같은 폭 gap 8)',
  render: () => (
    <div style={{ width: 360, padding: 16, display: 'flex', gap: 8, background: 'var(--surface)' }}>
      <Button variant="primary" fullWidth>공유</Button>
      <Button variant="secondary" fullWidth>저장</Button>
    </div>
  ),
};

export const OnWarningBand: Story = {
  name: '경고 띠 위 (--warning, secondary sm)',
  render: () => (
    <div
      style={{
        width: 360, padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--warning)', color: 'var(--foreground)',
      }}
    >
      <span style={{ fontSize: 'var(--text-xs)' }}>퀘스트 미리보기 중 · 3/7단계</span>
      <Button variant="secondary" size="sm">끝내기</Button>
    </div>
  ),
};

export const DarkSurface: Story = {
  name: 'Dark Surface (--background-inverse 위, 글자 --snow)',
  render: () => (
    <div style={{ background: 'var(--background-inverse)', padding: 16, borderRadius: 12, display: 'flex', gap: 8 }}>
      <Button surface="dark" variant="primary">기본</Button>
      <Button surface="dark" variant="secondary">보조</Button>
      <Button surface="dark" variant="ghost">더보기</Button>
    </div>
  ),
};
