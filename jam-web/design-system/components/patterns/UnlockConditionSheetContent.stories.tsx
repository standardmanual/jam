import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { UnlockConditionSheetContent } from './UnlockConditionSheetContent';

const meta: Meta<typeof UnlockConditionSheetContent> = {
  title: 'MODULAR/Patterns/UnlockConditionSheetContent',
  component: UnlockConditionSheetContent,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '잠금 해제 조건 시트 본문(20260903_2329). 서비스 BottomSheet(src/components/ui/BottomSheet.tsx) ' +
          '위에 children으로 얹는다 — DS BottomSheet 위가 아니다(병존 구현, §1.6). requirements는 전부 ' +
          '아직 충족되지 않은 항목만 넘긴다(OR 게이트가 이미 열렸으면 이 시트 자체를 띄우지 않는다).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof UnlockConditionSheetContent>;

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 375, background: '#1f1f1f', padding: '20px 16px', borderRadius: '20px 20px 0 0' }}>
      {children}
    </div>
  );
}

export const MissionGateConditionMet: Story = {
  name: '미션 게이트 — 조건은 이미 채움',
  render: () => (
    <Sheet>
      <UnlockConditionSheetContent
        badgeName="동네 산책러"
        rarity="rare"
        imageUrl={null}
        conditionMet
        requirements={[{ kind: 'mission', name: '동네 산책러 레벨업', href: '/missions/1', imageUrl: null }]}
      />
    </Sheet>
  ),
};

export const MissionGateConditionNotMet: Story = {
  name: '미션 게이트 — 조건 미충족',
  render: () => (
    <Sheet>
      <UnlockConditionSheetContent
        badgeName="동네 산책러"
        rarity="epic"
        imageUrl={null}
        conditionMet={false}
        requirements={[{ kind: 'mission', name: '동네 산책러 두 번째 레벨업', href: '/missions/2', imageUrl: null }]}
      />
    </Sheet>
  ),
};

export const BadgeOrGate: Story = {
  name: '선행 배지 게이트 (OR, 2개)',
  render: () => (
    <Sheet>
      <UnlockConditionSheetContent
        badgeName="산책의 명상가"
        rarity="rare"
        imageUrl={null}
        conditionMet={false}
        requirements={[
          { kind: 'badge', name: '동네 산책러', href: '/badges/1', imageUrl: null },
          { kind: 'badge', name: '밤의 보행자', href: '/badges/2', imageUrl: null },
        ]}
      />
    </Sheet>
  ),
};
