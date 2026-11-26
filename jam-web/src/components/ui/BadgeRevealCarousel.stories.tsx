import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor } from 'storybook/test';
import { d, t } from '@/lib/i18n';
import { BadgeRevealCarousel } from './BadgeRevealCarousel';
import Button from './Button';
import type { BadgeRevealItem } from './BadgeRevealCarousel';

const meta: Meta<typeof BadgeRevealCarousel> = {
  title: 'UI/Patterns/BadgeRevealCarousel',
  component: BadgeRevealCarousel,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          '배지 획득 연출용 3D 코버플로우 캐러셀. 배지 드랍 엔진의 최종 결과가 나온 뒤에만 열리며, 열리면 곧바로 실제 배지 카드다. ' +
          '중앙 카드 292px, 이웃 카드는 화면 밖 잘림 허용. 좌우 스와이프·ArrowLeft/Right로 순환한다.',
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
// 샘플은 흰 카드 위에 놓이므로 검정 로고를 쓴다(흰 로고는 흰 면 위에서 보이지 않는다).
const SAMPLE_IMAGE = '/ds-assets/logo/jam-logo-black.png';

const RARITIES: BadgeRevealItem['rarity'][] = ['common', 'rare', 'epic', 'mystic'];

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

/** 배지 획득 연출(`BadgeRevealOverlay`)에서 배지를 1개 받았을 때 — 이웃 카드가 없다 */
export const Single: Story = {
  name: '1개 — 이웃 없음·플리킹 비활성',
  args: { open: true, items: makeItems(1) },
};

/** 배지 획득 연출에서 배지를 여러 개 받았을 때 — 좌우 이웃 카드가 비친다 */
export const Three: Story = {
  name: '3개 — 좌우 1장씩 peek',
  args: { open: true, items: makeItems(3) },
};

/** 배지 획득 연출에서 상세를 다 싣지 못했을 때 — 마지막에 «전체 보기» 카드가 붙는다 */
export const TwentyWithMoreCard: Story = {
  name: '많이 획득 — 10장 + 전체 보기 카드',
  args: {
    open: true,
    items: makeItems(10),
    moreCount: 10,
    moreMessage: (n: number) => t(d.badgeReveal.moreMessage, { count: n }),
    moreLabel: d.badgeReveal.moreLabel,
  },
};

/** 배지 획득 연출에서 배지 이미지가 없을 때 */
export const NoImage: Story = {
  name: '엣지 — 이미지 없음',
  args: { open: true, items: makeItems(3, { imageUrl: '' }) },
};

/**
 * 서비스: 배지 획득 연출에서 이름과 설명이 긴 배지.
 *
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

/* ──────────────────── 중앙 카드 텍스트 공지 (20260823_008) ──────────────────── */

/**
 * 서비스: 배지 획득 연출을 스크린리더로 쓸 때.
 *
 * 오버레이가 열리면 초기 포커스가 닫기 버튼으로 가서, 스크린리더는 dialog의 ariaLabel만 읽고
 * 배지 이름·설명·등급은 읽지 않았다. 화살표·스와이프로 중앙 카드가 바뀔 때도 공지가 없었다.
 *
 * 해결: 오버레이 안에 상시 마운트된 라이브 리전이 중앙 카드의 등급·이름·설명을 읽고,
 * 카드 안쪽 텍스트는 aria-hidden으로 접어 같은 내용이 두 번 들리지 않게 한다.
 * (오버레이가 "열렸다 + 몇 개 획득"은 서비스 호출부의 별도 라이브 리전이 담당한다 —
 *  라이브 리전은 마운트 시점의 초기 내용을 읽지 않기 때문)
 */
export const CenterCardAnnouncement: Story = {
  name: '접근성 — 중앙 카드 텍스트 라이브 리전',
  args: { open: true, items: makeItems(3), moreCount: 4 },
  play: async ({ canvasElement, step }) => {
    const liveText = () =>
      canvasElement.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent?.trim() ?? '';

    await step('중앙 카드의 등급·이름·설명을 읽는다', async () => {
      await waitFor(() => expect(liveText()).toContain('한강 러너 1'));
      expect(liveText()).toContain('Common');
      expect(liveText()).toContain('한강을 따라 10km');
    });

    await step('배지 카드 안쪽 텍스트는 aria-hidden으로 접혀 중복 낭독되지 않는다', async () => {
      // 중앙 카드 래퍼는 aria-hidden="false", 그 안의 BadgeCard 본문은 aria-hidden="true"
      const center = canvasElement.querySelector('[role="dialog"] [aria-hidden="false"]');
      expect(center?.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    });

    await step('카드가 바뀌면 라이브 리전 내용도 바뀐다', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(liveText()).toContain('한강 러너 2'));
    });

    await step('마지막 카드로 넘어가면 잔여 개수 문구를 읽는다', async () => {
      await userEvent.keyboard('{ArrowLeft}');
      await userEvent.keyboard('{ArrowLeft}');
      await waitFor(() => expect(liveText()).toContain('4개를 더 획득'));
    });
  },
};

