import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { MissionCard } from './MissionCard';

const meta: Meta<typeof MissionCard> = {
  title: 'MODULAR/Cards/MissionCard',
  component: MissionCard,
  parameters: { layout: 'centered' },
  argTypes: {
    rarity: { control: 'select', options: [undefined, 'common', 'rare', 'epic', 'mystic'] },
  },
};

export default meta;
type Story = StoryObj<typeof MissionCard>;

export const Ongoing: Story = {
  name: '진행 중',
  args: {
    title: '한강 5km 러닝 챌린지',
    description: '한강공원에서 5km를 달리면 배지를 획득해요.',
    statusLabel: '참가중',
    periodText: '3일 12시간 남음',
    rarity: 'rare',
    rewardText: '한강러너 배지 + 100P',
    actionLabel: '자세히 보기',
    onAction: () => {},
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const NotJoined: Story = {
  name: '미참가',
  args: {
    title: '남산 트레일 완주',
    description: '남산 둘레길 전 구간을 완주하면 배지를 획득해요.',
    periodText: '상시',
    rarity: 'epic',
    rewardText: '남산정복자 배지',
    actionLabel: '참가하기',
    onAction: () => {},
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const Done: Story = {
  name: '완료',
  args: {
    title: '첫 걸음 미션',
    description: '첫 활동을 기록하면 배지를 획득해요.',
    statusLabel: '완료',
    periodText: '2026년 8월 20일',
    rarity: 'common',
    rewardText: '첫걸음 배지 + 50P',
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const Locked: Story = {
  name: '잠김',
  args: {
    title: '마스터 러너 챌린지',
    description: undefined,
    statusLabel: '잠김',
    rarity: 'mystic',
    rewardText: '마스터러너 배지',
    actionLabel: '참가하기',
    locked: true,
    onAction: () => {},
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const NoAction: Story = {
  name: '액션 버튼 없음 (정적 카드)',
  args: {
    title: '자유 라이딩 30km',
    description: '자전거로 30km를 달리면 배지를 획득해요.',
    periodText: '상시',
    rewardText: '30P',
  },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export const List: Story = {
  name: '리스트 예시',
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 360 }}>
      <MissionCard
        title="한강 5km 러닝 챌린지"
        description="한강공원에서 5km를 달리면 배지를 획득해요."
        statusLabel="참가중"
        periodText="3일 12시간 남음"
        rarity="rare"
        rewardText="한강러너 배지 + 100P"
        actionLabel="자세히 보기"
        onAction={() => {}}
      />
      <MissionCard
        title="마스터 러너 챌린지"
        statusLabel="잠김"
        rarity="mystic"
        rewardText="마스터러너 배지"
        locked
        onAction={() => {}}
      />
    </div>
  ),
};
