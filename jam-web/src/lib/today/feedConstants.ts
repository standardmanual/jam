/**
 * 홈피드 새 카드 전용 상수 — 통합 팔레트 9색 표와 디자인 시스템에 없는 치수·모션 값.
 *
 * 근거: 티켓 20261120_2129 「채원 사전 판정」(서비스 전용·홈피드 한정, 사용자 승인 2026-11-20, 추천안대로),
 * 규격 정본은 docs/service/prd/home-feed/PRD.md §6 「개편 규격: 새 카드 유형·박스·색·칩」이다.
 * 다른 화면이 이 값을 쓰게 되면 디자인 시스템으로 올릴지 다시 판정한다.
 *
 * 카드에는 hex가 아니라 색 키를 저장한다.
 * 9색 hex는 CSS(`design-system/tokens/colors.css`)와 이 파일에 두 번 있다. 자동 규칙(계산)이 hex를
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
 * 모서리는 `rounded-full`(radius.css), 칩 글자 색은 `--foreground` 고정이다(`--snow`는 통합 팔레트 위에서 AA 미달).
 *
 * 이 파일의 값은 모두 서비스 전용이다. 디자인 시스템 토큰이 아니므로 `design-system/`에 두지 않는다.
 */

// ── 색 표 ────────────────────────────────────────────────────

/**
 * 색 키 9개(통합 팔레트): 노랑 `yellow`·초록 `green`·짙은 초록 `green-deep`·분홍 `pink`·하늘 `sky`·빨강 `red`·보라 `purple`·파랑 `blue`·흰색 `white`.
 * 옛 10키(연한 색 5개·참조 색 5개)는 티켓 20261122_2224 회차 12에서 걷었다.
 */
export const FEED_COLOR_KEYS = ['yellow', 'green', 'green-deep', 'pink', 'sky', 'red', 'purple', 'blue', 'white'] as const;

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
  yellow: { cssVar: '--jam-yellow', hex: '#F9FD69' },
  green: { cssVar: '--jam-green', hex: '#59C02B' },
  purple: { cssVar: '--jam-purple', hex: '#BA8AF7' },
  blue: { cssVar: '--jam-blue', hex: '#0695EC' },
  // 통합 팔레트 새 키 4개 — 값 정본은 colors.css(티켓 20261122_2223)
  'green-deep': { cssVar: '--jam-green-deep', hex: '#3D851E' },
  pink: { cssVar: '--jam-pink', hex: '#F372C1' },
  sky: { cssVar: '--jam-sky', hex: '#51CDF5' },
  white: { cssVar: '--jam-chip-white', hex: '#FFFFFF' },
} as const satisfies Record<FeedColorKey, FeedColor>;

/**
 * 색 키 → CSS `var(--…)` 문자열. 부품은 색을 이 함수만 거쳐 칠한다(hex를 직접 쓰지 않는다).
 * 값은 디자인 시스템 토큰(`--jam-*`)만 가리킨다. 색 값을 바꾸는 곳은 디자인 시스템 파일이다(어드민 컬러셋 메뉴는 통합 팔레트로 없앴다, 티켓 20261122_2225).
 * 위 색 표가 «키 → 변수 이름 + 기본 hex»의 순수 데이터라, hex를 입력으로 받는 순수 함수(자동 제외 규칙)가 그 위에 붙을 수 있다.
 */
export function feedColorVar(key: FeedColorKey): string {
  // 9키에 없는 값(저장된 옛 키 등)이 와도 던지거나 undefined를 칠하지 않고 노랑으로 그린다.
  const known = (FEED_COLOR_KEYS as readonly string[]).includes(key);
  const safeKey: FeedColorKey = known ? key : 'yellow';
  return `var(${FEED_COLORS[safeKey].cssVar})`;
}

// ── 통합 팔레트 쓰임 표·조합 (티켓 20261122_2224 회차 3) ─────────────────

