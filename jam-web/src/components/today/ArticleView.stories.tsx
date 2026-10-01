import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { CSSProperties, ReactNode } from 'react'
import { expect } from 'storybook/test'
import type { ArticleView as ArticleViewData } from '@/lib/today/articleView'
import ArticleView from './ArticleView'

/**
 * 기사 화면 본문 상태 행렬 (티켓 20261001_1737, 상위 20260930_1453 조각 b3 확정 설계 7절).
 *
 * - 화면 폭 프레임이다: 360 기기 = 360px, 430 기기 = 430px(앱 열 최대폭). 카드와 달리 기사는 화면 전체 폭을 쓴다.
 * - 상단 TopNav는 페이지가 그리므로(`app/(main)/today/[cardId]/page.tsx`) 이 컴포넌트에는 없다. 커버는 TopNav 바로 아래에 붙는다.
 * - 캔버스는 기본 검정이다(기사 화면 배경과 같다). 칩은 검정 바탕 위 흰 칩(`LabelChip tone="inverse"`)이다.
 * - 아래 `play`는 높이·가로 넘침 같은 계산 스타일을 눈으로 확인할 때 쓰는 보조 단언이고 CI에서 실행되지 않는다(vitest의 addon-vitest 연동 제거,
 *   `vitest.config.ts` 머리말). 클래스 단언은 `__tests__/ArticleView.test.tsx`가 보증한다.
 * - 커버는 외부 요청 없이 뜨도록 `data:` SVG 가짜 이미지를 쓴다. 로드 실패는 정적 렌더로 재현되지 않아 깨진 경로 Story가 맡는다.
 */

