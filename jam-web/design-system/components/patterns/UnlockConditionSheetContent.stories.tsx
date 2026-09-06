import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { expect } from 'storybook/test';
import { UnlockConditionSheetContent } from './UnlockConditionSheetContent';

const WALK_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path fill="%23e8461f" d="M400-40 320-160l40-320-80 40-40 160-80-20 60-240 200-80 60 100 120 40v100l-100-20-40 140 80 300h-100Z"/></svg>'
  );

const meta: Meta<typeof UnlockConditionSheetContent> = {
  title: 'MODULAR/Patterns/UnlockConditionSheetContent',
  component: UnlockConditionSheetContent,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '「받는 방법」 시트 본문(20260903_2329). 시트 제목은 20260906_2140에서 ' +
          '「잠금 해제 조건」 → **「받는 방법」**으로 바꿨다(UX_WRITING_GUIDELINE §5.1 — ' +
          '예측 가능한 행동 동사). 서비스 BottomSheet(src/components/ui/BottomSheet.tsx) ' +
          '위에 children으로 얹는다 — DS BottomSheet 위가 아니다(병존 구현, §1.6). requirements는 전부 ' +
          '아직 채우지 못한 항목만 넘긴다(OR 게이트가 이미 열렸으면 이 시트 자체를 띄우지 않는다).',
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
  name: '미션 게이트 — 조건이 아직 남음',
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
 * 회귀 고정 — 이 시트에 뜨는 배지는 정의상 «아직 못 받은 배지»라 **원본 이미지를
 * `grayscale(1)`로** 그린다(2026-09-06 확정). 미션 썸네일은 미획득 개념이 아니라 원본
 * 그대로다. 20260905_0036이 한때 실루엣으로 바꿨다가 되돌렸다 — 외형을 감추는 것보다
 * 어떤 배지인지 알아볼 수 있는 쪽을 택했다.
 */
export const GrayscaleBadgeImage: Story = {
  name: '회귀 — 배지 원본 이미지를 그레이로',
  render: () => (
    <Sheet>
      <div data-testid="sheet">
        <UnlockConditionSheetContent
          badgeName="산책의 명상가"
          rarity="rare"
          imageUrl={WALK_ICON}
          conditionMet={false}
          requirements={[
            { kind: 'badge', name: '동네 산책러', href: '/badges/1', imageUrl: WALK_ICON },
            { kind: 'mission', name: '2주 안에 20km', href: '/missions/1', imageUrl: null },
          ]}
        />
      </div>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const sheet = canvasElement.querySelector('[data-testid="sheet"]')!;
    const imgs = Array.from(sheet.querySelectorAll('img'));
    // 본 배지(56px) + 배지 항목(36px) = 최소 2개가 원본을 그린다.
    expect(imgs.length).toBeGreaterThanOrEqual(2);
    // 배지 이미지는 전부 grayscale이다(미션 썸네일은 imageUrl이 null이라 img가 아니다).
    expect(imgs.every((i) => getComputedStyle(i).filter.includes('grayscale'))).toBe(true);
  },
};

/**
 * v5 다단계 게이트 — 「미션 **그리고** (배지 A **또는** 배지 B)」 (티켓 20260905_0037).
 *
 * 평면 `relation` 하나는 항목 **전체**에 걸리는 값이라 이 조합을 표현할 수 없었다.
 * `groups`는 **그룹 안은 `relation`, 그룹 사이는 언제나 AND**다.
 * 각 그룹의 `met`이 「1단 통과, 2단 대기」를 그대로 드러낸다 — 예전에는 전부 아직인
 * 항목만 넘어온다는 전제라 통과한 단을 표시할 방법 자체가 없었다.
 */
export const MultiStageGate: Story = {
  name: 'v5 — groups(미션 AND (배지 A OR 배지 B)) · 1단 통과',
  render: () => (
    <Sheet>
      <div data-testid="sheet">
        <UnlockConditionSheetContent
          badgeName="한파의 순례자"
          rarity="mystic"
          imageUrl={WALK_ICON}
          conditionMet={false}
          requirements={[]}
          groups={[
            {
              relation: 'or',
              met: true,
              requirements: [
                { kind: 'mission', name: '겨울 새벽 미션', href: '/missions/9', imageUrl: null, met: true },
              ],
            },
            {
              relation: 'or',
              met: false,
              requirements: [
                { kind: 'badge', name: '동네 산책러', href: '/badges/1', imageUrl: WALK_ICON, note: '배지 · Rare 이상' },
                { kind: 'badge', name: '밤의 보행자', href: '/badges/2', imageUrl: WALK_ICON },
              ],
            },
          ]}
        />
      </div>
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const text = canvasElement.querySelector('[data-testid="sheet"]')!.textContent ?? '';
    // 그룹 사이는 AND(「그리고」), 그룹 안은 OR(「또는」) — 둘이 한 화면에 함께 있어야 조합이 읽힌다.
    expect(text).toContain('그리고');
    expect(text).toContain('또는');
    // 「1단 통과, 2단 대기」
    expect(text).toContain('통과');
    expect(text).toContain('대기');
    // 기본 부제는 「배지」다 — 예전 기본값(「배지 · 어느 등급이든 1개」)은 등급 없는 계열에서 거짓이 된다.
    expect(text).not.toContain('어느 등급이든 1개');
  },
};
