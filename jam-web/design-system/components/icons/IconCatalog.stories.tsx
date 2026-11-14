import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { IconCatalog, ICON_ENTRIES, CoinIcon, InfoIcon, LockIcon, MedalIcon } from './IconCatalog';

const meta: Meta<typeof IconCatalog> = {
  title: 'MODULAR/Icons/IconCatalog',
  component: IconCatalog,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof IconCatalog>;

export const AllIcons: Story = {
  name: `전체 아이콘 (${ICON_ENTRIES.length}종, 라인·채움)`,
  render: () => <IconCatalog />,
};

export const SingleIcon: Story = {
  name: '단일 아이콘 예시',
  render: () => (
    <div style={{ display: 'flex', gap: 24, color: 'var(--foreground)' }}>
      <MedalIcon width={32} height={32} />
      <MedalIcon width={32} height={32} variant="fill" />
      <LockIcon width={32} height={32} />
      <LockIcon width={32} height={32} variant="fill" />
    </div>
  ),
};

export const ColorInheritance: Story = {
  name: '색상 상속 (currentColor)',
  render: () => (
    <div style={{ display: 'flex', gap: 24 }}>
      <span style={{ color: 'var(--link)' }}><MedalIcon width={28} height={28} /></span>
      <span style={{ color: 'var(--muted)' }}><MedalIcon width={28} height={28} /></span>
      <span style={{ color: 'var(--rarity-epic)' }}><MedalIcon width={28} height={28} /></span>
    </div>
  ),
};

const BACKGROUNDS = [
  { label: '흰색', bg: '#FFFFFF', fg: '#171717' },
  { label: '#F3F3F3', bg: '#F3F3F3', fg: '#171717' },
  { label: '#171717', bg: '#171717', fg: '#FFFFFF' },
  { label: '반투명', bg: 'rgba(23, 23, 23, 0.4)', fg: '#FFFFFF' },
  { label: '초록', bg: '#0C8A4B', fg: '#FFFFFF' },
];

export const OnFiveBackgrounds: Story = {
  name: '다섯 배경 위 (비운 면·틈이 배경을 비춘다)',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {BACKGROUNDS.map(({ label, bg, fg }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            padding: 12,
            borderRadius: 12,
            background: bg,
            color: fg,
          }}
        >
          <code style={{ width: 72, fontSize: 12 }}>{label}</code>
          {ICON_ENTRIES.map(({ name, Icon }) => (
            <Icon key={name + '-line'} width={24} height={24} variant="line" />
          ))}
          {ICON_ENTRIES.map(({ name, Icon }) => (
            <Icon key={name + '-fill'} width={24} height={24} variant="fill" />
          ))}
        </div>
      ))}
    </div>
  ),
};

export const SmallSizes: Story = {
  name: '작은 크기 (16·20·24px) — 가는 선과 채움 틈 점검',
  render: () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--foreground)' }}>
      {[16, 20, 24].map((size) => (
        <span key={size} style={{ display: 'flex', gap: 8 }}>
          <CoinIcon width={size} height={size} />
          <InfoIcon width={size} height={size} />
          <InfoIcon width={size} height={size} variant="fill" />
        </span>
      ))}
    </div>
  ),
};
