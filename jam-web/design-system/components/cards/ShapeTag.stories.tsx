import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ShapeTag } from './ShapeTag';

const SHAPES = ['rect', 'pill', 'circle', 'dome', 'triangle', 'flag', 'hex'] as const;
const FACTIONS = ['fire', 'water', 'nature', 'shadow', 'light', 'storm', 'earth', 'void'] as const;

const meta: Meta<typeof ShapeTag> = {
  title: 'MODULAR/Cards/ShapeTag',
  component: ShapeTag,
  parameters: { layout: 'centered' },
  argTypes: {
    shape: { control: 'select', options: SHAPES },
    surface: { control: 'radio', options: ['light', 'dark'] },
    colorIndex: { control: { type: 'number', min: 0, max: 7 } },
  },
};

export default meta;
type Story = StoryObj<typeof ShapeTag>;

export const Rect: Story = { args: { shape: 'rect', children: 'LABEL', colorIndex: 0 } };
export const Pill: Story = { args: { shape: 'pill', children: 'PILL TAG', colorIndex: 1 } };
export const Circle: Story = { args: { shape: 'circle', children: '?', colorIndex: 2 } };
export const Dome: Story = { args: { shape: 'dome', children: 'DOME', colorIndex: 3 } };
export const Triangle: Story = { args: { shape: 'triangle', children: '△', colorIndex: 4 } };
export const Flag: Story = { args: { shape: 'flag', children: 'FLAG', colorIndex: 5 } };
export const Hex: Story = { args: { shape: 'hex', children: 'HEX', colorIndex: 6 } };

export const AllShapes: Story = {
  name: '전체 형태',
  render: () => (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
      {SHAPES.map((shape, i) => (
        <div key={shape} style={{ textAlign: 'center' }}>
          <ShapeTag shape={shape} colorIndex={i}>{shape}</ShapeTag>
        </div>
      ))}
    </div>
  ),
};

export const ColorPalette: Story = {
  name: '색상 팔레트 (colorIndex 0~7)',
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {Array.from({ length: 8 }, (_, i) => (
        <ShapeTag key={i} shape="pill" colorIndex={i}>{i}</ShapeTag>
      ))}
    </div>
  ),
};

export const Factions: Story = {
  name: '세계관 (faction) 색상',
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FACTIONS.map(faction => (
        <ShapeTag key={faction} shape="pill" faction={faction}>{faction}</ShapeTag>
      ))}
    </div>
  ),
};

export const LightSurface: Story = {
  name: 'Light Surface (텍스트 반전)',
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <ShapeTag shape="pill" colorIndex={0} surface="light">light</ShapeTag>
      <ShapeTag shape="pill" colorIndex={1} surface="dark">dark</ShapeTag>
    </div>
  ),
};