/**
 * 색이 어디에 쓰이는지의 표(상위 티켓 20261122_2217 결정 §1·§2). 이번 회차는 표만 만든다 — 배정은 4·5회차가 읽는다.
 * 키 이름은 위 9키다(노랑 `yellow`·초록 `green`·짙은 초록 `green-deep`·분홍 `pink`·하늘 `sky`·빨강 `red`·보라 `purple`·파랑 `blue`·흰색 `white`).
 */
export const FEED_COLOR_USAGE = {
  /** 카드 바탕에 올 수 있는 색 */
  bg: ['yellow', 'green', 'green-deep', 'pink', 'sky'],
  /** 박스 색 */
  box: ['yellow', 'green', 'green-deep', 'pink', 'sky'],
  /** 값 칩 색 */
  valueChip: ['yellow', 'green', 'pink', 'sky', 'red', 'purple', 'white'],
  /** 분류 스티커 색 */
  sticker: ['yellow', 'green', 'pink', 'sky', 'red', 'purple', 'blue'],
} as const satisfies Record<string, readonly FeedColorKey[]>;

export interface FeedBgBoxCombo {
  readonly bg: FeedColorKey;
  readonly box: FeedColorKey;
  /** 가중 추첨의 무게. 클수록 자주 뽑힌다. */
  readonly weight: number;
}

/** 일반 카드의 바탕+박스 조합 9개. 노랑·초록 조합 세 개는 가중치 2, 나머지는 1이다(합계 12). */
export const FEED_BG_BOX_COMBOS: readonly FeedBgBoxCombo[] = [
  { bg: 'yellow', box: 'green', weight: 2 },
  { bg: 'green', box: 'yellow', weight: 2 },
  { bg: 'yellow', box: 'green-deep', weight: 2 },
  { bg: 'green', box: 'pink', weight: 1 },
  { bg: 'sky', box: 'yellow', weight: 1 },
  { bg: 'yellow', box: 'sky', weight: 1 },
  { bg: 'pink', box: 'yellow', weight: 1 },
  { bg: 'pink', box: 'green', weight: 1 },
  { bg: 'sky', box: 'pink', weight: 1 },
];

/** 짙은 초록 바탕 카드의 바탕+박스 조합 2개. 일반 조합 9개와 따로 두고 아래 리듬으로만 뽑는다. */
export const FEED_DEEP_GREEN_COMBOS: readonly Omit<FeedBgBoxCombo, 'weight'>[] = [
  { bg: 'green-deep', box: 'yellow' },
  { bg: 'green-deep', box: 'pink' },
];

/** 짙은 초록 바탕 카드의 리듬: «다섯~여섯 장에 한 장꼴»(짙은 초록 바탕 카드와 다음 짙은 초록 바탕 카드의 간격이 5~6번째, 즉 사이에 4~5장). */
export const FEED_DEEP_GREEN_RHYTHM = { everyMin: 5, everyMax: 6 } as const;

/** 짙은 초록 키. 바탕 위 글자가 흰색으로 바뀌고 박스로는 글자 있는 박스에 못 쓴다. */
export const FEED_DEEP_GREEN_KEY = 'green-deep' as const satisfies FeedColorKey;

/**
 * 바탕 위 제목·설명 글자 색(CSS 값). 짙은 초록 바탕이면 흰색(`--snow`, 대비 약 4.59:1), 아니면 검정(`--foreground`).
 * 박스 위 글자는 박스 색과 무관하게 검정이다(짙은 초록 박스는 글자 박스에 쓰지 않는다, `boxAllowedFor`).
 */
export function feedTextOnBg(bgKey: string | null | undefined): 'var(--snow)' | 'var(--foreground)' {
  return bgKey === FEED_DEEP_GREEN_KEY ? 'var(--snow)' : 'var(--foreground)';
}

