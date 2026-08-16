import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { BadgeFrame } from './BadgeFrame';

const SHAPES = ['circle', 'ticket-v', 'ticket-h', 'scallop', 'corner-cut', 'tab-notch', 'dumbbell'] as const;

const StarIcon = () => (
  <svg viewBox="0 0 48 48" fill="white" width={36} height={36} aria-hidden="true">
    <path d="M24 4 l5 12 13 0-10 8 4 13-12-7-12 7 4-13-10-8 13 0z" />
  </svg>
);

const meta: Meta<typeof BadgeFrame> = {
  title: 'MODULAR/Cards/BadgeFrame',
  component: BadgeFrame,
  parameters: { layout: 'centered' },
  argTypes: {
    shape: { control: 'select', options: SHAPES },
    color: { control: 'color' },
    width: { control: 'number' },
    height: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeFrame>;

export const Circle: Story = {
  args: { shape: 'circle', width: 120, height: 120, children: <StarIcon /> },
};

export const TicketV: Story = {
  name: 'Ticket-V (세로 티켓)',
  args: { shape: 'ticket-v', width: 100, height: 140, children: <StarIcon /> },
};

export const TicketH: Story = {
  name: 'Ticket-H (가로 티켓)',
  args: { shape: 'ticket-h', width: 140, height: 100, children: <StarIcon /> },
};

export const Scallop: Story = {
  args: { shape: 'scallop', width: 120, height: 120, children: <StarIcon /> },
};

export const CornerCut: Story = {
  name: 'Corner Cut',
  args: { shape: 'corner-cut', width: 120, height: 120, children: <StarIcon /> },
};

export const TabNotch: Story = {
  name: 'Tab Notch',
  args: { shape: 'tab-notch', width: 120, height: 120, children: <StarIcon /> },
};

export const Dumbbell: Story = {
  args: { shape: 'dumbbell', width: 140, height: 100, children: <StarIcon /> },
};

export const AllFrames: Story = {
  name: '전체 프레임',
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      {SHAPES.map((shape) => (
        <div key={shape} style={{ textAlign: 'center' }}>
          <BadgeFrame shape={shape} width={80} height={80}>
            <StarIcon />
          </BadgeFrame>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 6, maxWidth: 80, wordBreak: 'break-word' }}>
            {shape}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const RarityColors: Story = {
  name: '희귀도 색상',
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      {[
        { color: 'var(--color-rarity-common)', label: 'Common' },
        { color: 'var(--color-rarity-rare)', label: 'Rare' },
        { color: 'var(--color-rarity-legend)', label: 'Legend' },
        { color: 'var(--color-rarity-mythic)', label: 'Mythic' },
      ].map(({ color, label }) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <BadgeFrame shape="circle" width={72} height={72} color={color}>
            <StarIcon />
          </BadgeFrame>
          <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 6 }}>{label}</div>
        </div>
      ))}
    </div>
  ),
};
