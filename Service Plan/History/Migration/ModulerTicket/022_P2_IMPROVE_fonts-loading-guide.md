---
id: DS-022
status: CLOSED
severity: P2
type: IMPROVE
category: Typography / Architecture
---

# DS-022 — 폰트 로딩 가이드 구체화

## Problem
`tokens/fonts.css`가 Google Fonts CDN `@import`를 제거하고 next/font 가이드 주석만 남겨뒀다. DS 소비자가 Noto Sans KR을 실제로 어떻게 로드해야 하는지 구체적 코드 예시가 없다. "next/font를 쓰세요"라는 주석만으로는 불충분하고, Next.js 외 환경(CRA, Vite, 순수 HTML)에서도 사용할 방법이 없다.

## Evidence
```css
/* tokens/fonts.css */
/*
 * JAM! DS v2 — 폰트 로딩 안내
 *
 * CDN @import는 런타임 네트워크 의존성을 만들기 때문에 제거됨.
 * Next.js 프로젝트에서는 next/font/google을 사용할 것:
 *
 * import { Noto_Sans_KR } from 'next/font/google'
 * const notoSansKR = Noto_Sans_KR({ subsets: ['latin'], weight: ['300','400','500','600','900'] })
 */
```
실제 코드 스니펫이 없고, 비 Next.js 환경 대안이 없다.

## Reference
기존 DS는 Next.js 전용이라 next/font만 쓰면 됐다. v2는 독립 DS를 목표로 하므로 다양한 환경 지원 문서가 필요하다.

## Recommendation
`readme.md` 또는 `fonts.css` 확장 주석에 환경별 가이드를 추가한다.

```md
## 폰트 설정

### Next.js (권장)
\`\`\`jsx
// app/layout.tsx
import { Noto_Sans_KR } from 'next/font/google'
const notoSansKR = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '900'],
  variable: '--font-noto-sans-kr',
})
export default function RootLayout({ children }) {
  return <html className={notoSansKR.variable}><body>{children}</body></html>
}
\`\`\`
\`tokens/fonts.css\`의 \`--font-family-base\`가 자동으로 연결됩니다.

### Vite / CRA
\`\`\`html
<!-- index.html -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;900&display=swap" rel="stylesheet">
\`\`\`

### 자체 호스팅
Noto Sans KR woff2 파일을 다운로드 후 \`@font-face\`로 직접 정의.
```

## Impact
- `readme.md` 또는 `fonts.css` 주석 업데이트 — 코드 변경 없음
- DS 소비자의 폰트 설정 오류 감소

## Risk
- Google Fonts URL이 변경될 경우 가이드가 낡아짐 — 주기적 검토 필요

## Acceptance Criteria
- [ ] Next.js, Vite/CRA, 자체 호스팅 세 가지 환경별 설정 예시 존재
- [ ] 각 환경에서 `--font-family-base`가 Noto Sans KR을 참조하도록 연결 설명
- [ ] weight 300/400/500/600/900 모두 포함된 예시

## 완료 기록

- **구현 내용**: `readme.md`에 "폰트 설정" 섹션 추가 — Next.js(next/font/google), Vite/CRA(Google Fonts CDN), 자체 호스팅(@font-face) 세 가지 환경별 코드 예시 포함. weight 300/400/500/600/900 전부 명시.
- **변경 파일**: `readme.md`
- **배포**: 2026-08-14, design-system-staging/v2