/**
 * 이 색을 이 박스 색으로 써도 되는가. 박스 쓰임 표에 있는 색이어야 하고, 짙은 초록 박스는 글자가 들어가는 박스
 * (텍스트형·드랍 픽업 배지 상자·목록형 타일)에 쓰지 않는다 — 검정 글자 대비가 3.9라서다(결정 4).
 * `holdsText`는 박스에 글자가 들어가는지(그림만 담는 박스는 false).
 */
export function boxAllowedFor(boxKey: string, holdsText: boolean): boolean {
  if (!(FEED_COLOR_USAGE.box as readonly string[]).includes(boxKey)) return false;
  return !(holdsText && boxKey === FEED_DEEP_GREEN_KEY);
}

// ── 칩 ────────────────────────────────────────────────────────

/** 칩 크기 두 가지. 글자·가로 여백은 위 눈금 대응 표를 따른다(새 값 아님). */
export const FEED_CHIP = {
  /** 작은 칩: 높이 32px, 글자 14px(`--text-sm`), 가로 여백 12px(`--spacing-12`) */
  small: { height: 32, fontSize: 14, paddingX: 12 },
  /** 큰 칩: 높이 40px, 글자 18px(`--text-lg`), 가로 여백 16px(`--spacing-16`) */
  large: { height: 40, fontSize: 18, paddingX: 16 },
} as const;

/**
 * 카드 모서리 칩(분류·값) 전용 크기 (티켓 20261122_2228 R1, 상위 20261122_2217 §3·§7, 2026-11-22 사용자 확정).
 * 제목 속 칩(`ChipTitle`)은 위 `FEED_CHIP` 그대로이고 이 상수를 쓰지 않는다(두 칩이 같은 크기로 합쳐지지 않는다).
 * 글자 굵기는 900(`font-black`)이다. 글자 24·18px은 `--text-2xl`·`--text-lg` 눈금에 대응한다. 가로 여백은 `FEED_CHIP`과 같다.
 */
export const FEED_CORNER_CHIP = {
  /** 큰 칩: 높이 52px, 글자 24px(`--text-2xl`), 가로 여백 16px */
  large: { height: 52, fontSize: 24, paddingX: 16 },
  /** 작은 칩: 높이 40px, 글자 18px(`--text-lg`), 가로 여백 12px */
  small: { height: 40, fontSize: 18, paddingX: 12 },
  fontWeight: 900,
} as const;

/** 카드 모서리 칩 기울기 범위(deg, 절댓값). 3~12 사이 자유 각도이고 한 카드의 두 칩은 반대 방향이다. 계산값으로만 쓰고 저장하지 않는다(`FeedTilt`·DB CHECK는 그대로). 2026-11-22 사용자 확정, 상위 20261122_2217 §3·§7. */
export const FEED_CORNER_TILT_RANGE = { min: 3, max: 12 } as const;

/** 카드 모서리 칩이 카드 가장자리에서 안쪽으로 지켜야 할 한도(카드 폭·높이 대비 %). 가로 6%·세로 5%. 배치 계산은 R3·R4가 쓴다. 2026-11-22 사용자 확정. */
export const FEED_CORNER_INSET = { x: 6, y: 5 } as const;

/** 카드 모서리 칩이 카드 밖으로 나가도 되는 최대 px. 배치 계산은 R3·R4가 쓴다. 2026-11-22 사용자 확정. */
export const FEED_CORNER_OVERHANG = 6;

/** 칩·도장 외곽선 두께 px. 디자인 시스템에 2px 외곽선 토큰이 없어 서비스 전용으로 둔다(`--list-row-selected-ring`은 선택 링 전용). */
export const FEED_OUTLINE_WIDTH = 2;

/** 칩 기울기(deg) 여섯 값. 0은 없다(칩은 항상 기울인다). 칩마다 카드 id 시드로 하나를 고른다. */
export const FEED_TILTS = [-8, -6, -4, 4, 6, 8] as const;

export type FeedTilt = (typeof FEED_TILTS)[number];

