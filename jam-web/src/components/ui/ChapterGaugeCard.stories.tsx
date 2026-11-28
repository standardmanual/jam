import { useEffect, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import ChapterGaugeCard, { ChapterGaugeCardError, ChapterGaugeCardSkeleton } from './ChapterGaugeCard';
import Button from './Button';
import { d } from '@/lib/i18n';

// 문구는 컴포넌트가 만들지 않는다. 스토리는 라벨에 영문 `CHAPTER`를 넘기고 접근성 문구는 견본으로 적는다(화면 연결은 C5b·C6).
const COMMON = {
  chapterLabel: 'CHAPTER',
  ariaLabel: '챕터, 트라이브 이름',
  trackAriaLabel: '다음 챕터까지 잼 모은양 / 필요양',
};

const meta: Meta<typeof ChapterGaugeCard> = {
  title: 'UI/Cards/ChapterGaugeCard',
  component: ChapterGaugeCard,
  parameters: { layout: 'centered' },
  // 시안 폭 358px. 배경은 프로필 시안과 같은 중립 회색(--background)
  decorators: [
    (Story) => (
      <div style={{ width: 358, padding: 'var(--spacing-16)', background: 'var(--background)' }}>
        <Story />
      </div>
    ),
  ],
};

/** 기준 글자 크기(html 글자 크기)를 이 배율로 바꿔 보이는 데코레이터 — 카드가 글자 배율로 숫자 폭을 다시 어림하는지 보려는 것이다. 스토리를 떠나면 되돌린다 */
function RootFontScale({ percent, width, children }: { percent: number; width: number; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.fontSize;
    root.style.fontSize = `${percent}%`;
    return () => {
      root.style.fontSize = before;
    };
  }, [percent]);
  return <div style={{ width, padding: 'var(--spacing-16)', background: 'var(--background)' }}>{children}</div>;
}

const withRootFontScale = (percent: number, width: number) =>
  function FontScaleDecorator(Story: () => ReactNode) {
    return (
      <RootFontScale percent={percent} width={width}>
        <Story />
      </RootFontScale>
    );
  };

export default meta;
type Story = StoryObj<typeof ChapterGaugeCard>;

/** 시작 — 칩만 보이고 채움은 그리지 않는다. 오렌지 «0»은 칩 오른쪽 바깥(44 + 8)에, 필요 잼 숫자는 오른쪽 끝에 있다(칩 둘레 오렌지 실선이 없는지 확대해 본다) */
export const Start: Story = {
  name: '시작 (0 / 2,344, 챕터 1)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 1, filled: 0, required: 2344 },
};

/** 약 17% — 모은 잼 숫자가 채움 오른쪽 바깥(간격 8, 오렌지). 챕터 번호 4자리가 윗줄을 밀어도 이름이 버티는지 본다 */
export const TwentyPercent: Story = {
  name: '약 17% (400 / 2,344, 챕터 9999)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 9999, filled: 400, required: 2344 },
};

/** 약 65% — 모은 잼 숫자가 채움 안 오른쪽 끝(어두운 글자), 필요 잼 숫자는 오른쪽 끝(오렌지) */
export const SixtyFivePercent: Story = {
  name: '약 65% (1,500 / 2,344, 챕터 12)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 12, filled: 1500, required: 2344 },
};

/** 가득 — 채움이 트랙 안쪽을 꽉 채운다. 필요 잼 숫자가 전부 어두운 글자로 보여야 한다 */
export const Full: Story = {
  name: '가득 (2,344 / 2,344, 챕터 99)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 99, filled: 2344, required: 2344 },
};

/** 긴 트라이브 이름 — 줄바꿈하며 카드 밖으로 넘치지 않는다 */
export const LongTribeName: Story = {
  name: '긴 트라이브 이름',
  args: { ...COMMON, tribeName: '도시의 새벽을 달리는 야간 러너 모임', chapterNo: 1, filled: 465, required: 2344 },
};

/** 챕터 10(마지막) — 필요 잼 숫자와 그 자리가 없다. 게이지는 가득이고 모은 잼 숫자는 채움 안에 둔다 */
export const LastChapter: Story = {
  name: '챕터 10 (필요 잼 없음)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 10, filled: 1200, required: null },
};

/** 숫자 자리 경계 — 이 폭(트랙 안쪽 약 298px)에서 3자리 숫자가 채움 안으로 들어가는 첫 값 425(424는 바깥). 글자 폭 10px는 추정이라 실측으로 맞춘다 */
export const PlacementBoundary: Story = {
  name: '숫자 자리 경계',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 425, required: 2344 },
};

