/**
 * 서비스 화면에 다크 바탕을 전제로 직접 적은 색이 남지 않았는지 확인한다 (티켓 20261015_2134, 1회)
 *
 * JAM 2.0 라이트 전환 뒤에도 코드에 직접 적은 흰 글자·흰/검정 반투명 면·옛 빨강·노랑 Tailwind 색·
 * 불투명도 글자 단계(`text-foreground/60`)는 토큰을 따라 바뀌지 않아 크림·흰 면 위에서 사라지거나
 * 대비가 무너진다(실측 1.0x~3.4:1). 아래 25개 파일에서 이 패턴이 다시 생기면 실패한다.
 *
 * 허용 목록은 사유가 있는 것만 둔다. 어두운 이미지·영상·블롭·막 위 글자는 리터럴 흰색이 아니라
 * `--snow` 토큰을 쓰므로 이 패턴에 걸리지 않는다.
 *
 * 실행: cd jam-web && npx vitest run "src/app/(main)/__tests__/serviceLiteralColors.test.ts"
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** src/app 기준 경로 */
const FILES = [
  '(main)/FeedSection.tsx',
  '(main)/UserSearchBar.tsx',
  '(main)/[username]/FollowUserList.tsx',
  '(main)/badges/BadgesClient.tsx',
  '(main)/badges/[id]/BadgeShareButton.tsx',
  '(main)/badges/[id]/page.tsx',
  '(main)/badges/[id]/BadgeHeroSection.tsx',
  '(main)/collections/[id]/page.tsx',
  '(main)/collections/[id]/ItemBookHeroSection.tsx',
  '(main)/drops/BadgeDetailSheet.tsx',
  '(main)/drops/QuestPickupScene.tsx',
  '(main)/missions/MissionsListClient.tsx',
  '(main)/missions/[id]/MissionDetailClient.tsx',
  '(main)/missions/[id]/status/MissionStatusClient.tsx',
  '(main)/notifications/NotificationsClient.tsx',
  '(main)/onboarding/page.tsx',
  '(main)/points/page.tsx',
  '(main)/profile/ProfileClient.tsx',
  '(main)/profile/edit/page.tsx',
  '(main)/search/page.tsx',
  '(main)/voc/page.tsx',
  'error.tsx',
  'forbidden/page.tsx',
  '(legal)/privacy/page.tsx',
  '(main)/combine/RecipeRewardRow.tsx',
]

const LITERAL_COLOR =
  /text-white|bg-black|bg-white|border-white|white\/|black\/|rgba\(\s*(255|0,\s*0|232)|#fff|#FFF|#000|#e8461f|#E8461F|yellow-[0-9]|text-foreground\/[0-9]|text-\[var\(--muted\)\]\/[0-9]|placeholder:text-foreground\/|shadow-lg/

/** 사유가 있는 예외 — 파일 경로와 줄 내용으로 가린다(줄 번호는 바뀌므로 쓰지 않는다) */
const ALLOWED: { file: string; line: RegExp; reason: string }[] = [
  {
    file: '(main)/onboarding/page.tsx',
    line: /bg-black\/10/,
    reason: '트라이브 선택 카드 안 대체 썸네일 — 카드째 JAM 2.0 때 바꾼다(사용자 지시, 티켓 20261015_2134)',
  },
]

describe('서비스 화면 직접 색 잔존', () => {
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
