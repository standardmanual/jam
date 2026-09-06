import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { LockGlyph, CheckGlyph, StarGlyph, ChevronDownGlyph } from './BadgeStatusGlyphs';

const meta: Meta = {
  title: 'MODULAR/Icons/BadgeStatusGlyphs',
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '배지 화면의 상태 글리프 단일 소스 — 티켓 20260906_2140. 같은 자물쇠·체크 SVG가 ' +
          '`BadgeStageRail`과 `BadgeProgressRingCard`에 각각 선언돼 있었고 기본 크기마저 ' +
          '11px / 10px로 갈라져 있었다. TabBar와 같은 Material Symbols 채움 스타일' +
          '(`viewBox="0 -960 960 960"` + `fill="currentColor"`)이며 색은 부모 `color`로만 ' +
          '제어한다. 서비스 `icons.tsx`의 `LockIcon`은 stroke 아웃라인이라 다른 물건이고, ' +
          '배지 화면에서는 쓰지 않는다. 이모지도 쓰지 않는다.',
      },
    },
  },
};

export default meta;
type Story = StoryObj;

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: 12, borderRadius: 12, background: '#1a1a1a', color: 'var(--color-text, #fff)',
      }}
    >
      <span style={{ display: 'flex' }}>{children}</span>
      <span style={{ fontSize: 11, color: 'var(--color-text-secondary, #999)' }}>{label}</span>
    </div>
  );
}

export const All: Story = {
  name: '글리프 4종',
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, width: 343 }}>
      <Cell label="Lock">
        <LockGlyph size={20} />
      </Cell>
      <Cell label="Check">
        <CheckGlyph size={20} />
      </Cell>
      <Cell label="Star">
        <StarGlyph size={20} />
      </Cell>
      <Cell label="ChevronDown">
        <ChevronDownGlyph size={20} />
      </Cell>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const svgs = canvasElement.querySelectorAll('svg');
    await expect(svgs.length).toBe(4);
    // TabBar와 같은 Material Symbols 좌표계 + 채움 스타일임을 고정한다.
    svgs.forEach((svg) => {
      expect(svg.getAttribute('viewBox')).toBe('0 -960 960 960');
      expect(svg.getAttribute('fill')).toBe('currentColor');
    });
  },
};

export const ColorInherits: Story = {
  name: '색은 부모 color를 따른다',
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 16, background: '#1a1a1a', borderRadius: 12 }}>
      <span style={{ color: 'var(--status-done-solid, #d6f24a)', display: 'flex' }}>
        <CheckGlyph size={24} />
      </span>
      <span style={{ color: 'var(--color-primary, #e8461f)', display: 'flex' }}>
        <LockGlyph size={24} />
      </span>
      <span style={{ color: 'var(--color-text-secondary, #999)', display: 'flex' }}>
        <StarGlyph size={24} />
      </span>
    </div>
  ),
};
