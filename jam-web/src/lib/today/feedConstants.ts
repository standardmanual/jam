/**
 * 홈피드 새 카드 전용 상수 — 15색 표와 디자인 시스템에 없는 치수·모션 값.
 *
 * 근거: 티켓 20261120_2129 「채원 사전 판정」(서비스 전용·홈피드 한정, 사용자 승인 2026-11-20, 추천안대로),
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격: 새 카드 유형·박스·색·칩」이다.
 * 다른 화면이 이 값을 쓰게 되면 디자인 시스템으로 올릴지 다시 판정한다.
 *
 * 2회차(DB)가 색 키 이름을 바꾸면 이 표를 맞춘다. 카드에는 hex가 아니라 색 키를 저장한다.
 * 15색 hex는 CSS(`design-system/tokens/colors.css`)와 이 파일에 두 번 있다. 자동 규칙(계산)이 hex를
 * 읽기 때문이다. 두 정의가 같은지는 `__tests__/feedConstants.test.ts`가 대조한다.
 *
 * 디자인 시스템 눈금 대응(새 값을 만들지 않고 기존 눈금을 가리키는 항목):
 * | 이 파일의 값                | 디자인 시스템 눈금                                        |
 * |-----------------------------|-----------------------------------------------------------|
 * | 칩 글자 14px (작은 칩)      | typography.css `--text-sm` (0.875rem, 줄 높이 20px)       |
 * | 칩 글자 18px (큰 칩)        | typography.css `--text-lg` (1.125rem, 줄 높이 28px)       |
 * | 칩 가로 여백 12px (작은 칩) | spacing.css `--spacing-12`                                |
 * | 칩 가로 여백 16px (큰 칩)   | spacing.css `--spacing-16`                                |
 * | 칩 높이 32px (작은 칩)      | 줄 높이 20px + 세로 여백 6px×2 (눈금에 높이 토큰은 없다)  |
 * | 칩 높이 40px (큰 칩)        | 줄 높이 28px + 세로 여백 6px×2 (눈금에 높이 토큰은 없다)  |
 * 모서리는 `rounded-full`(radius.css), 칩 글자 색은 `--foreground` 고정이다(`--snow`는 15색 위에서 AA 미달).
 *
 * 이 파일의 값은 모두 서비스 전용이다. 디자인 시스템 토큰이 아니므로 `design-system/`에 두지 않는다.
 */

// ── 15색 표 ──────────────────────────────────────────────────

/** 색 키 15개. 원색 5개(기존 `--jam-*`), 연한 색 5개(`--jam-*-soft`), 참조 색 5개(`--feed-ref-*`). */
export const FEED_COLOR_KEYS = [
  'red',
  'yellow',
  'green',
  'purple',
  'blue',
  'red-soft',
  'yellow-soft',
  'green-soft',
  'purple-soft',
  'blue-soft',
  'ref-red',
  'ref-blue',
  'ref-lime',
  'ref-pink',
  'ref-yellow',
] as const;

export type FeedColorKey = (typeof FEED_COLOR_KEYS)[number];

export interface FeedColor {
  /** `colors.css`에 정의된 CSS 변수 이름 */
  readonly cssVar: string;
  /** `colors.css`와 같은 hex(대문자 비교는 시험이 대소문자를 무시한다) */
  readonly hex: string;
}

