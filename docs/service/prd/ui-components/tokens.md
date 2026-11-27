---
type: prd
status: active
description: "디자인 토큰의 층·이름·값·클래스·사용 수 카탈로그다. 생성기가 만들며 손으로 고치지 않는다."
related:
  - "20261126_2116"
code:
  - "jam-web/design-system/tokens"
  - "jam-web/src/app/jam-theme.css"
  - "jam-web/src/app/admin-theme.css"
  - "jam-web/src/app/globals.css"
---

# 디자인 토큰 카탈로그

이 문서는 `node scripts/gen-token-catalog.mjs`가 만든다. 손으로 고치지 않는다. 토큰이나 이를 쓰는 코드가 바뀌었는데 문서가 낡았으면 `verify`의 `token-catalog` 단계가 실패하고, pre-commit이 스테이지된 변경에 맞춰 다시 만들어 스테이지한다.
정본 컴포넌트 목록은 [README](README.md)에 있다.

<!-- BEGIN generated: gen-token-catalog -->
토큰 442개 · 기본값 (primitive) 134개 · 의미 (semantic) 50개 · 컴포넌트 (component) 120개 · 어드민 (admin) 138개 · 쓰는 곳 0인 토큰 23개

**층 규칙**: 색·px·ms 같은 직접 값은 기본값 층에만 둔다. 의미 층과 컴포넌트 층은 기본값을 참조한다.
화면 코드는 의미·컴포넌트 토큰과 서비스 눈금 클래스만 쓴다. 기본값을 직접 쓸 수 있는 곳은 토큰 파일·정본 폴더 등 일부뿐이다.
전문은 티켓 `20261126_1908`(9-1회차 «층 규칙»)과 `jam-web/design-system/tokens/primitive.css` 머리 주석에 있다.

**열 설명** — 정의 값은 파일에 적힌 그대로, 최종 값은 `:root` 기준으로 `var()`를 끝까지 따라간 값이다(같으면 〃, 못 풀면 정의 값).
`var()` 수·클래스 사용·문자열은 `jam-web/src`와 `jam-web/design-system`의 `.ts`·`.tsx`·`.css`에서 센 값이다(주석·시험·스토리·토큰 파일 자신 제외). 토큰 파일 중 `globals.css`는 일반 규칙의 `var()`만 센다.
클래스 사용에는 Tailwind 유틸리티 경유(`font-*`→굵기, `tracking-*`, `leading-*`, `animate-*`, `aspect-*`, 모든 간격 클래스→`--spacing`, `text-*`→행간 쌍, 어드민 단독 `rounded`·`shadow`·`blur`)가 들어간다. 문자열은 `"--이름"` 꼴로 데이터에 적어 두고 `var(${이름})`으로 읽는 곳이다.
쓰이는 토큰이 값 안에서 가리키는 재료(끝까지 따라감)와 Tailwind 기본 스타일이 읽는 토큰은 «쓰는 곳 0»에서 뺀다.
토큰 안 참조는 토큰 파일(globals.css의 `@theme inline` 포함) 안에서 다른 토큰이 가리키는 수다. 서비스와 어드민이 같은 이름을 쓰면 사용 수는 양쪽 줄에 같은 값으로 나온다.

## 기본값 (primitive)

