import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
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
          '배지 획득 연출용 3D 코버플로우 캐러셀. 배지 드랍 엔진의 최종 결과가 나온 뒤에만 열리며, 열리면 곧바로 실제 배지 카드다. ' +
          '중앙 카드 344px, 이웃 카드는 화면 밖 잘림 허용. 좌우 스와이프·ArrowLeft/Right로 순환한다.',
      },
    },
  },
  argTypes: {
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
  args: { open: true, items: [] },
};

export const Single: Story = {
  name: '1개 — 이웃 없음·플리킹 비활성',
  args: { open: true, items: makeItems(1) },
};

export const Two: Story = {
  name: '2개 — 왼쪽 없음, 오른쪽에만 1장',
  args: { open: true, items: makeItems(2) },
};

export const Three: Story = {
  name: '3개 — 좌우 1장씩 peek',
  args: { open: true, items: makeItems(3) },
};

export const Five: Story = {
  name: '5개',
  args: { open: true, items: makeItems(5) },
};

export const TwentyWithMoreCard: Story = {
  name: '20개 — 10장 + 전체 보기 카드',
  args: {
    open: true,
    items: makeItems(10),
    moreCount: 10,
  },
};

export const CustomMoreMessage: Story = {
  name: '전체 보기 문구 주입 (moreMessage)',
  args: {
    open: true,
    items: makeItems(10),
    moreCount: 7,
    // 서비스는 i18n 사전(d)에서 문구를 주입한다 — 컴포넌트에 하드코딩하지 않는다.
    moreMessage: (n: number) => `아직 ${n}개가 더 남았어요`,
    moreLabel: '배지함에서 보기',
  },
};

export const NoImage: Story = {
  name: '엣지 — 이미지 없음',
  args: { open: true, items: makeItems(3, { imageUrl: '' }) },
};

export const LongDescription: Story = {
  name: '엣지 — 설명 아주 김 (3줄 클램프)',
  args: {
    open: true,
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
    items: makeItems(3, { name: '한강 자전거길 전 구간 완주 기념 특별 배지 시즌 2' }),
  },
};

export const MythicOnly: Story = {
  name: '엣지 — mythic만',
  args: { open: true, items: makeItems(3, { rarity: 'mythic' }) },
};

/**
 * 20260824_001 회귀 확인용 — 이름 2행 + 설명 3행이 동시에 걸리는 최악 조합.
 * 텍스트가 `flexShrink: 0`이고 이미지가 `maxHeight: 46%`로 먼저 양보하므로
 * 이름 2행째·설명 3행째가 잘리지 않아야 한다.
 */
export const LongNameAndDescription: Story = {
  name: '엣지 — 이름 2행 + 설명 3행 (텍스트 잘림 회귀)',
  args: {
    open: true,
    items: makeItems(3, {
      name: '한강 자전거길 전 구간 완주 기념 특별 배지 시즌 2',
      description:
        '한강 자전거길 전 구간을 완주하고, 같은 주에 러닝과 라이딩을 각각 3회 이상 기록하면 획득할 수 있어요. ' +
        '누적 거리 200km를 넘기면 다음 단계 배지로 이어집니다. 시즌이 끝나기 전에 도전해 보세요.',
    }),
  },
};

/* ────────────────────────── 재오픈 리셋 회귀 (20260824_001) ────────────────────────── */

const REOPEN_POOL = makeItems(20);

/** 중앙 카드(= aria-hidden="false"인 카드)의 배지 이름. 이웃 카드는 aria-hidden="true"다. */
function centerBadgeName(root: HTMLElement): string {
  const center = root.querySelector('[role="dialog"] [aria-hidden="false"]');
  return center?.querySelectorAll('p')[0]?.textContent?.trim() ?? '';
}

/**
 * 재오픈 리셋을 실측하는 하네스.
 * 툴바는 `zIndex: 100`으로 오버레이(zIndex 60) 위에 띄운다 — 캐러셀이 열린 상태에서도
 * 카드 수를 바꿔 눌러 "열린 채 목록 교체" 경로까지 검증하기 위해서다.
 */
function ReopenResetHarness() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(3);
  const items = useMemo(() => REOPEN_POOL.slice(0, count), [count]);

  return (
    <div>
      <div style={{ position: 'relative', zIndex: 100, padding: 24, display: 'flex', gap: 8 }}>
        {[3, 20, 1].map((n) => (
          <button
            key={n}
            type="button"
            data-testid={`open-${n}`}
            onClick={() => {
              setCount(n);
              setOpen(true);
            }}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: 'var(--color-primary)',
              color: 'var(--color-text-on-primary)',
              fontFamily: 'var(--font-family-base)',
              fontSize: 'var(--text-small)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {`${n}개 열기`}
          </button>
        ))}
      </div>

      <BadgeRevealCarousel open={open} items={items} onClose={() => setOpen(false)} />
    </div>
  );
}

/**
 * 20260824_001 게이트 리뷰 회귀 확인용 — **재오픈 시 중앙 카드가 항상 첫 배지로 리셋**된다.
 *
 * 스핀(phase)을 제거하기 전에는 phase 전환이 navToken을 갈아치우며 우연히 리셋 역할을 겸했다.
 * 스핀 제거 후 token이 `count`뿐이라, 카드 수가 같은 재오픈(3개 → 닫기 → 3개)에서 직전에
 * 스와이프한 카드가 그대로 남는 회귀가 났다. 아래 play가 그 경로를 자동으로 재현·검증한다.
 */
export const ReopenResetRegression: Story = {
  name: '회귀 — 재오픈 시 첫 카드로 리셋',
  args: { open: false, items: [] },
  render: () => <ReopenResetHarness />,
  play: async ({ canvasElement, step }) => {
    const center = () => centerBadgeName(canvasElement);
    const dialogCount = () => canvasElement.querySelectorAll('[role="dialog"]').length;

    await step('3개로 열면 첫 카드가 중앙', async () => {
      await userEvent.click(canvasElement.querySelector('[data-testid="open-3"]')!);
      await waitFor(() => expect(center()).toBe('한강 러너 1'));
    });

    await step('ArrowRight로 2번 카드로 이동', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(center()).toBe('한강 러너 2'));
    });

    await step('Escape로 닫기', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialogCount()).toBe(0));
    });

    await step('같은 카드 수(3개)로 다시 열면 첫 카드로 리셋 — 이번 회귀의 핵심', async () => {
      await userEvent.click(canvasElement.querySelector('[data-testid="open-3"]')!);
      await waitFor(() => expect(center()).toBe('한강 러너 1'));
    });

    await step('열린 채 카드 수를 20개로 바꿔도 첫 카드로 리셋 (navToken 경로)', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(center()).toBe('한강 러너 2'));
      await userEvent.click(canvasElement.querySelector('[data-testid="open-20"]')!);
      await waitFor(() => expect(center()).toBe('한강 러너 1'));
    });

    await step('20개 → 닫기 → 1개 재오픈도 첫 카드', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(center()).toBe('한강 러너 3'));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialogCount()).toBe(0));
      await userEvent.click(canvasElement.querySelector('[data-testid="open-1"]')!);
      await waitFor(() => expect(center()).toBe('한강 러너 1'));
    });
  },
};
