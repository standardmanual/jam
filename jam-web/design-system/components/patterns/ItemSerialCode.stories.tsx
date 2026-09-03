import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ItemSerialCode } from './ItemSerialCode';

const meta: Meta<typeof ItemSerialCode> = {
  title: 'MODULAR/Patterns/ItemSerialCode',
  component: ItemSerialCode,
  parameters: {
    layout: 'centered',
    docs: { description: { component: '앞 4자(알파벳)는 카드 1장씩, 나머지(숫자)는 하나의 박스로 렌더링하는 일련번호 스탬프.' } },
  },
  argTypes: {
    code: { control: 'text' },
    height: { control: { type: 'range', min: 40, max: 400, step: 4 } },
  },
};

export default meta;
type Story = StoryObj<typeof ItemSerialCode>;

export const Default: Story = {
  name: '기본 (실제 포맷 — 6자리)',
  args: { code: 'ABCD000042', height: 160 },
};

export const FigmaScale: Story = {
  name: 'Figma 원본 스케일 (height 400)',
  args: { code: 'WWWW99999', height: 400 },
};

export const Compact: Story = {
  // height 50 — badges/[id] 상세 페이지(설명↔획득이력 사이) 샘플에서 430px 모바일 폭에
  // 맞춰 실측 검증한 값 (dev-sample/item-badge-serial, 티켓 20260903_1414).
  name: '컴팩트 (배지 상세 페이지 실측값)',
  args: { code: 'ABCD000042', height: 50 },
};

export const FiveDigitPlaceholder: Story = {
  name: 'Figma 원본 자리 수 (숫자 5자리)',
  args: { code: 'WWWW99999', height: 160 },
};

export const SixDigitReal: Story = {
  name: '실제 스펙 자리 수 (숫자 6자리)',
  args: { code: 'ZQKX000007', height: 160 },
};

export const MissingPrefix: Story = {
  name: 'prefix 없음 (????  폴백)',
  args: { code: '000123', height: 160 },
};

export const SideBySideDigitCounts: Story = {
  name: '5자리 vs 6자리 나란히 비교',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'flex-start' }}>
      <div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Figma 원본 (5자리): WWWW99999</p>
        <ItemSerialCode code="WWWW99999" height={120} />
      </div>
      <div>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>실제 스펙 (6자리): ABCD000042</p>
        <ItemSerialCode code="ABCD000042" height={120} />
      </div>
    </div>
  ),
};
