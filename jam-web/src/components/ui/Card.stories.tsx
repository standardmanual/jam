import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { d } from '@/lib/i18n';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'UI/Cards/Card',
  component: Card,
  parameters: { layout: 'centered' },
  argTypes: {
    tone: { control: 'radio', options: ['default', 'tint', 'inverse'] },
  },
};

export default meta;
type Story = StoryObj<typeof Card>;

const Narrow = (Story: React.ComponentType) => (
  <div style={{ width: 320 }}>
    <Story />
  </div>
);

/** 서비스 대부분의 카드. 위치 권한 안내(`LocationPermissionCard`)의 바깥 카드처럼 흰 면에 외곽선·그림자가 없다. */
export const Default: Story = {
  name: '기본 — 흰 면',
  args: { tone: 'default', children: d.drops.permissionUnsupportedDescription },
  decorators: [Narrow],
};

/** 위치 권한 안내(`LocationPermissionCard`)의 안내 단계 — 흰 카드 안 구획으로만 쓴다. */
export const Tint: Story = {
  name: '구획 — tint',
  args: { tone: 'tint', children: d.drops.permissionGuideTitle },
  decorators: [Narrow],
};

/** 캡슐 차단 안내(`CapsuleBlockedCard`)와 온보딩 트라이브 선택(`TribeStep`)에서 고른 카드 — 어두운 반전 면에 `--snow` 글자. */
export const Inverse: Story = {
  name: '반전 — 어두운 면',
  args: { tone: 'inverse', children: d.capsule.blockedBanner.line1 },
  decorators: [Narrow],
};

/**
 * 티켓 잉크 구간(`.cards`·`.ink`) 안 inverse — 이 구간은 `--foreground`·`--muted`·`--link`를 잉크색으로 되돌리지만,
 * Card inverse가 자기 안에서 다시 `--snow`·`--muted-on-inverse`로 정하므로 글자가 흰색으로 읽힌다(미션 현황 «전체 랭킹» 카드, 티켓 20261127_1555).
 * 구간이 되돌린 값을 스토리에서도 같은 변수로 재현한다.
 */
export const InverseInInk: Story = {
  name: '반전 — 잉크 구간 안',
  args: { tone: 'inverse' },
  render: (args) => (
    <div
      style={{
        width: 320,
        ['--foreground' as string]: 'var(--ticket-ink)',
        ['--muted' as string]: 'color-mix(in srgb, var(--ticket-ink) 80%, transparent)',
        ['--link' as string]: 'var(--ticket-ink)',
      }}
    >
      <Card {...args}>
        <p className="m-0 text-base text-foreground">{d.capsule.blockedBanner.line1}</p>
        <p className="m-0 text-sm text-muted">{d.capsule.blockedBanner.line2NoCount}</p>
      </Card>
    </div>
  ),
};
