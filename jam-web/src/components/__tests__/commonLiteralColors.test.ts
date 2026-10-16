/**
 * 공통 컴포넌트·lib·CSS에 다크 바탕을 전제로 직접 적은 색이 남지 않았는지 확인한다 (티켓 20261015_2134, 2회)
 *
 * JAM 2.0 라이트 전환 뒤에도 코드에 직접 적은 흰 글자·흰/검정 반투명 면·불투명도 글자 단계
 * (`text-foreground/60`)·Base 직접 참조·리터럴 그림자·`backdrop-blur`는 토큰을 따라 바뀌지 않아
 * 크림·흰 면 위에서 사라지거나 대비가 무너진다(실측 1.0x~3.4:1). 아래 파일에서 이 패턴이 다시 생기면 실패한다.
 * 서비스 화면 25개 파일은 `app/(main)/__tests__/serviceLiteralColors.test.ts`가 맡는다(1회).
 *
 * 허용 목록은 사유가 있는 것만 둔다. 어두운 이미지·영상·블롭·막 위 글자는 리터럴 흰색이 아니라
 * `--snow` 토큰을 쓰므로 이 패턴에 걸리지 않는다.
 *
 * 실행: cd jam-web && npx vitest run src/components/__tests__/commonLiteralColors.test.ts
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** src 기준 경로 */
const FILES = [
  // 티켓 2회 목록
  'components/PoiCarouselModal.tsx',
  'components/map/MapView.tsx',
  'components/strava/StravaStatusCard.tsx',
  'components/StravaLink.tsx',
  'components/NavigationLoader.tsx',
  'components/inventory/InventoryGrid.tsx',
  'components/inventory/ItemCandidateRow.tsx',
  'components/today/CardChipRow.tsx',
  'components/today/PosterCard.tsx',
  'components/ui/BadgeGridCard.tsx',
  'components/ui/SlidingTabs.tsx',
  'components/transitions.css',
  'components/transitions-pages.css',
  'app/globals.css',
  'lib/badgeBackgroundTheme.ts',
  'lib/blobAnimation.ts',
  // 채원① 권고로 2회에 편입한 13개 파일
  'components/BadgeRevealOverlay.tsx',
  'components/badges/BadgeTrophyGridCard.tsx',
  'components/inventory/ItemCandidateSheet.tsx',
  'components/today/ArticleView.tsx',
  'components/today/CardImageSlot.tsx',
  'app/(main)/collections/[id]/SlotGrid.tsx',
  'app/(main)/combine/CombineClient.tsx',
  'app/(main)/drops/DropsClient.tsx',
  'app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx',
  'app/(main)/philosophy/page.tsx',
  'app/(legal)/location-terms/page.tsx',
  'app/(main)/voc/VocPagination.tsx',
  'app/(auth)/login/page.tsx',
]

const LITERAL_COLOR =
  /text-white|bg-black|bg-white|border-white|white\/|black\/|rgba\(\s*(255|0,\s*0|232)|#fff|#FFF|#000|#e8461f|#E8461F|yellow-[0-9]|text-foreground\/[0-9]|text-\[var\(--muted\)\]\/[0-9]|placeholder:text-foreground\/|shadow-lg|backdrop-blur|shadow-\[0|--base-neutral/

/** 사유가 있는 예외 — 파일 경로와 줄 내용으로 가린다(줄 번호는 바뀌므로 쓰지 않는다) */
const ALLOWED: { file: string; line: RegExp; reason: string }[] = [
  {
    file: 'components/today/PosterCard.tsx',
    line: /from-black\/70 via-black\/30/,
    reason: '옛 BannerCard의 클래스 이름을 인용한 설명 주석 — 코드가 아니다',
  },
  {
    file: 'components/transitions.css',
    line: /mask-image: linear-gradient\(to bottom, transparent 0%, #000 22%/,
    reason: '릴 가장자리 마스크는 알파만 읽는다 — 색이 아니다',
  },
  {
    file: 'app/globals.css',
    line: /순수 #000이 되어/,
    reason: '필터 사용을 금지하는 이유를 설명한 주석',
  },
  {
    file: 'lib/badgeBackgroundTheme.ts',
    line: /textShadow: '0 1px 2px rgba\(0,0,0,0\.65\)/,
    reason: '이미지·블롭 위 글자 대비 보정 textShadow — 사용자 승인 2(2026-10-16)로 유지',
  },
]

describe('공통 컴포넌트·lib·CSS 직접 색 잔존', () => {
  for (const file of FILES) {
    it(`${file}에 다크 전제 리터럴 색이 없다`, () => {
      const source = readFileSync(path.resolve(__dirname, '../..', file), 'utf-8')
      const hits = source
        .split('\n')
        .map((text, index) => ({ no: index + 1, text }))
        .filter(({ text }) => LITERAL_COLOR.test(text))
        .filter(({ text }) => !ALLOWED.some((a) => a.file === file && a.line.test(text)))
      expect(hits.map(({ no, text }) => `${no}: ${text.trim()}`)).toEqual([])
    })
  }
})