/**
 * 칩 자리 오프셋 px — 칩의 바깥 모서리가 박스·이미지 모서리를 넘어 걸치는 정도(칩이 박스 모서리에 «걸쳐» 보이게 하는 값).
 * `x`는 가로(왼쪽·오른쪽 모서리 밖으로), `y`는 세로(위·아래 모서리 밖으로)다.
 * 근거: x 12는 작은 칩의 가로 여백(`--spacing-12`)과 같아 칩 글자 시작이 모서리 선에 놓이고,
 * y 16은 작은 칩 높이 32px의 절반이라 칩 가운데가 모서리 선에 놓인다. 디자인 시스템 눈금에 오프셋 토큰이 없어 서비스 전용으로 둔다.
 * 채원 확인 필요(PRD 「치수 원칙」이 새 값으로 꼽은 항목). 폭 320px에서 칩이 좌우 16px 바깥으로 나가지 않게 하는 한도는 4회차(자리 배치)가 정한다.
 * 홈피드의 카드 모서리 칩은 이 값을 쓰지 않는다 — 칩 계획(`feedChipPlan.ts`, 안쪽 6%·5%·바깥 6px)을 `FeedChipPlanLayer`가 그린다(티켓 20261122_2228 R6).
 * 이 값은 옛 앵커 걸침 위치(`chipPositionOf`)를 쓰는 전체 배경 이미지(`full_image`, 서비스에서 꺼짐)에만 남았다.
 */
export const FEED_CHIP_OFFSET = { x: 12, y: 16 } as const;

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
  /** 물결 마디 수(PRD 표). 높낮이 `waveAmplitude`와 다른 값이다 */
  waveCount: 22,
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

// ── 카드 유형별 치수·상수 (티켓 20261121_0041, 상위 20261120_2026 4회차-2) ─────────────────

/**
 * 전체 배경 이미지(`full_image`)를 홈에 그릴지. 꺼 둔다(거짓).
 * 근거: 이미지 위 제목의 대비 기준이 없다(PRD 「개편 규격」 «이미지 위 제목», 이미지 규칙은 8회차 전). 거짓이면 `toCardView`가 이 유형을
 * 옛 모양 경로로 보내 화면이 비지 않는다. 컴포넌트·Story는 이 값과 무관하게 있다.
 */
export const FEED_FULL_IMAGE_ENABLED = false;

/**
 * 전체 배경 이미지 위 제목 뒤의 막. 지금은 농도 0(막 없음)이다 — 제목 글자는 다른 유형처럼 `--foreground`이고, 이미지 위 제목의 대비 기준은 이미지 규칙(8회차)에서 채원이 정한다.
 * 켤 때 채원이 글자색·막을 함께 정한다(어두운 막을 쓰면 글자색도 같이 바뀌어야 하므로 한쪽만 바꾸지 않는다).
 * `opacity`는 아래쪽 끝의 농도(0~1)이고 위로 갈수록 옅어져 `heightPercent`(카드 높이 대비 %)에서 투명해진다. 색은 `--foreground` 토큰을 섞어 만든다(hex 없음). 값이 0이면 막을 그리지 않는다.
 */
export const FEED_FULL_IMAGE_SCRIM = { opacity: 0, heightPercent: 60 } as const;

/**
 * 카드 유형별 최소 높이 px(샘플 치수, 2026-11-20 사용자 확정, 폭 390 화면의 카드 폭 358 기준). 높이는 `min-height`로 두고 내용이 길면 늘어난다.
 * `full_image`는 정사각이라 높이 대신 비율(1:1)로 둔다(358은 참고 값). `text_box`도 티켓 20261122_2228 R2부터 정사각(`aspect-square`)이라 최소 높이가 없다(키를 지웠다).
 */