| 이름 | 정의 값 | 최종 값 | 클래스 | var() | 클래스 사용 | 문자열 | 쓰는 파일 | 토큰 안 참조 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| `--base-white` | `#ffffff` | 〃 | — | 0 | 0 | 0 | 0 | 6 | 다른 토큰의 재료로 쓰임 |
| `--base-snow` | `#fcfcfc` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-black` | `#000000` | 〃 | — | 0 | 0 | 0 | 0 | 8 | 다른 토큰의 재료로 쓰임 |
| `--base-neutral-50` | `#fafafa` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--base-neutral-100` | `#f5f5f5` | 〃 | — | 0 | 0 | 0 | 0 | 2 | 다른 토큰의 재료로 쓰임 |
| `--base-neutral-200` | `#e5e5e5` | 〃 | — | 0 | 0 | 0 | 0 | 7 | 다른 토큰의 재료로 쓰임 |
| `--base-neutral-300` | `#d4d4d4` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--base-neutral-400` | `#a3a3a3` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-neutral-500` | `#737373` | 〃 | — | 0 | 0 | 0 | 0 | 2 | 다른 토큰의 재료로 쓰임 |
| `--base-neutral-600` | `#525252` | 〃 | — | 1 | 0 | 0 | 1 | 2 | — |
| `--base-neutral-700` | `#404040` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--base-neutral-800` | `#262626` | 〃 | — | 1 | 0 | 0 | 1 | 1 | — |
| `--base-neutral-900` | `#171717` | 〃 | — | 0 | 0 | 0 | 0 | 9 | 다른 토큰의 재료로 쓰임 |
| `--base-neutral-950` | `#0a0a0a` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-danger-red` | `#d61f1f` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-point-orange` | `#ff4400` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-rarity-green` | `#00cc7a` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-rarity-amber` | `#f5a300` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-rarity-pink` | `#ff2d87` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--base-capsule-orange` | `#f94c31` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--jam-red` | `#FF1D1D` | 〃 | `*-jam-red` | 5 | 1 | 1 | 6 | 2 | — |
| `--jam-yellow` | `#F9FD69` | 〃 | `*-jam-yellow` | 4 | 0 | 1 | 2 | 1 | — |
| `--jam-green` | `#59C02B` | 〃 | `*-jam-green` | 3 | 0 | 1 | 3 | 2 | — |
| `--jam-purple` | `#BA8AF7` | 〃 | `*-jam-purple` | 2 | 0 | 1 | 2 | 1 | — |
| `--jam-blue` | `#0695EC` | 〃 | `*-jam-blue` | 2 | 0 | 1 | 2 | 1 | — |
| `--jam-coral` | `#D3474D` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--jam-pink` | `#F372C1` | 〃 | `*-jam-pink` | 2 | 0 | 1 | 2 | 1 | — |
| `--jam-sky` | `#51CDF5` | 〃 | `*-jam-sky` | 2 | 0 | 1 | 2 | 1 | — |
| `--jam-green-deep` | `#3D851E` | 〃 | `*-jam-green-deep` | 0 | 0 | 1 | 1 | 1 | — |
| `--jam-chip-white` | `#FFFFFF` | 〃 | `*-jam-chip-white` | 0 | 0 | 1 | 1 | 1 | — |
| `--radius-xs` | `0.125rem` | 〃 | `rounded-xs` | 0 | 0 | 0 | 0 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-sm` | `0.25rem` | 〃 | `rounded-sm` | 0 | 18 | 0 | 12 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-md` | `0.375rem` | 〃 | `rounded-md` | 0 | 92 | 0 | 57 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-lg` | `0.5rem` | 〃 | `rounded-lg` | 2 | 154 | 0 | 84 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-xl` | `0.75rem` | 〃 | `rounded-xl` | 4 | 158 | 0 | 46 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-2xl` | `1rem` | 〃 | `rounded-2xl` | 15 | 111 | 0 | 76 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-3xl` | `1.5rem` | 〃 | `rounded-3xl` | 0 | 1 | 0 | 1 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-4xl` | `2rem` | 〃 | `rounded-4xl` | 0 | 0 | 0 | 0 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--radius-full` | `9999px` | 〃 | — | 19 | 0 | 0 | 11 | 0 | — |
| `--spacing-4` | `4px` | 〃 | — | 7 | 0 | 0 | 3 | 0 | — |
| `--spacing-8` | `8px` | 〃 | — | 9 | 0 | 0 | 5 | 1 | — |
| `--spacing-12` | `12px` | 〃 | — | 7 | 0 | 0 | 3 | 3 | — |
| `--spacing-16` | `16px` | 〃 | — | 7 | 0 | 0 | 4 | 5 | — |
| `--spacing-20` | `20px` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--spacing-24` | `24px` | 〃 | — | 5 | 0 | 0 | 1 | 2 | — |
| `--spacing-32` | `32px` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--spacing-40` | `40px` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--spacing-48` | `48px` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--spacing-64` | `64px` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--spacing-96` | `96px` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--duration-micro` | `80ms` | 〃 | — | 6 | 0 | 0 | 5 | 1 | — |
| `--duration-quick` | `150ms` | 〃 | — | 6 | 0 | 0 | 5 | 2 | — |
| `--duration-fast` | `250ms` | 〃 | — | 11 | 0 | 0 | 4 | 5 | — |
| `--duration-medium` | `350ms` | 〃 | — | 1 | 0 | 0 | 1 | 3 | — |
| `--duration-slow` | `400ms` | 〃 | — | 3 | 0 | 0 | 2 | 3 | — |
| `--duration-stagger` | `40ms` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--duration-very-slow` | `500ms` | 〃 | — | 0 | 0 | 0 | 0 | 2 | 다른 토큰의 재료로 쓰임 |
| `--ease-linear` | `linear` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--ease-smooth-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | 〃 | — | 18 | 0 | 0 | 8 | 9 | — |
| `--ease-bounce` | `cubic-bezier(0.34, 1.36, 0.64, 1)` | 〃 | — | 0 | 0 | 0 | 0 | 1 | 다른 토큰의 재료로 쓰임 |
| `--ease-out` | `ease-out` | 〃 | `ease-out` | 11 | 13 | 0 | 11 | 2 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--ease-in-out` | `ease-in-out` | 〃 | `ease-in-out` | 0 | 5 | 0 | 4 | 3 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--scale-press` | `0.96` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--scale-press-card` | `0.98` | 〃 | — | 3 | 0 | 0 | 3 | 0 | — |
| `--scale-modal` | `0.96` | 〃 | — | 0 | 0 | 0 | 0 | 0 | — |
| `--scale-compact` | `0.7` | 〃 | — | 5 | 0 | 0 | 1 | 0 | — |
| `--font-family-base` | `"Noto Sans KR", -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif` | 〃 | — | 15 | 0 | 0 | 12 | 1 | — |
| `--text-xs` | `0.75rem` | 〃 | `text-xs` | 17 | 836 | 0 | 230 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-xs--line-height` | `calc(1 / 0.75)` | 〃 | `text-xs` | 11 | 836 | 0 | 226 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-sm` | `0.875rem` | 〃 | `text-sm` | 7 | 963 | 0 | 299 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-sm--line-height` | `calc(1.25 / 0.875)` | 〃 | `text-sm` | 4 | 963 | 0 | 298 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-base` | `1rem` | 〃 | `text-base` | 12 | 136 | 0 | 85 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-base--line-height` | `calc(1.5 / 1)` | 〃 | `text-base` | 9 | 136 | 0 | 82 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-lg` | `1.125rem` | 〃 | `text-lg` | 0 | 61 | 0 | 39 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-lg--line-height` | `calc(1.75 / 1.125)` | 〃 | `text-lg` | 0 | 61 | 0 | 39 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-xl` | `1.25rem` | 〃 | `text-xl` | 2 | 21 | 0 | 21 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-xl--line-height` | `calc(1.75 / 1.25)` | 〃 | `text-xl` | 1 | 21 | 0 | 20 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-2xl` | `1.5rem` | 〃 | `text-2xl` | 3 | 88 | 0 | 86 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--text-2xl--line-height` | `calc(2 / 1.5)` | 〃 | `text-2xl` | 1 | 88 | 0 | 84 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--leading-loose` | `1.6` | 〃 | `leading-loose` | 0 | 2 | 0 | 1 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--leading-reading` | `1.75` | 〃 | `leading-reading` | 0 | 10 | 0 | 4 | 1 | jam-theme.css는 이름만 알리고 값은 이 정의를 가리킴 |
| `--spacing` | `0.25rem` | 〃 | `p-4·gap-2 등 간격 클래스 전부` | 0 | 5748 | 0 | 460 | 0 | — |
| `--breakpoint-sm` | `40rem` | 〃 | `sm:` | 0 | 75 | 0 | 27 | 0 | — |
| `--breakpoint-md` | `48rem` | 〃 | `md:` | 0 | 173 | 0 | 87 | 0 | — |
| `--breakpoint-lg` | `64rem` | 〃 | `lg:` | 0 | 35 | 0 | 22 | 0 | — |
| `--breakpoint-xl` | `80rem` | 〃 | `xl:` | 0 | 11 | 0 | 6 | 0 | — |
| `--breakpoint-2xl` | `96rem` | 〃 | `2xl:` | 0 | 4 | 0 | 4 | 0 | — |
| `--container-3xs` | `16rem` | 〃 | `max-w-3xs` | 0 | 0 | 0 | 0 | 0 | — |
| `--container-2xs` | `18rem` | 〃 | `max-w-2xs` | 0 | 0 | 0 | 0 | 0 | — |
| `--container-xs` | `20rem` | 〃 | `max-w-xs` | 0 | 4 | 0 | 3 | 0 | — |
| `--container-sm` | `24rem` | 〃 | `max-w-sm` | 0 | 22 | 0 | 16 | 0 | — |
| `--container-md` | `28rem` | 〃 | `max-w-md` | 0 | 10 | 0 | 9 | 0 | — |
| `--container-lg` | `32rem` | 〃 | `max-w-lg` | 0 | 6 | 0 | 5 | 0 | — |
| `--container-xl` | `36rem` | 〃 | `max-w-xl` | 0 | 1 | 0 | 1 | 0 | — |
| `--container-2xl` | `42rem` | 〃 | `max-w-2xl` | 0 | 5 | 0 | 5 | 0 | — |
| `--container-3xl` | `48rem` | 〃 | `max-w-3xl` | 0 | 1 | 0 | 1 | 0 | — |
| `--container-4xl` | `56rem` | 〃 | `max-w-4xl` | 0 | 32 | 0 | 5 | 0 | — |
| `--container-5xl` | `64rem` | 〃 | `max-w-5xl` | 0 | 0 | 0 | 0 | 0 | — |
| `--container-6xl` | `72rem` | 〃 | `max-w-6xl` | 0 | 1 | 0 | 1 | 0 | — |
| `--container-7xl` | `80rem` | 〃 | `max-w-7xl` | 0 | 0 | 0 | 0 | 0 | — |
| `--text-3xl` | `1.875rem` | 〃 | `text-3xl` | 1 | 33 | 0 | 32 | 0 | — |
| `--text-3xl--line-height` | `calc(2.25 / 1.875)` | 〃 | `text-3xl` | 1 | 33 | 0 | 32 | 0 | — |
| `--text-4xl` | `2.25rem` | 〃 | `text-4xl` | 0 | 2 | 0 | 2 | 0 | — |
| `--text-4xl--line-height` | `calc(2.5 / 2.25)` | 〃 | `text-4xl` | 0 | 2 | 0 | 2 | 0 | — |
| `--text-5xl` | `3rem` | 〃 | `text-5xl` | 0 | 2 | 0 | 2 | 0 | — |
| `--text-5xl--line-height` | `1` | 〃 | `text-5xl` | 0 | 2 | 0 | 2 | 0 | — |
| `--font-weight-thin` | `100` | 〃 | `font-thin` | 0 | 0 | 0 | 0 | 0 | — |
| `--font-weight-extralight` | `200` | 〃 | `font-extralight` | 0 | 0 | 0 | 0 | 0 | — |
| `--font-weight-light` | `300` | 〃 | `font-light` | 0 | 0 | 0 | 0 | 0 | — |
| `--font-weight-normal` | `400` | 〃 | `font-normal` | 0 | 45 | 0 | 21 | 0 | — |
| `--font-weight-medium` | `500` | 〃 | `font-medium` | 0 | 386 | 0 | 151 | 0 | — |
| `--font-weight-semibold` | `600` | 〃 | `font-semibold` | 0 | 211 | 0 | 105 | 0 | — |
| `--font-weight-bold` | `700` | 〃 | `font-bold` | 0 | 298 | 0 | 167 | 0 | — |
| `--font-weight-extrabold` | `800` | 〃 | `font-extrabold` | 0 | 7 | 0 | 2 | 0 | — |
| `--font-weight-black` | `900` | 〃 | `font-black` | 0 | 10 | 0 | 7 | 0 | — |
| `--tracking-tighter` | `-0.05em` | 〃 | `tracking-tighter` | 0 | 1 | 0 | 1 | 0 | — |
| `--tracking-tight` | `-0.025em` | 〃 | `tracking-tight` | 0 | 8 | 0 | 7 | 0 | — |
| `--tracking-normal` | `0em` | 〃 | `tracking-normal` | 0 | 1 | 0 | 1 | 0 | — |
| `--tracking-wide` | `0.025em` | 〃 | `tracking-wide` | 0 | 1 | 0 | 1 | 0 | — |
| `--tracking-wider` | `0.05em` | 〃 | `tracking-wider` | 0 | 8 | 0 | 4 | 0 | — |
| `--tracking-widest` | `0.1em` | 〃 | `tracking-widest` | 0 | 3 | 0 | 3 | 0 | — |
| `--leading-tight` | `1.25` | 〃 | `leading-tight` | 0 | 11 | 0 | 7 | 0 | — |
| `--leading-snug` | `1.375` | 〃 | `leading-snug` | 0 | 8 | 0 | 6 | 0 | — |
| `--leading-normal` | `1.5` | 〃 | `leading-normal` | 0 | 0 | 0 | 0 | 0 | — |
| `--leading-relaxed` | `1.625` | 〃 | `leading-relaxed` | 0 | 7 | 0 | 6 | 0 | — |
| `--drop-shadow-xs` | `0 1px 1px rgb(0 0 0 / 0.05)` | 〃 | `drop-shadow-xs` | 0 | 0 | 0 | 0 | 0 | — |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | 〃 | `ease-in` | 0 | 3 | 0 | 3 | 0 | — |
| `--animate-spin` | `spin 1s linear infinite` | 〃 | `animate-spin` | 0 | 13 | 0 | 9 | 0 | — |
| `--animate-pulse` | `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite` | 〃 | `animate-pulse` | 0 | 4 | 0 | 4 | 0 | — |
| `--aspect-video` | `16 / 9` | 〃 | `aspect-video` | 0 | 2 | 0 | 1 | 0 | — |
| `--default-transition-duration` | `150ms` | 〃 | `transition · transition-*` | 0 | 283 | 0 | 124 | 0 | — |
| `--default-transition-timing-function` | `cubic-bezier(0.4, 0, 0.2, 1)` | 〃 | `transition · transition-*` | 0 | 283 | 0 | 124 | 0 | — |
| `--default-font-family` | `var(--font-geist-sans)` | 〃 | — | 0 | 0 | 0 | 0 | 0 | Tailwind 기본 스타일이 읽음 |
| `--default-mono-font-family` | `var(--font-geist-mono)` | 〃 | — | 0 | 0 | 0 | 0 | 0 | Tailwind 기본 스타일이 읽음 |

## 의미 (semantic)

| 이름 | 정의 값 | 최종 값 | 클래스 | var() | 클래스 사용 | 문자열 | 쓰는 파일 | 토큰 안 참조 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| `--background` | `var(--base-neutral-100)` | `#f5f5f5` | `*-background` | 12 | 75 | 0 | 51 | 1 | — |
| `--background-secondary` | `var(--base-neutral-200)` | `#e5e5e5` | `*-background-secondary` | 12 | 12 | 0 | 16 | 1 | — |
| `--page-bg` | `var(--base-neutral-200)` | `#e5e5e5` | `*-page-bg` | 2 | 0 | 0 | 1 | 3 | — |
| `--card-bg` | `var(--base-white)` | `#ffffff` | `*-card-bg` | 9 | 10 | 0 | 18 | 2 | — |
| `--btn-secondary` | `var(--base-neutral-200)` | `#e5e5e5` | `*-btn-secondary` | 1 | 4 | 0 | 3 | 1 | — |
| `--background-inverse` | `var(--base-neutral-900)` | `#171717` | `*-background-inverse` | 14 | 14 | 0 | 20 | 3 | — |
| `--surface` | `var(--base-white)` | `#ffffff` | `*-surface` | 17 | 14 | 0 | 21 | 2 | — |
| `--surface-on-inverse` | `color-mix(in srgb, var(--snow) 15%, transparent)` | `color-mix(in srgb, #fcfcfc 15%, transparent)` | `*-surface-on-inverse` | 4 | 0 | 0 | 1 | 2 | — |
| `--foreground` | `var(--base-neutral-900)` | `#171717` | `*-foreground` | 77 | 598 | 2 | 221 | 6 | — |
| `--muted` | `var(--base-neutral-500)` | `#737373` | `*-muted` | 39 | 248 | 1 | 143 | 2 | — |
| `--link` | `var(--base-neutral-900)` | `#171717` | `*-link` | 5 | 12 | 2 | 17 | 1 | — |
| `--snow` | `var(--base-snow)` | `#fcfcfc` | `*-snow` | 36 | 31 | 0 | 38 | 7 | — |
| `--muted-on-inverse` | `color-mix(in srgb, var(--snow) 70%, transparent)` | `color-mix(in srgb, #fcfcfc 70%, transparent)` | `*-muted-on-inverse` | 5 | 8 | 0 | 6 | 2 | — |
| `--overlay-foreground` | `var(--base-white)` | `#ffffff` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--accent` | `var(--base-neutral-900)` | `#171717` | `*-accent` | 14 | 16 | 0 | 21 | 1 | — |
| `--accent-foreground` | `var(--snow)` | `#fcfcfc` | `*-accent-foreground` | 13 | 4 | 0 | 12 | 1 | — |
| `--accent-soft` | `var(--base-neutral-100)` | `#f5f5f5` | `*-accent-soft` | 1 | 0 | 0 | 1 | 1 | — |
| `--border` | `var(--base-neutral-200)` | `#e5e5e5` | `*-border` | 11 | 346 | 0 | 137 | 1 | — |
| `--field-border` | `var(--base-neutral-400)` | `#a3a3a3` | `*-field-border` | 2 | 0 | 0 | 2 | 1 | — |
| `--separator` | `var(--base-neutral-200)` | `#e5e5e5` | `*-separator` | 2 | 0 | 0 | 2 | 1 | — |
| `--backdrop` | `color-mix(in srgb, var(--base-black) 50%, transparent)` | `color-mix(in srgb, #000000 50%, transparent)` | `*-backdrop` | 5 | 2 | 0 | 5 | 1 | — |
| `--success` | `var(--base-neutral-900)` | `#171717` | `*-success` | 3 | 0 | 0 | 2 | 1 | — |
| `--warning` | `var(--base-neutral-600)` | `#525252` | `*-warning` | 1 | 1 | 0 | 2 | 1 | — |
| `--danger` | `var(--base-neutral-900)` | `#171717` | `*-danger` | 3 | 1 | 0 | 3 | 1 | — |
| `--danger-text` | `var(--base-danger-red)` | `#d61f1f` | `*-danger-text` | 0 | 1 | 0 | 1 | 1 | — |
| `--default` | `var(--base-neutral-200)` | `#e5e5e5` | `*-default` | 1 | 0 | 0 | 1 | 2 | — |
| `--default-soft` | `var(--base-neutral-200)` | `#e5e5e5` | `*-default-soft` | 4 | 0 | 0 | 4 | 1 | — |
| `--opacity-disabled` | `0.4` | 〃 | — | 2 | 0 | 0 | 2 | 0 | — |
| `--point-text` | `var(--base-point-orange)` | `#ff4400` | `*-point-text` | 1 | 2 | 0 | 2 | 1 | — |
| `--field-radius` | `100px` | 〃 | — | 3 | 0 | 0 | 2 | 0 | — |
| `--layout-card-padding` | `var(--spacing-24)` | `24px` | — | 3 | 0 | 0 | 3 | 0 | — |
| `--layout-section-gap` | `var(--spacing-48)` | `48px` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--layout-element-gap` | `var(--spacing-16)` | `16px` | — | 4 | 0 | 0 | 2 | 0 | — |
| `--page-top` | `var(--spacing-16)` | `16px` | — | 4 | 0 | 0 | 3 | 0 | — |
| `--page-bottom` | `var(--spacing-24)` | `24px` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--gap-card-detail` | `var(--spacing-12)` | `12px` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--card-padding` | `var(--spacing-16)` | `16px` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--gap-actions` | `var(--spacing-8)` | `8px` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--touch-target-min` | `44px` | 〃 | — | 7 | 0 | 1 | 5 | 0 | — |
| `--spacing-safe-top` | `env(safe-area-inset-top, 0px)` | 〃 | — | 2 | 0 | 0 | 2 | 0 | — |
| `--spacing-safe-bottom` | `env(safe-area-inset-bottom, 0px)` | 〃 | — | 5 | 0 | 0 | 5 | 1 | — |
| `--app-max-width` | `430px` | 〃 | — | 3 | 0 | 0 | 3 | 0 | — |
| `--topnav-height` | `56px` | 〃 | — | 2 | 0 | 0 | 2 | 0 | — |
| `--sheet-full-height` | `92dvh` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--sheet-max-height` | `75dvh` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--z-toast-scrim` | `59` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--z-toast` | `60` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--z-navigation-loader` | `9999` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--scrim-blur` | `8px` | 〃 | — | 11 | 0 | 0 | 4 | 0 | 덮어쓰기 있음 (@media (prefers-reduced-transparency: reduce) > :root) |
| `--card-bg-translucent` | `color-mix(in srgb, var(--card-bg) 72%, transparent)` | `color-mix(in srgb, #ffffff 72%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | — |

## 컴포넌트 (component)

| 이름 | 정의 값 | 최종 값 | 클래스 | var() | 클래스 사용 | 문자열 | 쓰는 파일 | 토큰 안 참조 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| `--rarity-common` | `var(--base-neutral-500)` | `#737373` | — | 4 | 0 | 0 | 4 | 0 | — |
| `--rarity-rare` | `var(--base-rarity-green)` | `#00cc7a` | — | 2 | 0 | 0 | 2 | 0 | — |
| `--rarity-epic` | `var(--base-rarity-amber)` | `#f5a300` | — | 2 | 0 | 0 | 2 | 0 | — |
| `--rarity-mystic` | `var(--base-rarity-pink)` | `#ff2d87` | — | 2 | 0 | 0 | 2 | 0 | — |
| `--rarity-common-foreground` | `var(--base-white)` | `#ffffff` | — | 3 | 0 | 0 | 3 | 0 | — |
| `--rarity-rare-foreground` | `var(--base-black)` | `#000000` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--rarity-epic-foreground` | `var(--base-black)` | `#000000` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--rarity-mystic-foreground` | `var(--base-black)` | `#000000` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--capsule-fill` | `var(--base-capsule-orange)` | `#f94c31` | — | 9 | 0 | 0 | 6 | 0 | — |
| `--capsule-track` | `var(--base-neutral-900)` | `#171717` | — | 7 | 0 | 0 | 3 | 0 | — |
| `--capsule-ring` | `var(--base-neutral-950)` | `#0a0a0a` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--chapter-card-bg` | `linear-gradient(180deg, var(--base-neutral-600) 0%, var(--base-neutral-800) 100%)` | `linear-gradient(180deg, #525252 0%, #262626 100%)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--map-drop-marker-active` | `var(--jam-green)` | `#59C02B` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--map-label-bg` | `color-mix(in srgb, var(--base-black) 65%, transparent)` | `color-mix(in srgb, #000000 65%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--tabbar-icon` | `var(--base-neutral-900)` | `#171717` | — | 1 | 0 | 0 | 1 | 0 | 덮어쓰기 있음 (@media (prefers-contrast: more) > :root, [data-service-theme]) |
| `--tabbar-icon-active` | `var(--foreground)` | `#171717` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--tabbar-icon-inverse` | `var(--muted-on-inverse)` | `color-mix(in srgb, #fcfcfc 70%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | 덮어쓰기 있음 (@media (prefers-contrast: more) > :root, [data-service-theme]) |
| `--mission-ticket` | `var(--jam-coral)` | `#D3474D` | — | 2 | 0 | 2 | 3 | 0 | — |
| `--mission-accent` | `var(--jam-red)` | `#FF1D1D` | — | 4 | 0 | 0 | 1 | 0 | — |
| `--login-background` | `var(--base-black)` | `#000000` | — | 2 | 0 | 0 | 1 | 0 | — |
| `--ticket-ink` | `var(--base-neutral-900)` | `#171717` | — | 14 | 0 | 0 | 2 | 0 | — |
| `--ticket-paper` | `var(--base-white)` | `#ffffff` | — | 3 | 0 | 0 | 1 | 0 | — |
| `--tabbar-background` | `color-mix(in srgb, var(--base-white) 72%, transparent)` | `color-mix(in srgb, #ffffff 72%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--tabbar-blur` | `20px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--tabbar-selection` | `color-mix(in srgb, var(--base-black) 8%, transparent)` | `color-mix(in srgb, #000000 8%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--tabbar-background-inverse-solid` | `color-mix(in srgb, var(--snow) 22%, var(--background-inverse))` | `color-mix(in srgb, #fcfcfc 22%, #171717)` | — | 1 | 0 | 0 | 1 | 1 | — |
| `--tabbar-background-inverse` | `color-mix(in srgb, var(--tabbar-background-inverse-solid) 75%, transparent)` | `color-mix(in srgb, color-mix(in srgb, #fcfcfc 22%, #171717) 75%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--tabbar-selection-inverse` | `var(--surface-on-inverse)` | `color-mix(in srgb, #fcfcfc 15%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--tabbar-bottom` | `max(10px, calc(var(--spacing-16) + var(--spacing-safe-bottom) - 32px))` | `max(10px, calc(16px + env(safe-area-inset-bottom, 0px) - 32px))` | — | 2 | 0 | 0 | 2 | 1 | — |
| `--tabbar-height` | `49px` | 〃 | — | 1 | 0 | 0 | 1 | 1 | — |
| `--floating-bar-width` | `calc(100% - 42px)` | 〃 | — | 2 | 0 | 0 | 2 | 0 | — |
| `--floating-bar-max-width` | `388px` | 〃 | — | 2 | 0 | 0 | 2 | 0 | — |
| `--toast-bottom` | `calc(var(--tabbar-bottom) + var(--tabbar-height) + 8px)` | `calc(max(10px, calc(16px + env(safe-area-inset-bottom, 0px) - 32px)) + 49px + 8px)` | — | 2 | 0 | 0 | 1 | 0 | — |
| `--tabbar-label-size` | `0.8125rem` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--tabbar-label-line-height` | `1` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--list-row-lead-size` | `48px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--list-row-indicator-size` | `24px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--list-row-gap` | `var(--spacing-12)` | `12px` | — | 4 | 0 | 0 | 1 | 0 | — |
| `--list-row-padding-x` | `var(--spacing-16)` | `16px` | — | 4 | 0 | 1 | 1 | 0 | — |
| `--list-row-padding-y` | `var(--spacing-12)` | `12px` | — | 4 | 0 | 1 | 2 | 0 | — |
| `--list-row-line-gap` | `2px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--chip-padding` | `2px 8px` | 〃 | — | 5 | 0 | 0 | 4 | 0 | — |
| `--list-row-selected-ring` | `2px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--list-row-lead-badge-offset` | `-6px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--list-row-lead-badge-size` | `20px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--list-row-lead-badge-padding-x` | `6px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-hero-size` | `200px` | 〃 | — | 4 | 0 | 0 | 2 | 0 | — |
| `--grid-cell-max-width` | `90px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--grid-thumb-bleed` | `0.75rem` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--grid-thumb-inset` | `4.4%` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--cta-max-width` | `220px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--share-card-max-width` | `360px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--share-card-image-size` | `70%` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--animate-sync-spin` | `spin 2.4s linear infinite` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--digit-dur` | `var(--duration-very-slow)` | `500ms` | — | 1 | 0 | 1 | 2 | 0 | — |
| `--digit-distance` | `8px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--digit-stagger` | `70ms` | 〃 | — | 2 | 0 | 1 | 2 | 0 | — |
| `--digit-blur` | `2px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--digit-ease` | `cubic-bezier(0.34, 1.45, 0.64, 1)` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--digit-dir-x` | `0` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--digit-dir-y` | `1` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-slide-dur` | `260ms` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-pop-dur` | `var(--duration-very-slow)` | `500ms` | — | 2 | 0 | 0 | 1 | 0 | — |
| `--badge-pop-close-dur` | `180ms` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--badge-fade-dur` | `var(--duration-slow)` | `400ms` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-fade-close-dur` | `180ms` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-blur` | `2px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-offset-x` | `-8.2px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-offset-y` | `12.4px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-slide-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--badge-pop-ease` | `var(--ease-bounce)` | `cubic-bezier(0.34, 1.36, 0.64, 1)` | — | 3 | 0 | 0 | 1 | 0 | — |
| `--badge-close-ease` | `cubic-bezier(0.4, 0, 0.2, 1)` | 〃 | — | 3 | 0 | 0 | 1 | 0 | — |
| `--text-swap-dur` | `var(--duration-quick)` | `150ms` | — | 3 | 0 | 2 | 3 | 0 | — |
| `--text-swap-translate-y` | `4px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--text-swap-blur` | `2px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--text-swap-ease` | `var(--ease-in-out)` | `ease-in-out` | — | 3 | 0 | 0 | 1 | 0 | — |
| `--panel-open-dur` | `var(--duration-slow)` | `400ms` | — | 4 | 0 | 0 | 1 | 0 | — |
| `--panel-close-dur` | `var(--duration-medium)` | `350ms` | — | 4 | 0 | 1 | 2 | 0 | — |
| `--panel-translate-y` | `100px` | 〃 | — | 1 | 0 | 3 | 4 | 0 | — |
| `--panel-blur` | `2px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--panel-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 8 | 0 | 0 | 1 | 0 | — |
| `--shake-distance` | `6px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--shake-overshoot` | `4px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--shake-dur-a` | `var(--duration-micro)` | `80ms` | — | 1 | 0 | 1 | 2 | 0 | — |
| `--shake-dur-b` | `60ms` | 〃 | — | 1 | 0 | 1 | 2 | 0 | — |
| `--shake-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 4 | 0 | 0 | 1 | 0 | — |
| `--revert-dur` | `280ms` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--pulse-dur` | `1000ms` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--pulse-count` | `1` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--pulse-min` | `0.5` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--reveal-dur` | `var(--duration-slow)` | `400ms` | — | 4 | 0 | 1 | 2 | 0 | — |
| `--reveal-blur` | `2px` | 〃 | — | 2 | 0 | 0 | 1 | 0 | — |
| `--reveal-ease` | `var(--ease-in-out)` | `ease-in-out` | — | 4 | 0 | 0 | 1 | 0 | — |
| `--tabs-dur` | `300ms` | 〃 | — | 7 | 0 | 0 | 1 | 0 | — |
| `--tabs-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 7 | 0 | 0 | 1 | 0 | — |
| `--tabs-text-muted` | `var(--muted)` | `#737373` | — | 1 | 0 | 2 | 2 | 0 | — |
| `--tabs-text-active` | `var(--snow)` | `#fcfcfc` | — | 2 | 0 | 2 | 2 | 0 | — |
| `--tabs-bar-bg` | `var(--default)` | `#e5e5e5` | — | 1 | 0 | 2 | 2 | 0 | — |
| `--tabs-pill-bg` | `var(--background-inverse)` | `#171717` | — | 1 | 0 | 2 | 2 | 0 | — |
| `--acc-expand` | `var(--duration-fast)` | `250ms` | — | 3 | 0 | 0 | 1 | 0 | — |
| `--acc-collapse` | `var(--duration-fast)` | `250ms` | — | 3 | 0 | 0 | 1 | 0 | — |
| `--acc-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 6 | 0 | 0 | 1 | 0 | — |
| `--toast-open` | `var(--duration-medium)` | `350ms` | — | 4 | 0 | 0 | 1 | 0 | — |
| `--toast-close` | `var(--duration-fast)` | `250ms` | — | 4 | 0 | 1 | 2 | 0 | — |
| `--toast-distance` | `16px` | 〃 | — | 1 | 0 | 1 | 2 | 0 | — |
| `--toast-blur` | `2px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--toast-scale` | `0.97` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--toast-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 8 | 0 | 0 | 1 | 0 | — |
| `--toast-scrim` | `color-mix(in srgb, var(--base-black) 16%, transparent)` | `color-mix(in srgb, #000000 16%, transparent)` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--toast-scrim-blur` | `4px` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--reel-dur` | `1400ms` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--reel-cell` | `30px` | 〃 | — | 3 | 0 | 1 | 2 | 0 | — |
| `--reel-stagger` | `90ms` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--reel-ease` | `cubic-bezier(0.16, 1, 0.3, 1)` | 〃 | — | 1 | 0 | 0 | 1 | 0 | — |
| `--capsule-fade-dur` | `var(--duration-fast)` | `250ms` | — | 2 | 0 | 0 | 1 | 0 | — |
| `--capsule-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 3 | 0 | 0 | 1 | 0 | — |
| `--poi-carousel-dur` | `var(--duration-medium)` | `350ms` | — | 2 | 0 | 0 | 1 | 0 | — |
| `--poi-carousel-ease` | `var(--ease-smooth-out)` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | 2 | 0 | 0 | 1 | 0 | — |
| `--pick-overlay-fade-dur` | `var(--duration-quick)` | `150ms` | — | 1 | 0 | 0 | 1 | 0 | — |
| `--pick-overlay-fade-ease` | `var(--ease-out)` | `ease-out` | — | 1 | 0 | 0 | 1 | 0 | — |

## 어드민 (admin)

| 이름 | 정의 값 | 최종 값 | 클래스 | var() | 클래스 사용 | 문자열 | 쓰는 파일 | 토큰 안 참조 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| `--color-black` | `#000` | 〃 | `*-black` | 0 | 17 | 0 | 11 | 0 | — |
| `--color-white` | `#fff` | 〃 | `*-white` | 0 | 264 | 0 | 95 | 0 | — |
| `--color-red-50` | `oklch(97.1% 0.013 17.38)` | 〃 | `*-red-50` | 0 | 36 | 0 | 27 | 0 | — |
| `--color-red-100` | `oklch(93.6% 0.032 17.717)` | 〃 | `*-red-100` | 0 | 4 | 0 | 3 | 0 | — |
| `--color-red-200` | `oklch(88.5% 0.062 18.334)` | 〃 | `*-red-200` | 0 | 25 | 0 | 20 | 0 | — |
| `--color-red-300` | `oklch(80.8% 0.114 19.571)` | 〃 | `*-red-300` | 0 | 7 | 0 | 7 | 0 | — |
| `--color-red-500` | `oklch(63.7% 0.237 25.331)` | 〃 | `*-red-500` | 0 | 8 | 0 | 7 | 0 | — |
| `--color-red-600` | `oklch(57.7% 0.245 27.325)` | 〃 | `*-red-600` | 0 | 100 | 0 | 59 | 0 | — |
| `--color-red-700` | `oklch(50.5% 0.213 27.518)` | 〃 | `*-red-700` | 0 | 43 | 0 | 22 | 0 | — |
| `--color-red-800` | `oklch(44.4% 0.177 26.899)` | 〃 | `*-red-800` | 0 | 3 | 0 | 3 | 0 | — |
| `--color-red-900` | `oklch(39.6% 0.141 25.723)` | 〃 | `*-red-900` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-orange-100` | `oklch(95.4% 0.038 75.164)` | 〃 | `*-orange-100` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-orange-600` | `oklch(64.6% 0.222 41.116)` | 〃 | `*-orange-600` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-orange-700` | `oklch(55.3% 0.195 38.402)` | 〃 | `*-orange-700` | 0 | 8 | 0 | 5 | 0 | — |
| `--color-orange-800` | `oklch(47% 0.157 37.304)` | 〃 | `*-orange-800` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-amber-50` | `oklch(98.7% 0.022 95.277)` | 〃 | `*-amber-50` | 0 | 28 | 0 | 24 | 0 | — |
| `--color-amber-100` | `oklch(96.2% 0.059 95.617)` | 〃 | `*-amber-100` | 0 | 13 | 0 | 10 | 0 | — |
| `--color-amber-200` | `oklch(92.4% 0.12 95.746)` | 〃 | `*-amber-200` | 0 | 10 | 0 | 9 | 0 | — |
| `--color-amber-300` | `oklch(87.9% 0.169 91.605)` | 〃 | `*-amber-300` | 0 | 16 | 0 | 11 | 0 | — |
| `--color-amber-400` | `oklch(82.8% 0.189 84.429)` | 〃 | `*-amber-400` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-amber-500` | `oklch(76.9% 0.188 70.08)` | 〃 | `*-amber-500` | 0 | 7 | 0 | 6 | 0 | — |
| `--color-amber-600` | `oklch(66.6% 0.179 58.318)` | 〃 | `*-amber-600` | 0 | 19 | 0 | 15 | 0 | — |
| `--color-amber-700` | `oklch(55.5% 0.163 48.998)` | 〃 | `*-amber-700` | 0 | 28 | 0 | 23 | 0 | — |
| `--color-amber-800` | `oklch(47.3% 0.137 46.201)` | 〃 | `*-amber-800` | 0 | 30 | 0 | 16 | 0 | — |
| `--color-amber-900` | `oklch(41.4% 0.112 45.904)` | 〃 | `*-amber-900` | 0 | 11 | 0 | 11 | 0 | — |
| `--color-amber-950` | `oklch(27.9% 0.077 45.635)` | 〃 | `*-amber-950` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-green-50` | `oklch(98.2% 0.018 155.826)` | 〃 | `*-green-50` | 0 | 3 | 0 | 3 | 0 | — |
| `--color-green-200` | `oklch(92.5% 0.084 155.995)` | 〃 | `*-green-200` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-green-300` | `oklch(87.1% 0.15 154.449)` | 〃 | `*-green-300` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-green-600` | `oklch(62.7% 0.194 149.214)` | 〃 | `*-green-600` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-green-700` | `oklch(52.7% 0.154 150.069)` | 〃 | `*-green-700` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-green-900` | `oklch(39.3% 0.095 152.535)` | 〃 | `*-green-900` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-emerald-50` | `oklch(97.9% 0.021 166.113)` | 〃 | `*-emerald-50` | 0 | 7 | 0 | 6 | 0 | — |
| `--color-emerald-100` | `oklch(95% 0.052 163.051)` | 〃 | `*-emerald-100` | 0 | 5 | 0 | 5 | 0 | — |
| `--color-emerald-200` | `oklch(90.5% 0.093 164.15)` | 〃 | `*-emerald-200` | 0 | 4 | 0 | 4 | 0 | — |
| `--color-emerald-300` | `oklch(84.5% 0.143 164.978)` | 〃 | `*-emerald-300` | 0 | 7 | 0 | 2 | 0 | — |
| `--color-emerald-400` | `oklch(76.5% 0.177 163.223)` | 〃 | `*-emerald-400` | 0 | 3 | 0 | 1 | 0 | — |
| `--color-emerald-500` | `oklch(69.6% 0.17 162.48)` | 〃 | `*-emerald-500` | 0 | 3 | 0 | 2 | 0 | — |
| `--color-emerald-600` | `oklch(59.6% 0.145 163.225)` | 〃 | `*-emerald-600` | 0 | 11 | 0 | 11 | 0 | — |
| `--color-emerald-700` | `oklch(50.8% 0.118 165.612)` | 〃 | `*-emerald-700` | 0 | 16 | 0 | 12 | 0 | — |
| `--color-emerald-800` | `oklch(43.2% 0.095 166.913)` | 〃 | `*-emerald-800` | 0 | 4 | 0 | 2 | 0 | — |
| `--color-emerald-900` | `oklch(37.8% 0.077 168.94)` | 〃 | `*-emerald-900` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-emerald-950` | `oklch(26.2% 0.051 172.552)` | 〃 | `*-emerald-950` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-sky-50` | `oklch(97.7% 0.013 236.62)` | 〃 | `*-sky-50` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-sky-100` | `oklch(95.1% 0.026 236.824)` | 〃 | `*-sky-100` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-sky-200` | `oklch(90.1% 0.058 230.902)` | 〃 | `*-sky-200` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-sky-700` | `oklch(50% 0.134 242.749)` | 〃 | `*-sky-700` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-sky-800` | `oklch(44.3% 0.11 240.79)` | 〃 | `*-sky-800` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-blue-50` | `oklch(97% 0.014 254.604)` | 〃 | `*-blue-50` | 0 | 3 | 0 | 3 | 0 | — |
| `--color-blue-100` | `oklch(93.2% 0.032 255.585)` | 〃 | `*-blue-100` | 0 | 3 | 0 | 3 | 0 | — |
| `--color-blue-200` | `oklch(88.2% 0.059 254.128)` | 〃 | `*-blue-200` | 0 | 3 | 0 | 3 | 0 | — |
| `--color-blue-300` | `oklch(80.9% 0.105 251.813)` | 〃 | `*-blue-300` | 0 | 6 | 0 | 2 | 0 | — |
| `--color-blue-400` | `oklch(70.7% 0.165 254.624)` | 〃 | `*-blue-400` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-blue-500` | `oklch(62.3% 0.214 259.815)` | 〃 | `*-blue-500` | 0 | 3 | 0 | 2 | 0 | — |
| `--color-blue-600` | `oklch(54.6% 0.245 262.881)` | 〃 | `*-blue-600` | 0 | 4 | 0 | 4 | 0 | — |
| `--color-blue-700` | `oklch(48.8% 0.243 264.376)` | 〃 | `*-blue-700` | 0 | 3 | 0 | 2 | 0 | — |
| `--color-blue-800` | `oklch(42.4% 0.199 265.638)` | 〃 | `*-blue-800` | 0 | 5 | 0 | 3 | 0 | — |
| `--color-blue-900` | `oklch(37.9% 0.146 265.522)` | 〃 | `*-blue-900` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-blue-950` | `oklch(28.2% 0.091 267.935)` | 〃 | `*-blue-950` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-violet-200` | `oklch(89.4% 0.057 293.283)` | 〃 | `*-violet-200` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-violet-600` | `oklch(54.1% 0.281 293.009)` | 〃 | `*-violet-600` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-violet-800` | `oklch(43.2% 0.232 292.759)` | 〃 | `*-violet-800` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-purple-50` | `oklch(97.7% 0.014 308.299)` | 〃 | `*-purple-50` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-purple-100` | `oklch(94.6% 0.033 307.174)` | 〃 | `*-purple-100` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-purple-300` | `oklch(82.7% 0.119 306.383)` | 〃 | `*-purple-300` | 0 | 5 | 0 | 1 | 0 | — |
| `--color-purple-400` | `oklch(71.4% 0.203 305.504)` | 〃 | `*-purple-400` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-purple-500` | `oklch(62.7% 0.265 303.9)` | 〃 | `*-purple-500` | 0 | 2 | 0 | 1 | 0 | — |
| `--color-purple-600` | `oklch(55.8% 0.288 302.321)` | 〃 | `*-purple-600` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-purple-700` | `oklch(49.6% 0.265 301.924)` | 〃 | `*-purple-700` | 0 | 2 | 0 | 1 | 0 | — |
| `--color-purple-800` | `oklch(43.8% 0.218 303.724)` | 〃 | `*-purple-800` | 0 | 2 | 0 | 1 | 0 | — |
| `--color-purple-950` | `oklch(29.1% 0.149 302.717)` | 〃 | `*-purple-950` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-slate-50` | `oklch(98.4% 0.003 247.858)` | 〃 | `*-slate-50` | 0 | 4 | 0 | 2 | 0 | — |
| `--color-slate-100` | `oklch(96.8% 0.007 247.896)` | 〃 | `*-slate-100` | 0 | 10 | 0 | 4 | 0 | — |
| `--color-slate-200` | `oklch(92.9% 0.013 255.508)` | 〃 | `*-slate-200` | 0 | 13 | 0 | 3 | 0 | — |
| `--color-slate-300` | `oklch(86.9% 0.022 252.894)` | 〃 | `*-slate-300` | 0 | 4 | 0 | 2 | 0 | — |
| `--color-slate-400` | `oklch(70.4% 0.04 256.788)` | 〃 | `*-slate-400` | 0 | 5 | 0 | 3 | 0 | — |
| `--color-slate-500` | `oklch(55.4% 0.046 257.417)` | 〃 | `*-slate-500` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-slate-600` | `oklch(44.6% 0.043 257.281)` | 〃 | `*-slate-600` | 0 | 1 | 0 | 1 | 0 | — |
| `--color-slate-700` | `oklch(37.2% 0.044 257.287)` | 〃 | `*-slate-700` | 0 | 2 | 0 | 1 | 0 | — |
| `--color-slate-800` | `oklch(27.9% 0.041 260.031)` | 〃 | `*-slate-800` | 0 | 16 | 0 | 4 | 0 | — |
| `--color-slate-900` | `oklch(20.8% 0.042 265.755)` | 〃 | `*-slate-900` | 0 | 10 | 0 | 3 | 0 | — |
| `--color-slate-950` | `oklch(12.9% 0.042 264.695)` | 〃 | `*-slate-950` | 0 | 4 | 0 | 3 | 0 | — |
| `--color-gray-50` | `oklch(98.5% 0.002 247.839)` | 〃 | `*-gray-50` | 0 | 3 | 0 | 1 | 0 | — |
| `--color-gray-100` | `oklch(96.7% 0.003 264.542)` | 〃 | `*-gray-100` | 0 | 24 | 0 | 12 | 0 | — |
| `--color-gray-200` | `oklch(92.8% 0.006 264.531)` | 〃 | `*-gray-200` | 0 | 9 | 0 | 8 | 0 | — |
| `--color-gray-400` | `oklch(70.7% 0.022 261.325)` | 〃 | `*-gray-400` | 0 | 10 | 0 | 8 | 0 | — |
| `--color-gray-500` | `oklch(55.1% 0.027 264.364)` | 〃 | `*-gray-500` | 0 | 6 | 0 | 4 | 0 | — |
| `--color-gray-600` | `oklch(44.6% 0.03 256.802)` | 〃 | `*-gray-600` | 0 | 4 | 0 | 3 | 0 | — |
| `--color-gray-700` | `oklch(37.3% 0.034 259.733)` | 〃 | `*-gray-700` | 0 | 15 | 0 | 11 | 0 | — |
| `--color-gray-800` | `oklch(27.8% 0.033 256.848)` | 〃 | `*-gray-800` | 0 | 2 | 0 | 2 | 0 | — |
| `--color-neutral-50` | `oklch(98.5% 0 0)` | 〃 | `*-neutral-50` | 0 | 15 | 0 | 12 | 0 | — |
| `--color-neutral-100` | `oklch(97% 0 0)` | 〃 | `*-neutral-100` | 0 | 23 | 0 | 17 | 0 | — |
| `--color-neutral-200` | `oklch(92.2% 0 0)` | 〃 | `*-neutral-200` | 0 | 30 | 0 | 25 | 0 | — |
| `--color-neutral-300` | `oklch(87% 0 0)` | 〃 | `*-neutral-300` | 0 | 12 | 0 | 12 | 0 | — |
| `--color-neutral-400` | `oklch(70.8% 0 0)` | 〃 | `*-neutral-400` | 0 | 10 | 0 | 10 | 0 | — |
| `--color-neutral-500` | `oklch(55.6% 0 0)` | 〃 | `*-neutral-500` | 0 | 23 | 0 | 16 | 0 | — |
| `--color-neutral-600` | `oklch(43.9% 0 0)` | 〃 | `*-neutral-600` | 0 | 11 | 0 | 10 | 0 | — |
| `--color-neutral-700` | `oklch(37.1% 0 0)` | 〃 | `*-neutral-700` | 0 | 13 | 0 | 12 | 0 | — |
| `--color-neutral-800` | `oklch(26.9% 0 0)` | 〃 | `*-neutral-800` | 0 | 3 | 0 | 3 | 0 | — |
| `--color-neutral-900` | `oklch(20.5% 0 0)` | 〃 | `*-neutral-900` | 0 | 77 | 0 | 34 | 0 | — |
| `--shadow-xs` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | 〃 | `shadow-xs` | 0 | 5 | 0 | 1 | 0 | — |
| `--shadow-sm` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | 〃 | `shadow-sm` | 0 | 5 | 0 | 5 | 0 | — |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | 〃 | `shadow-md` | 0 | 6 | 0 | 6 | 0 | — |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | 〃 | `shadow-lg` | 0 | 16 | 0 | 16 | 0 | — |
| `--blur` | `8px` | 〃 | `blur · backdrop-blur` | 0 | 51 | 0 | 11 | 0 | — |
| `--shadow` | `0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)` | 〃 | `shadow` | 0 | 2 | 0 | 1 | 0 | — |
| `--radius` | `0.25rem` | 〃 | `rounded` | 0 | 79 | 0 | 45 | 6 | reference 정의(클래스 값만)와 별개로 globals.css에 변수 정의가 있음 |
| `--background` | `oklch(1 0 0)` | 〃 | `*-background` | 12 | 75 | 0 | 51 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--foreground` | `oklch(0.147 0.004 49.25)` | 〃 | `*-foreground` | 77 | 598 | 2 | 221 | 6 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--card` | `oklch(1 0 0)` | 〃 | `*-card` | 0 | 1 | 0 | 1 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--popover` | `oklch(1 0 0)` | 〃 | `*-popover` | 0 | 1 | 0 | 1 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--popover-foreground` | `oklch(0.147 0.004 49.25)` | 〃 | `*-popover-foreground` | 0 | 1 | 0 | 1 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--primary` | `oklch(0.216 0.006 56.043)` | 〃 | `*-primary` | 0 | 168 | 0 | 57 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--primary-foreground` | `oklch(0.985 0.001 106.423)` | 〃 | `*-primary-foreground` | 0 | 8 | 0 | 6 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--secondary` | `oklch(0.97 0.001 106.424)` | 〃 | `*-secondary` | 0 | 3 | 0 | 3 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--secondary-foreground` | `oklch(0.216 0.006 56.043)` | 〃 | `*-secondary-foreground` | 0 | 2 | 0 | 2 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--muted` | `oklch(0.97 0.001 106.424)` | 〃 | `*-muted` | 39 | 248 | 1 | 143 | 2 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--muted-foreground` | `oklch(0.553 0.013 58.071)` | 〃 | `*-muted-foreground` | 0 | 1010 | 0 | 249 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--accent` | `oklch(0.216 0.006 56.043)` | 〃 | `*-accent` | 14 | 16 | 0 | 21 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--accent-foreground` | `oklch(0.985 0.001 106.423)` | 〃 | `*-accent-foreground` | 13 | 4 | 0 | 12 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--destructive` | `oklch(0.577 0.245 27.325)` | 〃 | `*-destructive` | 0 | 116 | 0 | 35 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--border` | `oklch(0.923 0.003 48.717)` | 〃 | `*-border` | 11 | 346 | 0 | 137 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--input` | `oklch(0.923 0.003 48.717)` | 〃 | `*-input` | 0 | 8 | 0 | 6 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--ring` | `oklch(0.709 0.01 56.259)` | 〃 | `*-ring` | 0 | 41 | 0 | 25 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--sidebar` | `oklch(0.985 0.001 106.423)` | 〃 | `*-sidebar` | 0 | 5 | 0 | 1 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--sidebar-foreground` | `oklch(0.147 0.004 49.25)` | 〃 | `*-sidebar-foreground` | 0 | 12 | 0 | 2 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--sidebar-accent` | `oklch(0.97 0.001 106.424)` | 〃 | `*-sidebar-accent` | 1 | 13 | 0 | 2 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--sidebar-accent-foreground` | `oklch(0.216 0.006 56.043)` | 〃 | `*-sidebar-accent-foreground` | 0 | 16 | 0 | 1 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--sidebar-border` | `oklch(0.923 0.003 48.717)` | 〃 | `*-sidebar-border` | 1 | 4 | 0 | 1 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--sidebar-ring` | `oklch(0.709 0.01 56.259)` | 〃 | `*-sidebar-ring` | 0 | 7 | 0 | 2 | 1 | 덮어쓰기 있음 ([data-admin-theme].dark) |
| `--radius-xs` | `4px` | 〃 | `rounded-xs` | 0 | 0 | 0 | 0 | 1 | — |
| `--radius-sm` | `8px` | 〃 | `rounded-sm` | 0 | 18 | 0 | 12 | 1 | — |
| `--radius-md` | `calc(var(--radius) * 0.8)` | `calc(0.25rem * 0.8)` | `rounded-md` | 0 | 92 | 0 | 57 | 1 | — |
| `--radius-lg` | `var(--radius)` | `0.25rem` | `rounded-lg` | 2 | 154 | 0 | 84 | 1 | — |
| `--radius-xl` | `calc(var(--radius) * 1.4)` | `calc(0.25rem * 1.4)` | `rounded-xl` | 4 | 158 | 0 | 46 | 1 | — |
| `--radius-2xl` | `calc(var(--radius) * 1.8)` | `calc(0.25rem * 1.8)` | `rounded-2xl` | 15 | 111 | 0 | 76 | 1 | — |
| `--radius-3xl` | `calc(var(--radius) * 2.2)` | `calc(0.25rem * 2.2)` | `rounded-3xl` | 0 | 1 | 0 | 1 | 1 | — |
| `--radius-4xl` | `calc(var(--radius) * 2.6)` | `calc(0.25rem * 2.6)` | `rounded-4xl` | 0 | 0 | 0 | 0 | 1 | — |

## 글자색 × 배경색 대비

함께 쓰이는 조합의 WCAG 대비다(계산값, 반투명 글자는 바탕 위에 얹어 계산). 글자는 4.5, 선·채움은 3.0이 기준이다. 판정은 참고용이며 `verify`를 막지 않는다.
색을 읽지 못한 조합은 «계산 못 함»으로 둔다.

| 글자·선 | 배경 | 대비 | 기준 | 판정 | 비고 |
|---|---|---|---|---|---|
| `--foreground` | `--background` | 16.44 | 4.5 | 통과 | — |
| `--foreground` | `--card-bg` | 17.93 | 4.5 | 통과 | — |
| `--foreground` | `--surface` | 17.93 | 4.5 | 통과 | — |
| `--foreground` | `--background-secondary` | 14.23 | 4.5 | 통과 | — |
| `--foreground` | `--btn-secondary` | 14.23 | 4.5 | 통과 | — |
| `--foreground` | `--page-bg` | 14.23 | 4.5 | 통과 | — |
| `--muted` | `--background` | 4.35 | 4.5 | 4.5 미만 | 사용자가 대비를 알고 받아들인 값(티켓 20261126_1908, 9-1회차) — 보조 글자 4.35 |
| `--muted` | `--card-bg` | 4.74 | 4.5 | 통과 | — |
| `--muted` | `--background-secondary` | 3.76 | 4.5 | 4.5 미만 | 사용자가 대비를 알고 받아들인 값(티켓 20261126_1908, 9-1회차) — #e5e5e5 면 위 3.76 |
| `--muted` | `--btn-secondary` | 3.76 | 4.5 | 4.5 미만 | 사용자가 대비를 알고 받아들인 값(티켓 20261126_1908, 9-1회차) — #e5e5e5 면 위 3.76 |
| `--tabs-text-muted` | `--tabs-bar-bg` | 3.76 | 4.5 | 4.5 미만 | 사용자가 대비를 알고 받아들인 값(티켓 20261126_1908, 9-1회차) — #e5e5e5 면 위 3.76 |
| `--snow` | `--background-inverse` | 17.47 | 4.5 | 통과 | — |
| `--muted-on-inverse` | `--background-inverse` | 8.97 | 4.5 | 통과 | — |
| `--accent-foreground` | `--accent` | 17.47 | 4.5 | 통과 | — |
| `--danger-text` | `--card-bg` | 5.15 | 4.5 | 통과 | — |
| `--point-text` | `--card-bg` | 3.45 | 4.5 | 4.5 미만 | 값 보존 결정(상위 티켓 20261125_1923, 사용자 결정) |
| `--rarity-common-foreground` | `--rarity-common` | 4.74 | 4.5 | 통과 | — |
| `--rarity-rare-foreground` | `--rarity-rare` | 9.92 | 4.5 | 통과 | — |
| `--rarity-epic-foreground` | `--rarity-epic` | 10.12 | 4.5 | 통과 | — |
| `--rarity-mystic-foreground` | `--rarity-mystic` | 5.98 | 4.5 | 통과 | — |
| `--foreground` | `--jam-red` | 4.65 | 4.5 | 통과 | — |
| `--foreground` | `--jam-yellow` | 16.46 | 4.5 | 통과 | — |
| `--foreground` | `--jam-green` | 7.68 | 4.5 | 통과 | — |
| `--foreground` | `--jam-purple` | 6.89 | 4.5 | 통과 | — |
| `--foreground` | `--jam-blue` | 5.56 | 4.5 | 통과 | — |
| `--foreground` | `--jam-pink` | 6.82 | 4.5 | 통과 | — |
| `--foreground` | `--jam-sky` | 9.73 | 4.5 | 통과 | — |
| `--foreground` | `--jam-chip-white` | 17.93 | 4.5 | 통과 | — |
| `--snow` | `--jam-green-deep` | 4.48 | 4.5 | 4.5 미만 | 짙은 초록 위 글자 예외(primitive.css 주석) |
| `--field-border` | `--card-bg` | 2.52 | 3 | 3.0 미만 | 사용자가 대비를 알고 받아들인 값(티켓 20261126_1908, 9-1회차) — 입력 테두리 2.52 |
| `--capsule-fill` | `--capsule-track` | 5.21 | 3 | 통과 | — |

## 쓰는 곳 0인 토큰

`var()` 수·클래스 사용·문자열이 모두 0이고, 쓰이는 토큰의 재료도 아닌 토큰이다. 눈금의 빈 칸(회색·간격·모서리·컨테이너 단계 등)이 남기는 대상이다.

| 이름 | 층 | 토큰 안 참조 |
|---|---|---|
| `--base-neutral-50` | 기본값 (primitive) | 0 |
| `--base-neutral-300` | 기본값 (primitive) | 0 |
| `--base-neutral-700` | 기본값 (primitive) | 0 |
| `--radius-xs` | 기본값 (primitive) | 1 |
| `--radius-4xl` | 기본값 (primitive) | 1 |
| `--spacing-20` | 기본값 (primitive) | 0 |
| `--spacing-32` | 기본값 (primitive) | 0 |
| `--spacing-40` | 기본값 (primitive) | 0 |
| `--spacing-64` | 기본값 (primitive) | 0 |
| `--spacing-96` | 기본값 (primitive) | 0 |
| `--duration-stagger` | 기본값 (primitive) | 0 |
| `--scale-modal` | 기본값 (primitive) | 0 |
| `--container-3xs` | 기본값 (primitive) | 0 |
| `--container-2xs` | 기본값 (primitive) | 0 |
| `--container-5xl` | 기본값 (primitive) | 0 |
| `--container-7xl` | 기본값 (primitive) | 0 |
| `--font-weight-thin` | 기본값 (primitive) | 0 |
| `--font-weight-extralight` | 기본값 (primitive) | 0 |
| `--font-weight-light` | 기본값 (primitive) | 0 |
| `--leading-normal` | 기본값 (primitive) | 0 |
| `--drop-shadow-xs` | 기본값 (primitive) | 0 |
| `--radius-xs` | 어드민 (admin) | 1 |
| `--radius-4xl` | 어드민 (admin) | 1 |
<!-- END generated: gen-token-catalog -->
