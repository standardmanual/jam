import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
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

/**
 * v5 — 「그리고」 게이트 (티켓 20260905_0036).
 *
 * 구분선 문구가 "또는" 하나로 하드코딩돼 있어 **조건을 전부 채워야 하는 게이트를 표현할 수
 * 없었다.** `relation` prop을 추가했고 기본값은 `'or'`라 기존 호출부는 그대로 동작한다.
 */
export const AndGate: Story = {
  name: 'v5 — relation="and" (전부 채워야 하는 게이트)',
  render: () => (
    <Sheet>
      <UnlockConditionSheetContent
        badgeName="누적의 증명"
        rarity="epic"
        conditionMet={false}
        relation="and"
        requirements={[
          { kind: 'mission', name: '2주 안에 20km', href: '/missions/1', imageUrl: null },
          { kind: 'badge', name: '동네 산책러', href: '/badges/1', imageUrl: null },
        ]}
      />
    </Sheet>
  ),
};

/**
 * v5 — 무한레벨형은 등급이 없다(rarity NULL).
 *
 * 두 가지가 함께 걸린다: 헤더 칩이 등급 칩이면 그릴 게 없고(→ `level`을 넘기면
 * `BadgeLevelChip`), 배지 항목 부제가 「배지 · 어느 등급이든 1개」로 하드코딩돼 있어
 * 레벨형 선행 배지에는 **거짓말이 된다**(→ `req.note`로 덮어쓴다).
 */
export const LeveledBadge: Story = {
  name: 'v5 — 레벨형(등급 없음) + 항목 부제 덮어쓰기',
  render: () => (
    <Sheet>
      <UnlockConditionSheetContent
        badgeName="걸어온 거리"
        rarity={null}
        level={4}
        conditionMet
        requirements={[
          { kind: 'badge', name: '걸은 날들', href: '/badges/2', imageUrl: null, note: '배지 · Lv.3 이상' },
        ]}
      />
    </Sheet>
  ),
};

/**
 * 회귀 고정 — 이 시트에 뜨는 배지는 정의상 «아직 못 받은 배지»라 **원본 이미지를 로드하지
 * 않는다.** 예전에는 `grayscale(1)`만 걸어서 원본 URL이 네트워크에 나갔다.
 */
export const NoBadgeImageLoaded: Story = {
  name: '회귀 — 배지 원본 이미지를 로드하지 않는다',
  render: () => (
    <Sheet>
      <div data-testid="sheet">
        <UnlockConditionSheetContent
          badgeName="산책의 명상가"
          rarity="rare"
          imageUrl="/should-not-be-requested.png"
          conditionMet={false}
          requirements={[
            { kind: 'badge', name: '동네 산책러', href: '/badges/1', imageUrl: '/should-not-be-requested.png' },
            { kind: 'mission', name: '2주 안에 20km', href: '/missions/1', imageUrl: null },
          ]}
        />
      </div>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const sheet = canvasElement.querySelector('[data-testid="sheet"]')!;
    const srcs = Array.from(sheet.querySelectorAll('img')).map((i) => i.getAttribute('src') ?? '');
    expect(srcs.every((s) => !s.includes('should-not-be-requested'))).toBe(true);
  },
};