/** 색 키 → CSS 변수·hex. 원색 5개는 기존 `--jam-*`를 그대로 가리킨다. */
export const FEED_COLORS = {
  // 원색 5개 — 기존 강조색(새로 만들지 않는다)
  red: { cssVar: '--jam-red', hex: '#FF1D1D' },
  yellow: { cssVar: '--jam-yellow', hex: '#FEC100' },
  green: { cssVar: '--jam-green', hex: '#34ef5a' },
  purple: { cssVar: '--jam-purple', hex: '#BA8AF7' },
  blue: { cssVar: '--jam-blue', hex: '#0695EC' },
  // 연한 색 5개 — 신규
  'red-soft': { cssVar: '--jam-red-soft', hex: '#FF9A9A' },
  'yellow-soft': { cssVar: '--jam-yellow-soft', hex: '#FFDD73' },
  'green-soft': { cssVar: '--jam-green-soft', hex: '#9AF7AD' },
  'purple-soft': { cssVar: '--jam-purple-soft', hex: '#D6B9FA' },
  'blue-soft': { cssVar: '--jam-blue-soft', hex: '#8FCFF6' },
  // 참조 색 5개 — 신규
  'ref-red': { cssVar: '--feed-ref-red', hex: '#F5442C' },
  'ref-blue': { cssVar: '--feed-ref-blue', hex: '#95C1F7' },
  'ref-lime': { cssVar: '--feed-ref-lime', hex: '#C0DC66' },
  'ref-pink': { cssVar: '--feed-ref-pink', hex: '#E57FBB' },
  'ref-yellow': { cssVar: '--feed-ref-yellow', hex: '#F2EC6A' },
} as const satisfies Record<FeedColorKey, FeedColor>;

// ── 칩 ────────────────────────────────────────────────────────

/** 칩 크기 두 가지. 글자·가로 여백은 위 눈금 대응 표를 따른다(새 값 아님). */
export const FEED_CHIP = {
  /** 작은 칩: 높이 32px, 글자 14px(`--text-sm`), 가로 여백 12px(`--spacing-12`) */
  small: { height: 32, fontSize: 14, paddingX: 12 },
  /** 큰 칩: 높이 40px, 글자 18px(`--text-lg`), 가로 여백 16px(`--spacing-16`) */
  large: { height: 40, fontSize: 18, paddingX: 16 },
} as const;

/** 칩·도장 외곽선 두께 px. 디자인 시스템에 2px 외곽선 토큰이 없어 서비스 전용으로 둔다(`--list-row-selected-ring`은 선택 링 전용). */
export const FEED_OUTLINE_WIDTH = 2;

/** 칩 기울기(deg) 여섯 값. 0은 없다(칩은 항상 기울인다). 칩마다 카드 id 시드로 하나를 고른다. */
export const FEED_TILTS = [-8, -6, -4, 4, 6, 8] as const;

export type FeedTilt = (typeof FEED_TILTS)[number];

// ── 박스 모양 ────────────────────────────────────────────────

/** 박스 모양의 홈·돌출 치수 px. 박스에는 외곽선이 없고 경로는 비율에 맞게 변환해 그린다. */
export const FEED_BOX = {
  /** 티켓 반원 홈 지름: 텍스트 박스(양쪽 변) 56, 이미지 마스크(위·아래 변) 40 */
  ticketNotchDiameter: { text: 56, image: 40 },
  /** 우표 반원 홈 지름: 텍스트 박스(위·아래 변) 24, 이미지 마스크(양쪽 변) 20 (24는 PRD §6 규격값) */
  stampNotchDiameter: { text: 24, image: 20 },
  /** 반원 돌출 반지름: 아이템 배지 박스(위·아래) 28, 이미지 마스크(양쪽) 52 */
  bumpRadius: { itemBadge: 28, image: 52 },
  /** 물결 둘레의 높낮이 범위. 마디마다 깊이·간격을 조금씩 다르게 한다 */
  waveAmplitude: { min: 12, max: 22 },
} as const;

/** 도장 지름 px. 검정 2px 외곽선(`FEED_OUTLINE_WIDTH`)이 있는 도넛 모양이다. */
export const FEED_STAMP_SIZE = 60;

// ── 모션 ──────────────────────────────────────────────────────

/** 모션 값. 길이 0.72초·지연 70~210ms·탄성 곡선. 디자인 시스템 `--ease-bounce`(cubic-bezier(0.34, 1.36, 0.64, 1))와 다른 값이라 따로 둔다. */
export const FEED_MOTION = {
  durationSeconds: 0.72,
  delayMs: { min: 70, max: 210 },
  easing: 'cubic-bezier(0.2, 1.5, 0.4, 1)',
} as const;
