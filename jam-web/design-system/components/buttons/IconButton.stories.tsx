import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { IconButton } from './IconButton';

const ICONS = ['chevron-left', 'chevron-right', 'close', 'check', 'info', 'search', 'menu', 'share'] as const;

const meta: Meta<typeof IconButton> = {
  title: 'MODULAR/Buttons/IconButton',
  component: IconButton,
  parameters: { layout: 'centered' },
  argTypes: {
    icon: { control: 'select', options: ICONS },
    surface: { control: 'radio', options: ['light', 'dark'] },
  },
};

export default meta;
type Story = StoryObj<typeof IconButton>;

export const Default: Story = { args: { icon: 'chevron-left', label: '뒤로' } };
export const Close: Story = { args: { icon: 'close', label: '닫기' } };
export const Search: Story = { args: { icon: 'search', label: '검색' } };
export const Check: Story = { args: { icon: 'check', label: '확인' } };
export const Info: Story = { args: { icon: 'info', label: '정보' } };
export const Menu: Story = { args: { icon: 'menu', label: '메뉴' } };
export const Share: Story = { args: { icon: 'share', label: '공유' } };

export const AllIcons: Story = {
  name: '전체 아이콘',
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {ICONS.map(icon => (
        <div key={icon} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <IconButton icon={icon} label={icon} />
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{icon}</span>
        </div>
      ))}
    </div>
  ),
};

export const DarkSurface: Story = {
  name: 'Dark Surface',
  render: () => (
    <div style={{ background: 'var(--color-bg-inverse)', padding: 16, borderRadius: 12, display: 'flex', gap: 8 }}>
      <IconButton icon="chevron-left" label="뒤로" surface="dark" />
      <IconButton icon="close" label="닫기" surface="dark" />
      <IconButton icon="menu" label="메뉴" surface="dark" />
    </div>
  ),
};