/**
 * 서비스: 배지 획득 연출에서 레벨형·반복 획득 배지.
 *
 * v5 레벨형 · 반복형 슬롯 (티켓 20260905_0038 B).
 * 카드 슬롯이 「이미지 → 등급 pill → 이름 → 설명」으로 고정이라 Lv.N도 ×N도 들어갈 자리가
 * 없던 것을 칩 줄로 열었다. 두 칩은 배타적이 아니다 — 레벨형이면서 반복 획득일 수 있다.
 */
export const LevelAndRepeatSlots: Story = {
  name: 'v5 — Lv.N 칩과 ×N 자리',
  args: {
    open: true,
    items: [
      { id: 'lv', name: '첫 숨결', description: '달릴수록 레벨이 오르는 배지예요.', imageUrl: SAMPLE_IMAGE, rarity: null, level: 7 },
      { id: 'rep', name: '주말 러너', description: '주말마다 달리면 다시 받을 수 있어요.', imageUrl: SAMPLE_IMAGE, rarity: 'rare', earnCount: 15 },
      { id: 'plain', name: '한강 러너', description: '한강을 따라 10km를 달리면 획득해요.', imageUrl: SAMPLE_IMAGE, rarity: 'epic' },
    ],
  },
  play: async ({ canvasElement, step }) => {
    await step('레벨형은 등급 칩 대신 Lv.N을 그린다', async () => {
      await waitFor(() => expect(canvasElement.querySelector('[role="dialog"]')).toBeTruthy());
      expect(canvasElement.textContent).toContain('Lv.7');
    });

    await step('라이브 리전이 등급 대신 레벨을 읽는다', async () => {
      const liveText = canvasElement.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent ?? '';
      expect(liveText).toContain('Lv.7');
      expect(liveText).not.toContain('Common');
    });

    await step('반복 획득 카드는 ×N과 낭독 문구를 함께 갖는다', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(canvasElement.textContent).toContain('×15'));
      const liveText = canvasElement.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent ?? '';
      expect(liveText).toContain('15번 획득했어요');
    });
  },
};

/**
 * 서비스: 배지 획득 연출에서 같은 배지를 여러 번 받았을 때.
 *
 * 같은 배지 3회 획득이 카드 3장이 되면 안 된다 (티켓 20260905_0038 B).
 * 같은 `id`는 첫 등장 자리에서 한 장으로 접히고, 접힌 수가 ×N이 된다.
 */
export const RepeatFoldedIntoOneCard: Story = {
  name: 'v5 — 같은 배지 반복은 한 장으로 접힌다',
  args: {
    open: true,
    items: [
      { id: 'same', name: '주말 러너', description: '주말마다 달리면 다시 받을 수 있어요.', imageUrl: SAMPLE_IMAGE, rarity: 'rare' },
      { id: 'same', name: '주말 러너', description: '주말마다 달리면 다시 받을 수 있어요.', imageUrl: SAMPLE_IMAGE, rarity: 'rare' },
      { id: 'same', name: '주말 러너', description: '주말마다 달리면 다시 받을 수 있어요.', imageUrl: SAMPLE_IMAGE, rarity: 'rare' },
    ],
  },
  play: async ({ canvasElement, step }) => {
    await step('카드가 한 장으로 접힌다', async () => {
      await waitFor(() => expect(canvasElement.querySelector('[role="dialog"]')).toBeTruthy());
      // 접힘 전이면 카드 래퍼가 3개다. 스테이지 직계 자식 중 aria-hidden을 가진 것만 카드다
      // (닫기 버튼 슬롯은 aria-hidden이 없다).
      const stage = canvasElement.querySelector('[aria-roledescription="carousel"]')!;
      expect(stage.querySelectorAll(':scope > [aria-hidden]').length).toBe(1);
    });

    await step('접힌 수가 ×3으로 나온다', async () => {
      expect(canvasElement.textContent).toContain('×3');
    });
  },
};