/** 16:9 가짜 커버(1280×720). 칸 경계와 가장자리 잘림을 볼 수 있게 가로 줄무늬와 원을 넣었다. */
function fakeCover(background: string, accent: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">` +
    `<rect width="1280" height="720" fill="${background}"/>` +
    `<rect y="0" width="1280" height="90" fill="${accent}" opacity="0.35"/>` +
    `<rect y="630" width="1280" height="90" fill="${accent}" opacity="0.35"/>` +
    `<circle cx="640" cy="360" r="170" fill="${accent}"/>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const COVER = fakeCover('#3a5f7d', '#f2c14e')
const BROKEN = '/badges/sample/없는-파일.png'

const FULL: ArticleViewData = {
  title: '가을 한강 러닝 코스 가이드',
  label: '기사',
  subtitle: '러너가 직접 걸어 본 코스 다섯 곳',
  coverUrl: COVER,
  publishedAt: '2026-10-05T09:00:00+09:00',
  paragraphs: [
    '가을 한강은 달리기 좋은 계절이에요. 선선한 바람이 불고 해가 짧아져서 저녁 러닝이 한결 편해져요.',
    '첫 번째 코스는 여의도 한강공원에서 반포대교까지예요.\n왕복 약 10km이고 평지라 초보 러너도 부담이 적어요.',
    '코스 중간에 쉬어 갈 수 있는 보급 지점이 세 곳 있어요. 출발 전에 물과 가벼운 간식을 챙겨 가세요.',
  ],
  cta: { label: '미션 보기', href: '/missions/m1' },
}

const STACK_STYLE: CSSProperties = { display: 'flex', gap: 'var(--spacing-32)', flexWrap: 'wrap', alignItems: 'flex-start' }
const CAPTION_STYLE: CSSProperties = { margin: '0 0 var(--spacing-8)', fontSize: 'var(--text-caption)', color: 'rgba(255,255,255,0.6)' }

/** 화면 전체 폭 프레임. 앱 화면처럼 폭이 고정되고 배경은 앱 배경(`--color-bg`)이다. */
function Frame({ width, caption, children }: { width: number; caption?: string; children: ReactNode }) {
  return (
    <div style={{ width }}>
      {caption && <p style={CAPTION_STYLE}>{caption}</p>}
      <div data-frame style={{ width, background: 'var(--color-bg)' }}>
        {children}
      </div>
    </div>
  )
}

const framesOf = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('[data-frame]'))

function expectNoHorizontalOverflow(root: HTMLElement) {
  const frames = framesOf(root)
  expect(frames.length).toBeGreaterThan(0)
  for (const frame of frames) expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth)
}

// ─── 메타 ────────────────────────────────────────────────────────────────

const meta: Meta<typeof ArticleView> = {
  title: '서비스/Today/ArticleView',
  component: ArticleView,
  args: { view: FULL },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '기사 화면(`/today/[cardId]`) 본문 — 티켓 20261001_1737(상위 20260930_1453 조각 b3). 커버(16:9, 없으면 칸 없이 본문부터) · 칩(`LabelChip tone="inverse"`) · ' +
          '제목(h1) · 부제 · 게재일 · 본문 문단 · CTA 필. 표시 데이터(`ArticleView`)만 받는다 — 카드 행·DB는 모르고, 변환은 `toArticleView`(`lib/today/articleView.ts`)가 한다. ' +
          'TopNav는 페이지가 그린다. CTA는 `href`가 있으면 링크, 없으면 같은 모양의 정적 필(운영툴 미리보기)이다. 서비스 전용이라 MODULAR이 아니다.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

// ─── 1. 기본 ─────────────────────────────────────────────────────────────

/** 커버·부제·게재일·문단·CTA가 모두 있는 기본 모습. 칩이 LabelChip 규격(높이 24px)이고 위아래 여백이 어긋나지 않는다. */
export const Default: Story = {
  name: '기본 — 커버 · 칩 · 제목 · 부제 · 게재일 · 문단 · CTA',
  render: (args) => (
    <Frame width={360}>
      <ArticleView {...args} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const cover = canvasElement.querySelector<HTMLElement>('.aspect-video')!
    const { width, height } = cover.getBoundingClientRect()
    expect(Math.abs(height - (width * 9) / 16)).toBeLessThanOrEqual(1)
    // 「← 오늘로」 링크가 없다
    expect(canvasElement.textContent).not.toContain('투데이로')
    // 칩 높이는 LabelChip 규격(24px)이고 감싼 줄과 같아 줄 상자 여백이 없다
    const chip = canvasElement.querySelector<HTMLElement>('article span')!
    expect(Math.abs(chip.getBoundingClientRect().height - 24)).toBeLessThanOrEqual(1)
    expect(Math.abs(chip.parentElement!.getBoundingClientRect().height - chip.getBoundingClientRect().height)).toBeLessThanOrEqual(0.5)
    // CTA는 링크이고 터치 영역이 44px 이상이다
    const cta = canvasElement.querySelector<HTMLAnchorElement>('a')!
    expect(cta.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    expect(cta.textContent).toBe('미션 보기')
    expectNoHorizontalOverflow(canvasElement)
  },
}

// ─── 2. 커버 ─────────────────────────────────────────────────────────────

/** 커버가 없으면 16:9 칸을 만들지 않고 TopNav 바로 아래 24px 여백부터 칩이 시작한다. */
export const NoCover: Story = {
  name: '커버 없음 — 칸 없이 본문부터',
  render: () => (
    <Frame width={360}>
      <ArticleView view={{ ...FULL, coverUrl: undefined }} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('.aspect-video')).toBeNull()
    expect(canvasElement.querySelector('img')).toBeNull()
    // 본문(article)이 프레임 맨 위에서 24px 안쪽에 시작한다
    const frame = framesOf(canvasElement)[0]
    const chip = canvasElement.querySelector<HTMLElement>('article span')!
    expect(Math.abs(chip.getBoundingClientRect().top - frame.getBoundingClientRect().top - 24)).toBeLessThanOrEqual(1)
  },
}

/** 커버 주소가 있는데 로드에 실패하면 칸이 사라진다(`SafeImage` 기본 동작). 정적 렌더로 재현되지 않아 이 Story의 `play`가 확인한다. */
export const CoverLoadFailed: Story = {
  name: '커버 로드 실패 — 칸이 사라짐(기존 동작)',
  render: () => (
    <Frame width={360} caption="깨진 경로 — 이미지 칸 없이 본문만 남는다">
      <ArticleView view={{ ...FULL, coverUrl: BROKEN }} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    // 깨진 경로가 사라질 시간을 준다
    await new Promise((resolve) => setTimeout(resolve, 800))
    expect(canvasElement.querySelector('img')).toBeNull()
    expect(canvasElement.textContent).toContain('가을 한강 러닝 코스 가이드')
    expectNoHorizontalOverflow(canvasElement)
  },
}

// ─── 3. 부제·본문·CTA ──────────────────────────────────────────────────────

export const NoSubtitle: Story = {
  name: '부제 없음',
  render: () => (
    <Frame width={360}>
      <ArticleView view={{ ...FULL, subtitle: undefined }} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.textContent).not.toContain('러너가 직접 걸어 본 코스')
    expect(canvasElement.textContent).toContain('2026년 10월 5일')
  },
}

/** 본문이 없으면 「본문이 없어요」를 /60으로 보인다(옛 /40은 대비 미달이라 올렸다). */
export const NoBody: Story = {
  name: '본문 없음 — 「본문이 없어요」',
  render: () => (
    <Frame width={360}>
      <ArticleView view={{ ...FULL, paragraphs: [] }} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.textContent).toContain('본문이 없어요')
    expect(canvasElement.querySelectorAll('.whitespace-pre-line')).toHaveLength(0)
  },
}

/** 대상이 하나도 없으면 CTA 블록이 없다. */
export const NoCta: Story = {
  name: 'CTA 없음 — 블록 자체가 없음',
  render: () => (
    <Frame width={360}>
      <ArticleView view={{ ...FULL, cta: undefined }} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    expect(canvasElement.querySelector('a')).toBeNull()
    expect(canvasElement.querySelector('.min-h-11')).toBeNull()
  },
}

/** 운영툴 미리보기: CTA 라벨은 보이지만 링크가 없어 같은 모양의 정적 필이다(누르기 반응도 없다). 위(링크 있음)와 높이·폭이 같다. */
export const CtaWithoutLink: Story = {
  name: 'CTA 링크 없음(미리보기) — 같은 모양의 정적 필',
  render: () => (
    <div style={STACK_STYLE}>
      <Frame width={360} caption="링크 있음 (기준)">
        <ArticleView view={{ ...FULL, coverUrl: undefined }} />
      </Frame>
      <Frame width={360} caption="링크 없음 — 정적 필">
        <ArticleView view={{ ...FULL, coverUrl: undefined, cta: { label: '미션 보기' } }} />
      </Frame>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [linked, fixed] = framesOf(canvasElement)
    expect(linked.querySelector('a')).not.toBeNull()
    expect(fixed.querySelector('a')).toBeNull()
    const linkedCta = linked.querySelector<HTMLElement>('a')!
    const fixedCta = fixed.querySelector<HTMLElement>('.min-h-11')!
    expect(fixedCta.textContent).toBe('미션 보기')
    expect(fixedCta.getBoundingClientRect().width).toBeCloseTo(linkedCta.getBoundingClientRect().width, 0)
    expect(fixedCta.getBoundingClientRect().height).toBeCloseTo(linkedCta.getBoundingClientRect().height, 0)
    expect(getComputedStyle(fixedCta).transitionProperty).not.toContain('transform')
  },
}

// ─── 4. 긴 글 ─────────────────────────────────────────────────────────────

/** 긴 제목은 말줄임 없이 줄바꿈된다. 긴 문단과 문단 안 줄바꿈도 그대로 보인다. */
export const LongTitle: Story = {
  name: '긴 제목 — 줄바꿈(말줄임 없음) · 긴 문단 · 문단 안 줄바꿈 보존',
  render: () => (
    <Frame width={360}>
      <ArticleView
        view={{
          ...FULL,
          title: '한강 둔치를 따라 달리는 가을 밤 러닝 챌린지에 함께할 러너들을 모집하는 아주 길고 긴 기사 제목입니다 끝까지 다 보여야 해요',
          paragraphs: [
            '아주 긴 문단이에요. '.repeat(20),
            '첫째 줄\n둘째 줄\n셋째 줄',
          ],
        }}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const title = canvasElement.querySelector<HTMLElement>('h1')!
    const lineHeight = parseFloat(getComputedStyle(title).lineHeight)
    // 한 줄보다 높다(줄바꿈) — 말줄임이면 한 줄에 머문다
    expect(title.getBoundingClientRect().height).toBeGreaterThan(lineHeight + 1)
    expect(getComputedStyle(title).textOverflow).not.toBe('ellipsis')
    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
    expectNoHorizontalOverflow(canvasElement)
  },
}

// ─── 5. 폭 ───────────────────────────────────────────────────────────────

/** 360·430 기기 화면 폭 나란히. 커버는 폭 × 9/16(360 → 202.5px, 430 → 241.9px)이고 가로 넘침이 없다. */
export const Widths: Story = {
  name: '폭 360 · 430 나란히',
  render: () => (
    <div style={STACK_STYLE}>
      <Frame width={360} caption="360 기기">
        <ArticleView view={FULL} />
      </Frame>
      <Frame width={430} caption="430 기기 (앱 열 최대폭)">
        <ArticleView view={FULL} />
      </Frame>
    </div>
  ),
  play: async ({ canvasElement }) => {
    expectNoHorizontalOverflow(canvasElement)
    for (const frame of framesOf(canvasElement)) {
      const cover = frame.querySelector<HTMLElement>('.aspect-video')!
      const { width, height } = cover.getBoundingClientRect()
      expect(width).toBeCloseTo(frame.clientWidth, 0)
      expect(Math.abs(height - (width * 9) / 16)).toBeLessThanOrEqual(1)
    }
  },
}