export const FEED_CARD_MIN_HEIGHT = {
  hero_box: 360,
  badge_intro: 384,
  badge_only: 332,
  full_image: 358,
  // 4회차-3(티켓 20261121_0115): 컬렉션 소개 416, 드랍·픽업 360(티켓 20261122_2229에서 400: 시안 높이), 목록형은 «260 이상»이라 항목 이름 줄이 늘면 늘어난다
  collection_intro: 416,
  drop_pickup: 400,
  gallery_list: 260,
} as const;

/** 히어로 이미지 박스 높이(샘플 326×184). 폭은 카드 폭에서 좌우 여백 16px씩을 뺀 값을 채운다. */
export const FEED_HERO_IMAGE_HEIGHT = 184;

/**
 * 사진이 실제로 그려지는 텍스트형(이미지 마스크 박스)의 어둠 막 농도(0~1, 박스 전체에 균일한 단색 한 겹). 2026-11-22 사용자 확정 32%, 상위 20261122_2217 §7.
 * 색은 `--foreground`를 섞어 만든다(hex 없음). 이 위의 제목은 `--snow` 흰 글자다. 대비가 모자라 보여도 값은 바꾸지 말고 보고한다.
 */
export const FEED_PHOTO_TEXT_SCRIM = 0.32;

/**
 * 텍스트형 큰 제목의 글자 크기 단계(티켓 20261122_2228 R2). 정사각형이라 긴 제목이 박스를 넘기 쉬워 2~3단계로만 낮춘다.
 * 제목을 데이터 줄바꿈으로 나눈 줄마다 `charsPerLine`자씩 접힌다고 어림해 줄 수를 세고, 그 줄 수가 `maxLines` 이하인 첫 단계를 쓴다. 마지막 단계는 한도가 없다.
 * 근거: 폭 358 카드의 글자 영역은 약 262×262px(박스 326 − 안쪽 여백 32×2)다. 글자 48px(줄 높이 1.1 = 52.8px)는 한 줄 약 5자·4줄(211px),
 * 36px(39.6px)는 약 7자·6줄(238px)이다. 클래스는 Tailwind 눈금(`text-5xl` 48·`text-4xl` 36·`text-3xl` 30)이다.
 * 글자 크기는 px가 아니라 카드 폭 비율(`cqw`, 카드가 `@container`)이다. 카드 안쪽 폭(358 화면에서 326) 대비 14.7%·11%·9.2%가 각각 48·36·30px라서,
 * 폭 288 화면(안쪽 256)에서는 37.6·28.2·23.6px로 같은 비율을 지킨다(폭 288에서 48px 그대로면 5자×4줄이 박스 256을 넘어 잘렸다, 판정 2026-11-23).
 * 그래도 한도를 넘는 경우는 글자 층의 `max-h-full`·`overflow-hidden`이 박스 안에 가둔다.
 */
export const FEED_TEXT_BOX_TITLE_STEPS = [
  { charsPerLine: 5, maxLines: 4, className: 'text-[14.7cqw]' },
  { charsPerLine: 7, maxLines: 6, className: 'text-[11cqw]' },
  { charsPerLine: 10, maxLines: Infinity, className: 'text-[9.2cqw]' },
] as const;

/** 텍스트형 큰 제목의 글자 크기 클래스. 제목의 줄바꿈은 데이터 그대로 본다(빈 줄도 한 줄이다). */
export function feedTextBoxTitleSizeClass(title: string | null | undefined): string {
  const dataLines = (title ?? '').split('\n').map((line) => line.trim().length)
  const wrapped = (charsPerLine: number) => dataLines.reduce((sum, length) => sum + Math.max(1, Math.ceil(length / charsPerLine)), 0)
  const step = FEED_TEXT_BOX_TITLE_STEPS.find((candidate) => wrapped(candidate.charsPerLine) <= candidate.maxLines)
  return (step ?? FEED_TEXT_BOX_TITLE_STEPS[FEED_TEXT_BOX_TITLE_STEPS.length - 1]).className
}