/* ───────────────── 선택 모드·슬롯·closeDisabled (티켓 20261017_1425 2회) ───────────────── */

const NO_LOCKED_IDS: string[] = [];

/**
 * 선택 모드 하네스 — 선택 상태·개수 제한은 호출부가 소유하므로 스토리도 상태를 직접 쥔다.
 * header·footer는 서비스 «고르기» 화면의 모양을 흉내 낸 샘플 슬롯이다(문구는 샘플이며 서비스는 i18n 사전에서 주입한다).
 */
function SelectModeHarness({
  total,
  need,
  initialSelected = [],
  submitting = false,
  lockedIds = NO_LOCKED_IDS,
}: {
  total: number;
  need: number;
  initialSelected?: string[];
  submitting?: boolean;
  /** 잠긴 카드로 그릴 항목 id — 이름·설명은 호출부가 가린 문구로 넘기고 그림은 없다 */
  lockedIds?: string[];
}) {
  const items = useMemo(
    () =>
      makeItems(total).map((item): BadgeRevealItem => {
        if (lockedIds.includes(item.id)) {
          return {
            ...item,
            name: d.lockedItem.card.name,
            description: d.lockedItem.card.description,
            imageUrl: null,
            locked: true,
          };
        }
        return { ...item, description: '' };
      }),
    [total, lockedIds]
  );
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const full = selected.length >= need;

  return (
    <BadgeRevealCarousel
      open
      items={items}
      selectable
      selectedIds={selected}
      selectionFull={full}
      closeDisabled={submitting}
      closeLabel={d.syncPending.pick.fullLater}
      ariaLabel={d.syncPending.pick.ariaLabel}
      selectLabel={d.syncPending.pick.toggleSelect}
      selectedLabel={d.syncPending.pick.toggleSelected}
      onClose={() => {}}
      onToggleSelect={(id) =>
        setSelected((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= need ? prev : [...prev, id]
        )
      }
      style={{ maxWidth: 430, marginLeft: 'auto', marginRight: 'auto' }}
      header={
        <div style={{ padding: 'max(var(--spacing-16), env(safe-area-inset-top)) var(--spacing-24) var(--spacing-16)' }}>
          <p style={{ margin: 0, color: 'var(--base-white)', fontSize: 'var(--text-lg)', fontWeight: 700 }}>
            {t(d.syncPending.pick.title, { n: need })}
          </p>
          <p style={{ margin: 0, color: 'var(--base-white)', fontSize: 'var(--text-sm)' }}>{t(d.syncPending.pick.subtitle, { total })}</p>
        </div>
      }
      footer={
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-2xl) var(--radius-2xl) 0 0',
            padding: 'var(--spacing-16) var(--spacing-24) max(var(--spacing-16), env(safe-area-inset-bottom))',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-8)',
          }}
        >
          {/* 푸터에는 보이는 문구 없이 «N개 담기» 버튼만 둔다(티켓 20261112_1629). 서비스는 선택 개수를 sr-only 라이브 리전으로만 알린다 */}
          <Button surface="sub" fullWidth disabled={selected.length !== need || submitting} loading={submitting}>
            {submitting ? d.syncPending.pick.submitting : t(d.syncPending.pick.confirmCta, { n: need })}
          </Button>
        </div>
      }
    />
  );
}

const toggleButtons = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('[data-select-toggle]'));
const centerToggle = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('[aria-hidden="false"] [data-select-toggle]');

/** 서비스: 보류 아이템 배지 고르기(`PendingItemsPickOverlay`). 3장 중 선택 — 중앙 카드 토글이 aria-pressed로 선택을 알리고, 안쪽 링과 체크 칩이 나타난다. */
export const SelectMode: Story = {
  name: '선택 모드 — 3장 중 1장 고름',
  args: { open: true, items: [] },
  render: () => <SelectModeHarness total={3} need={2} initialSelected={['badge-2']} />,
  play: async ({ canvasElement, step }) => {
    await step('토글은 카드 DOM 안·BadgeCard 밖에 있고 aria-pressed가 있다', async () => {
      await waitFor(() => expect(centerToggle(canvasElement)).toBeTruthy());
      const toggle = centerToggle(canvasElement)!;
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
      // BadgeCard(aria-hidden="true") 안이 아니다
      expect(toggle.closest('[aria-hidden="true"]')).toBeNull();
    });

    await step('고르기를 누르면 골랐어요로 바뀐다', async () => {
      await userEvent.click(centerToggle(canvasElement)!);
      await waitFor(() => expect(centerToggle(canvasElement)!.getAttribute('aria-pressed')).toBe('true'));
      expect(centerToggle(canvasElement)!.textContent).toBe(d.syncPending.pick.toggleSelected);
    });
  },
};