/** 6자리 큰 값 — 모은 잼 «123,456»과 필요 잼 «900,000»이 겹치지 않는다(사이 8px 이상, getBoundingClientRect로 실측) */
export const LargeNumber: Story = {
  name: '큰 값 (6자리)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 7, filled: 123456, required: 900000 },
};

/** 바깥 자리의 끝 — 3자리 숫자가 채움 밖에 있는 마지막 값 157(158부터 안쪽). 두 숫자 사이가 8px 이상인지 본다 */
export const OutsideEnd: Story = {
  name: '바깥 자리의 끝 (157 / 870)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 157, required: 870 },
};

/** 안쪽으로 바뀌는 첫 값 — 필요 길이를 막 넘긴 값 */
export const InsideFirst: Story = {
  name: '안쪽으로 바뀌는 첫 값 (158 / 870)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 158, required: 870 },
};

/** 안쪽 + 클램프 — 채움이 필요 잼 영역에 닿는 값. 모은 잼 숫자의 오른쪽 끝이 필요 잼 영역 왼쪽에서 멈춘다 */
export const InsideClamped: Story = {
  name: '안쪽 클램프 (800 / 870)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 800, required: 870 },
};

/** 필요 잼 숫자 부분 걸침 — 채움 끝이 «870» 중간이라 앞쪽은 어둡고 뒤쪽은 오렌지다(하드 컷). 오렌지 위 오렌지가 없어야 한다 */
export const RequiredPartlyCovered: Story = {
  name: '필요 잼 숫자 부분 걸침 (774 / 870)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 774, required: 870 },
};

/** 필요 잼 숫자 전부 걸침 — 숫자 전체가 어두운 글자다 */
export const RequiredFullyCovered: Story = {
  name: '필요 잼 숫자 전부 걸침 (860 / 870)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 860, required: 870 },
};

/** 390px 기기 폭 */
export const Width390: Story = {
  name: '390px 폭 (40 / 870)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 40, required: 870 },
  decorators: [
    (Story) => (
      <div style={{ width: 390, padding: 'var(--spacing-16)', background: 'var(--background)' }}>
        <Story />
      </div>
    ),
  ],
};

/** 360px + 글자 125% — 두 숫자가 겹치지 않거나 규칙대로 안쪽으로 들어간다 */
export const Narrow125: Story = {
  name: '360px + 글자 125% (800 / 870)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 800, required: 870 },
  decorators: [withRootFontScale(125, 360)],
};

/** 360px + 글자 150% + 5자리 — 극단 조합. 필요 잼 영역을 침범하지 않는 것이 우선이다 */
export const Narrow150: Story = {
  name: '360px + 글자 150% (12,345 / 90,000)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 7, filled: 12345, required: 90000 },
  decorators: [withRootFontScale(150, 360)],
};

/** 360px 기기 폭 — 긴 이름과 챕터 9999가 카드 밖으로 넘치지 않고 줄바꿈한다 */
export const NarrowWidth: Story = {
  name: '360px 폭 (긴 이름 · 챕터 9999)',
  args: { ...COMMON, tribeName: '도시의 새벽을 달리는 야간 러너 모임', chapterNo: 9999, filled: 465, required: 2344 },
  decorators: [
    (Story) => (
      <div style={{ width: 360, padding: 'var(--spacing-16)', background: 'var(--background)' }}>
        <Story />
      </div>
    ),
  ],
};

/** 모션 줄이기 확인용 — OS 설정에서 «동작 줄이기»를 켜고 열면 쉼 없이 바로 최종 모양이다 */
export const ReducedMotionCheck: Story = {
  name: '모션 줄이기 확인용',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 12, filled: 1500, required: 2344 },
};

/** 불러오는 중 — 카드 자리 크기와 모서리를 같게 채운다 */
export const Loading: Story = {
  name: '불러오는 중',
  render: () => <ChapterGaugeCardSkeleton />,
};

/** 불러오기 실패 — 카드와 같은 높이 안에 안내 블록. 문구는 견본이다 */
export const LoadFailed: Story = {
  name: '불러오기 실패',
  render: () => (
    <ChapterGaugeCardError action={<Button variant="ghost">{d.missions.pendingCard.retry}</Button>}>
      {d.missions.pendingCard.loadFailed}
    </ChapterGaugeCardError>
  ),
};