/** 배지 그림 한 변(샘플 208×208)과 그림이 놓이는 영역 높이(샘플 216). */
export const FEED_BADGE_SIZE = 208;
export const FEED_BADGE_AREA_HEIGHT = 216;

/** 칩이 이미지 위 모서리 «안쪽»에 놓일 때(`full_image`) 모서리에서 띄우는 px. 디자인 시스템 `--spacing-16`과 같다. */
export const FEED_CHIP_INSET = 16;

/** 도장이 자리 모서리에서 안쪽으로 들어오는 px(`--spacing-12`)와 기울기(deg, 샘플은 오른쪽 14°). 왼쪽 자리는 부호를 뒤집는다. */
export const FEED_STAMP_INSET = 12;
export const FEED_STAMP_TILT = 14;

/** 글자를 담는 텍스트 박스의 안쪽 여백 px(`--spacing-32`). 물결 가장자리(최대 22px)와 티켓 홈 반지름(28px)이 글자에 닿지 않게 하는 값이다. */
export const FEED_TEXT_BOX_PADDING = 32;

// ── 컬렉션 소개·드랍·픽업·목록형 (티켓 20261121_0115, 상위 20261120_2026 4회차-3) ─────────────────

/**
 * 컬렉션 소개(`collection_intro`)의 치수·배치 규칙 (샘플 326×240 영역, 폭 390 화면의 카드 폭 358 기준).
 *
 * - 영역 높이 240 가운데에 대표 그림 168×168(`object-contain`)을 두고, 그 뒤 가운데에서 아이템 배지가 둘레로 퍼진다. 배지 한 변은 68~84px이다.
 * - 배지 배치(`x`·`y`)는 가운데에서 영역 가장자리까지를 1로 본 −1~1이다. 화면은 영역의 절반 크기(`50cqw`·`50cqh`)에 곱해 그리므로 카드 폭이 달라도 비율이 같다.
 *   배치를 만드는 쪽(`resolveFeedLook`)은 기준 영역(`referenceHalf` = 326×240의 절반)의 px로 겹침을 계산한다.
 * - `minCenterDistance`: 배지 중심이 가운데에서 이만큼 떨어진다. 대표 그림 반지름 84px 바깥에 배지 중심이 놓여 배지가 그림 뒤에 숨지 않는다(샘플은 115~129px).
 *   `minPairDistance`: 배지 중심끼리의 거리. 가장 큰 배지(84) 한 변보다 조금 큰 88이라 서로 반 넘게 겹치지 않는다(샘플은 111 이상).
 * - 모인 모습은 `scale(0.3)`·불투명도 0(샘플). 불투명도 전환은 220ms 안에 끝난다(샘플 `opacity 220ms ease-out`).
 * - 관찰자는 55% 넘게 보일 때 «퍼짐», 완전히 나가면 «모임»으로 본다(`visibleRatio`). 노출 계측의 관찰자(50%)와 다른 관찰자다.
 * 값의 근거는 사용자 확정 샘플(2026-11-20)과 PRD 「컬렉션 모션」이다. 디자인 시스템 눈금에 없어 서비스 전용으로 둔다.
 */
export const FEED_BURST = {
  count: 4,
  areaHeight: 240,
  artSize: 168,
  badgeSize: { min: 68, max: 84 },
  referenceHalf: { x: 163, y: 120 },
  edgeMargin: 2,
  minCenterDistance: 112,
  minPairDistance: 88,
  tilt: { min: 6, max: 14 },
  collectedScale: 0.3,
  opacitySeconds: 0.22,
  visibleRatio: 0.55,
} as const;