/** 서비스: 보류 아이템 배지 고르기. 빈칸을 다 채운 상태 — 안 고른 카드의 토글은 aria-disabled, 고른 카드는 해제할 수 있다. */
export const SelectModeFull: Story = {
  name: '선택 모드 — 빈칸을 다 채움(안 고른 카드 토글 비활성)',
  args: { open: true, items: [] },
  render: () => <SelectModeHarness total={3} need={2} initialSelected={['badge-1', 'badge-2']} />,
  play: async ({ canvasElement, step }) => {
    await step('고른 카드(1번)는 해제할 수 있다', async () => {
      await waitFor(() => expect(centerToggle(canvasElement)).toBeTruthy());
      expect(centerToggle(canvasElement)!.getAttribute('aria-disabled')).toBeNull();
    });

    await step('안 고른 카드(3번)로 넘기면 토글이 aria-disabled이고 눌러도 선택되지 않는다', async () => {
      await userEvent.keyboard('{ArrowLeft}');
      await waitFor(() => expect(centerToggle(canvasElement)!.getAttribute('aria-disabled')).toBe('true'));
      await userEvent.click(centerToggle(canvasElement)!);
      expect(centerToggle(canvasElement)!.getAttribute('aria-pressed')).toBe('false');
      expect(toggleButtons(canvasElement).filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(2);
    });
  },
};

/** 서비스: 보류 아이템 배지 고르기. 제출 중 — closeDisabled가 닫기 버튼과 Escape를 함께 막는다. */
export const SelectModeSubmitting: Story = {
  name: '선택 모드 — 제출 중(closeDisabled)',
  args: { open: true, items: [] },
  render: () => <SelectModeHarness total={3} need={2} initialSelected={['badge-1', 'badge-2']} submitting />,
  play: async ({ canvasElement, step }) => {
    await step('닫기 버튼이 soft disabled다', async () => {
      await waitFor(() => expect(canvasElement.querySelector('[role="dialog"]')).toBeTruthy());
      const close = canvasElement.querySelector<HTMLButtonElement>(`button[aria-label="${d.syncPending.pick.fullLater}"]`);
      expect(close?.getAttribute('aria-disabled')).toBe('true');
    });

    await step('Escape로 닫히지 않는다', async () => {
      await userEvent.keyboard('{Escape}');
      expect(canvasElement.querySelector('[role="dialog"]')).toBeTruthy();
    });
  },
};

/** 서비스: 보류 아이템 배지 고르기. 잠긴 카드 — 그림 대신 중립 잠금 타일, 등급 칩(Rare), 가린 이름·필요한 양. 선택·해제는 열린 카드와 같다. */
export const SelectModeLocked: Story = {
  name: '선택 모드 — 잠긴 카드(잠금 타일)',
  args: { open: true, items: [] },
  render: () => <SelectModeHarness total={3} need={2} lockedIds={['badge-2']} initialSelected={['badge-2']} />,
  play: async ({ canvasElement, step }) => {
    await step('1번(열린 카드)에서 2번(잠긴 카드)으로 넘기면 그림 없이 잠금 타일이 보인다', async () => {
      await waitFor(() => expect(centerToggle(canvasElement)).toBeTruthy());
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(centerToggle(canvasElement)!.getAttribute('aria-pressed')).toBe('true'));
      const card = canvasElement.querySelector<HTMLElement>('[aria-hidden="false"]');
      expect(card?.textContent).toContain(d.lockedItem.card.name);
      expect(card?.textContent).toContain(d.lockedItem.card.description);
      expect(card?.querySelector('img')).toBeNull();
      expect(card?.querySelector('svg')).toBeTruthy();
    });

    await step('잠긴 카드도 해제할 수 있다', async () => {
      await userEvent.click(centerToggle(canvasElement)!);
      await waitFor(() => expect(centerToggle(canvasElement)!.getAttribute('aria-pressed')).toBe('false'));
    });
  },
};
