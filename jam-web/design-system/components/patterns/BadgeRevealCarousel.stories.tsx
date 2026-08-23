import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React, { useEffect, useState } from 'react';
import { BadgeRevealCarousel } from './BadgeRevealCarousel';
import type { BadgeRevealItem } from './BadgeRevealCarousel';

const meta: Meta<typeof BadgeRevealCarousel> = {
  title: 'MODULAR/Patterns/BadgeRevealCarousel',
  component: BadgeRevealCarousel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '배지 획득 연출용 3D 코버플로우 캐러셀. 빈 카드 5장 고속 회전(spinning) → 실제 배지 노출(revealed) 2단계. ' +
          '중앙 카드 344px, 이웃 카드는 화면 밖 잘림 허용. 좌우 스와이프·ArrowLeft/Right로 순환한다.',
      },
    },
  },
  argTypes: {
    phase: { control: 'inline-radio', options: ['spinning', 'revealed'] },
    moreCount: { control: { type: 'number', min: 0 } },
    cardWidth: { control: { type: 'number', min: 200, max: 430 } },
  },
};

export default meta;
type Story = StoryObj<typeof BadgeRevealCarousel>;

// staticDirs 매핑(`design-system/assets` → `/ds-assets`)에 실제로 존재하는 경로를 쓴다.
// (기존 patterns 스토리들이 참조하는 `/ds-assets/uploads/...`는 매핑 밖이라 깨진 경로다)
const SAMPLE_IMAGE = '/ds-assets/logo/jam-logo-white.png';

const RARITIES: BadgeRevealItem['rarity'][] = ['common', 'rare', 'legend', 'mythic'];

function makeItems(count: number, override?: Partial<BadgeRevealItem>): BadgeRevealItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `badge-${i + 1}`,
    name: `한강 러너 ${i + 1}`,
    description: '한강을 따라 10km를 달리면 획득해요. 러닝 코스의 시작을 알리는 배지예요.',
    imageUrl: SAMPLE_IMAGE,
    rarity: RARITIES[i % RARITIES.length],
    ...override,
  }));
}

export const Empty: Story = {
  name: '0개 — 캐러셀 미노출',
  args: { open: true, phase: 'revealed', items: [] },
};

export const Single: Story = {
  name: '1개 — 이웃 없음·플리킹 비활성',
  args: { open: true, phase: 'revealed', items: makeItems(1) },
};

export const Two: Story = {
  name: '2개 — 왼쪽 없음, 오른쪽에만 1장',
  args: { open: true, phase: 'revealed', items: makeItems(2) },
};

export const Three: Story = {
  name: '3개 — 좌우 1장씩 peek',
  args: { open: true, phase: 'revealed', items: makeItems(3) },
};

export const Five: Story = {
  name: '5개',
  args: { open: true, phase: 'revealed', items: makeItems(5) },
};

export const TwentyWithMoreCard: Story = {
  name: '20개 — 10장 + 전체 보기 카드',
  args: {
    open: true,
    phase: 'revealed',
    items: makeItems(10),
    moreCount: 10,
  },
};

export const Spinning: Story = {
  name: '스핀 중 — 빈 카드 5장',
  args: { open: true, phase: 'spinning', items: [] },
};

/**
 * 스핀 → 노출 전환. 서비스 호출부의 `max(2초, API 응답)` 규칙을 3초 응답으로 재현한다.
 * (응답 지연을 0.5·3·8초로 바꿔가며 보려면 스파이크 페이지 `/spike/badge-reveal` 사용)
 */
function SpinToRevealDemo({ responseMs = 3000, ...args }: React.ComponentProps<typeof BadgeRevealCarousel> & { responseMs?: number }) {
  const [phase, setPhase] = useState<'spinning' | 'revealed'>('spinning');
  useEffect(() => {
    // max(2초, API 응답) — 응답이 먼저 와도 2초는 채우고 멈춘다.
    const timer = setTimeout(() => setPhase('revealed'), Math.max(2000, responseMs));
    return () => clearTimeout(timer);
  }, [responseMs]);
  return <BadgeRevealCarousel {...args} phase={phase} />;
}

export const SpinToReveal: Story = {
  name: '스핀 → 노출 전환 (3초 응답)',
  render: (args) => <SpinToRevealDemo {...args} />,
  args: { open: true, items: makeItems(3) },
};

export const NoImage: Story = {
  name: '엣지 — 이미지 없음',
  args: { open: true, phase: 'revealed', items: makeItems(3, { imageUrl: '' }) },
};

export const LongDescription: Story = {
  name: '엣지 — 설명 아주 김 (3줄 클램프)',
  args: {
    open: true,
    phase: 'revealed',
    items: makeItems(3, {
      description:
        '한강 자전거길 전 구간을 완주하고, 같은 주에 러닝과 라이딩을 각각 3회 이상 기록하면 획득할 수 있어요. ' +
        '누적 거리 200km를 넘기면 다음 단계 배지로 이어집니다. 시즌이 끝나기 전에 도전해 보세요.',
    }),
  },
};

export const LongName: Story = {
  name: '엣지 — 이름 아주 김',
  args: {
    open: true,
    phase: 'revealed',
    items: makeItems(3, { name: '한강 자전거길 전 구간 완주 기념 특별 배지 시즌 2' }),
  },
};

export const MythicOnly: Story = {
  name: '엣지 — mythic만',
  args: { open: true, phase: 'revealed', items: makeItems(3, { rarity: 'mythic' }) },
};