/** 시드가 알맞은 배치를 끝내 못 찾을 때 쓰는 샘플 배치(영역 326×240 기준 px와 기울기·크기·지연). 샘플 보드의 위치·기울기이고 최소 거리 규칙을 만족한다. 크기는 68~84 안으로, 지연은 70~210 안으로 맞췄다(샘플의 64·0은 범위 밖). */
export const FEED_BURST_SAMPLE = [
  { px: -112, py: -30, tilt: 8, size: 80, delayMs: 70 },
  { px: -84, py: 78, tilt: -14, size: 68, delayMs: 140 },
  { px: 104, py: -76, tilt: -9, size: 72, delayMs: 100 },
  { px: 112, py: 48, tilt: 12, size: 84, delayMs: 210 },
] as const;

/** 카드 면 요소가 «카드 루트»임을 알리는 표식 속성. 컬렉션 소개의 모션 래퍼(`FeedCollectionBurst`)가 이 요소를 찾아 관찰하고, `FeedCardShell`의 `markRoot`가 단다. */
export const FEED_CARD_ROOT_ATTR = 'data-feed-card-root';

/**
 * 드랍·픽업(`drop_pickup`): 박스 없이 배지 그림을 크게 겹치고 기울여 흩뿌린다(티켓 20261122_2229, 상위 20261122_2217 §7). 서비스 전용 상수이고 디자인 토큰이 아니다.
 * 배지 영역의 기준 크기는 326×248(카드 폭 358 − 안 여백 32)이고, 틀(`FEED_DROP_PICKUP_FRAMES`)의 중심 %·한 변 px는 이 기준에서 읽은 값이다. 배지는 최대 5개다.
 * 칩 «DROP»·«PICKUP»(분류 칩 두 개)은 카드 모서리에 칩 계획대로 놓인다(`FeedChipPlanLayer`).
 */
export const FEED_DROP_PICKUP = { refWidth: 326, refHeight: 248, max: 5 } as const;

/** 배지 한 장의 자리: x·y는 배지 영역 폭·높이 대비 중심 %, size는 기준 폭 326에서 한 변 px, tilt는 도(음수 = 반시계). */
export interface DropPickupFrameItem {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly tilt: number;
}

/**
 * 배지 수(1~5)별 배치 틀(시안 `docs/assets/prototypes/drop-pickup-a5/board-a5.jpg`에서 읽은 값, ±8px 오차). 배열 순서가 곧 카드에 걸린 배지 순서이자 앞뒤 순서다(뒤 항목이 위).
 * 무작위가 아니라 배지 수가 틀을 정한다. 값은 «보기 좋게» 임의로 바꾸지 않고 시안과 대조해 판정을 다시 받는다.
 * 왼쪽 위·오른쪽 위 모서리와 제목 옆 자리는 칩 자리라 비워 둔다.
 */
export const FEED_DROP_PICKUP_FRAMES: Readonly<Record<1 | 2 | 3 | 4 | 5, readonly DropPickupFrameItem[]>> = {
  1: [{ x: 48, y: 42, size: 176, tilt: -4 }],
  2: [
    { x: 24, y: 31, size: 124, tilt: -8 },
    { x: 66, y: 58, size: 152, tilt: -8 },
  ],
  3: [
    { x: 16, y: 28, size: 100, tilt: -8 },
    { x: 67, y: 26, size: 124, tilt: 6 },
    { x: 46, y: 70, size: 124, tilt: -8 },
  ],
  4: [
    { x: 31, y: 24, size: 112, tilt: -4 },
    { x: 72, y: 28, size: 132, tilt: -5 },
    { x: 20, y: 61, size: 120, tilt: -8 },
    { x: 75, y: 64, size: 112, tilt: -3 },
  ],
  5: [
    { x: 14, y: 33, size: 88, tilt: -6 },
    { x: 43, y: 22, size: 100, tilt: -6 },
    { x: 82, y: 36, size: 108, tilt: 8 },
    { x: 25, y: 65, size: 112, tilt: -5 },
    { x: 70, y: 62, size: 124, tilt: -6 },
  ],
};

