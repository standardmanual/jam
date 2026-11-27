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

export default meta;
type Story = StoryObj<typeof ChapterGaugeCard>;

/** 시작 — 칩만 보이고 채움은 그리지 않는다. 숫자 «0»은 트랙 안 오른쪽에 나온다(칩 둘레 오렌지 실선이 없는지 확대해 본다) */
export const Start: Story = {
  name: '시작 (0 / 2,344, 챕터 1)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 1, filled: 0, required: 2344 },
};

/** 약 20% — 숫자가 채움 밖(트랙 안 오른쪽). 챕터 번호 4자리가 윗줄을 밀어도 이름이 버티는지 본다 */
export const TwentyPercent: Story = {
  name: '약 20% (465 / 2,344, 챕터 9999)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 9999, filled: 465, required: 2344 },
};

/** 약 65% — 숫자가 채움 안(어두운 글자) */
export const SixtyFivePercent: Story = {
  name: '약 65% (1,500 / 2,344, 챕터 12)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 12, filled: 1500, required: 2344 },
};

/** 가득 — 채움이 트랙 안쪽을 꽉 채운다 */
export const Full: Story = {
  name: '가득 (2,344 / 2,344, 챕터 99)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 99, filled: 2344, required: 2344 },
};

/** 긴 트라이브 이름 — 줄바꿈하며 카드 밖으로 넘치지 않는다 */
export const LongTribeName: Story = {
  name: '긴 트라이브 이름',
  args: { ...COMMON, tribeName: '도시의 새벽을 달리는 야간 러너 모임', chapterNo: 1, filled: 465, required: 2344 },
};

/** 챕터 10(마지막) — 필요 잼 줄을 문구 없이 비워 두고 높이는 다른 챕터와 같다. 게이지는 가득이고 숫자는 채움 안에 둔다 */
export const LastChapter: Story = {
  name: '챕터 10 (필요 잼 없음)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 10, filled: 1200, required: null },
};

/** 숫자 자리 경계 — 이 폭(트랙 안쪽 약 298px)에서 3자리 숫자가 채움 안으로 들어가는 첫 값 494(493은 밖). 글자 폭 12.5px는 추정이라 실측으로 맞춘다 */
export const PlacementBoundary: Story = {
  name: '숫자 자리 경계',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 3, filled: 494, required: 2344 },
};

/** 6자리 큰 값 — 트랙 안 오른쪽 여백 16px를 넘지 않는다 */
export const LargeNumber: Story = {
  name: '큰 값 (6자리)',
  args: { ...COMMON, tribeName: '야간 러너', chapterNo: 7, filled: 123456, required: 900000 },
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
