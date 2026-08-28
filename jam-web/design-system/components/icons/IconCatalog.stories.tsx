import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { IconCatalog, ICON_ENTRIES, LockIcon, MedalIcon } from './IconCatalog';

const meta: Meta<typeof IconCatalog> = {
  title: 'MODULAR/Icons/IconCatalog',
  component: IconCatalog,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof IconCatalog>;

export const AllIcons: Story = {
  name: `전체 아이콘 (${ICON_ENTRIES.length}종)`,
  render: () => <IconCatalog />,
};

export const SingleIcon: Story = {
  name: '단일 아이콘 예시',
  render: () => (
    <div style={{ display: 'flex', gap: 24, color: 'var(--color-text)' }}>
      <MedalIcon width={32} height={32} />
      <LockIcon width={32} height={32} />
    </div>
  ),
};

export const ColorInheritance: Story = {
  name: '색상 상속 (currentColor)',
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      <span style={{ color: 'var(--color-primary)' }}><MedalIcon width={28} height={28} /></span>
      <span style={{ color: 'var(--color-text-secondary)' }}><MedalIcon width={28} height={28} /></span>
      <span style={{ color: 'var(--color-rarity-epic)' }}><MedalIcon width={28} height={28} /></span>
    </div>
  ),
};