/** 배지 수에 맞는 틀. 0개 이하는 빈 목록, 5개를 넘으면 5개 틀이다. */
export function dropPickupFrameOf(count: number): readonly DropPickupFrameItem[] {
  if (count < 1) return [];
  return FEED_DROP_PICKUP_FRAMES[Math.min(count, FEED_DROP_PICKUP.max) as 1 | 2 | 3 | 4 | 5];
}

/** 카드 폭에 맞는 배지 영역 높이(px). 폭이 줄면 영역·배지가 같은 비율로 줄어 틀 모양이 유지된다. 영역 폭은 카드 폭 − 32다. */
export function dropPickupAreaHeightOf(cardWidth: number): number {
  return Math.round(((cardWidth - 32) * FEED_DROP_PICKUP.refHeight) / FEED_DROP_PICKUP.refWidth);
}

/**
 * 목록형(`gallery_list`): 칸 4개(`grid-cols-4`, 칸 간격 8)·항목은 최대 3개, 화살표 아이콘 32px(샘플).
 * 칩(`card-top-right`)은 제목 위 칩 줄의 오른쪽 끝에 놓는다(절대 위치가 아니라 제목을 가리지 않는다. 샘플에는 목록형 칩이 없어 이 배치는 4회차 화면 실측 뒤 정했다).
 */
export const FEED_GALLERY = { maxItems: 3, arrowIconSize: 32 } as const;

// ── 카드 커버 이미지를 쓰는 유형 (티켓 20261121_1722, 상위 20261120_2026 7회차-1) ──────────────

/**
 * 이 유형이 카드의 커버 이미지(`cover_image_url`)를 쓰는가. 운영툴이 «이미지 제작 필요»를 띄우고 승인 전 미리보기가 이미지를 미리 그릴지 정하는 기준이다.
 * - `hero_box`: 항상(히어로 이미지).
 * - `text_box`: 박스 용도(`boxKind`)가 `image_mask`일 때만(이미지를 박스 모양으로 자른 마스크). 글자 박스(`text`)는 이미지가 없다.
 * - `collection_intro`: 항상(컬렉션 대표 그림, 커버가 필수다).
 * - `full_image`는 홈에서 꺼져 있어(`FEED_FULL_IMAGE_ENABLED`) 포함하지 않는다. `badge_intro`·`badge_only`·`drop_pickup`·`gallery_list`는 커버 이미지를 만들지 않는다.
 * 모르는 값(null·undefined·다른 문자열)이면 거짓이다. 순수 함수라 서버·브라우저 어디서나 쓴다.
 */
export function feedTypeUsesCoverImage(feedType: unknown, boxKind?: unknown): boolean {
  if (feedType === 'hero_box' || feedType === 'collection_intro') return true;
  if (feedType === 'text_box') return boxKind === 'image_mask';
  return false;
}

/**
 * 카드의 박스 용도(`box_kind`)를 정한다. 저장값이 있으면 그 값, 비어 있으면 유형 기본(히어로는 이미지 마스크, 나머지는 글자 박스)이다.
 * `resolveFeedLook`의 박스 용도 계산과 같은 규칙이라 화면과 서버 자동 배정이 같은 판단을 한다.
 */
export function resolveBoxKind(feedType: unknown, boxKind: unknown): 'text' | 'image_mask' {
  if (boxKind === 'text' || boxKind === 'image_mask') return boxKind;
  return feedType === 'hero_box' ? 'image_mask' : 'text';
}

/**
 * 박스 안에 글자가 들어가는가(통합 팔레트 자동 배정의 `boxHasText`, 티켓 20261122_2224 6회차).
 * 텍스트형·드랍 픽업 배지 상자·목록형 타일은 글자가 들어가 참이고, 박스에 사진만 들어가는 이미지 마스크(히어로 등)는 거짓이다.
 */
export function boxHasTextFor(feedType: unknown, boxKind: unknown): boolean {
  return resolveBoxKind(feedType, boxKind) !== 'image_mask';
}
