# 발견 사항 & 공유 자료 (Design_Phase01)

## 2026-07-29 — 메인세션: 기존 코드 조사 결과 요약 (PRD 작성 시 조사한 내용, 재활용)

- 바텀탭바: `src/app/(main)/TabBar.tsx` — 6탭(투데이/배지/드랍/미션/인벤토리/프로필), `bg-jam-cream border-t-[3px] border-jam-ink`, 활성탭 `bg-jam-lime` pill. 다른 유저 프로필 보기·`?from=badges` 특수 케이스 로직 있음 — 절대 건드리지 말 것.
- 상단 네비: 공통 컴포넌트 없음. 각 페이지가 `router.back()` + `<h1 className="font-black text-xl">` 패턴을 반복 (예: `src/app/(main)/points/page.tsx`, `src/app/(main)/profile/edit/page.tsx`).
- 네오브루탈 카드 패턴: `border-[3px] border-jam-ink shadow-[3px_3px_0_0_#161616]` 형태가 ~30개 파일에 복사됨.
- 색상 토큰: `src/app/globals.css`의 `@theme` 블록에 정의 (Tailwind v4, `tailwind.config.*` 없음). `color-scheme: dark` 고정.
- i18n: 기존에 전혀 없음 (하드코딩 한글 문자열).
- 대상 파일: `src/app/(main)/profile/ProfileClient.tsx` (프로필/마이페이지 메인 컴포넌트, ~484줄)

---

## 2026-07-29 — dev-tokens → dev-integration 인계 노트

### 1. 토큰 (`src/app/globals.css`)

컴포넌트에서는 **시맨틱 변수**를 쓰세요 (라이트 테마 확장 대비). Tailwind 유틸 이름이 그대로 생깁니다.

| 유틸 | 의미 (현재 매핑) |
|------|------|
| `bg-surface` / `text-text` | 코발트 배경 + 그 위 아이스 텍스트 |
| `bg-surface-inverse` / `text-text-inverse` | 아이스 배경 + 그 위 코발트 텍스트 |
| `var(--color-border)` | 코발트 배경 위 1px inset border 색(=아이스) |
| `var(--color-border-inverse)` | 아이스 배경 위 1px inset border 색(=코발트) |

- 원색 유틸도 있음: `bg-main`(#0033e5) / `bg-sub`(#f0f7ff) / `cobalt-mist` / `pitch`. **cobalt-mist는 텍스트 금지**(WCAG 미달).
- 투명도 변형 정상 동작 확인: `text-text-inverse/40` 등.
- elevation은 항상 `shadow-[inset_0_0_0_1px_var(--color-border-inverse)]` 형태의 arbitrary inset box-shadow로. 드롭섀도 금지.
- 라디우스: `rounded-[var(--radius-cards)]`(16) / `--radius-tags`(50) / `--radius-inputs`(2) / `--radius-buttons`(16) / `--radius-nav-buttons`(50) / `--radius-pill-buttons`(72). `rounded-cards` 같은 축약 유틸도 생성됨.
- 타이포/스페이싱은 **@theme이 아니라 :root**에 있음 → arbitrary value로 참조:
  `text-[length:var(--text-subheading)] leading-[var(--leading-subheading)]`, `p-[var(--spacing-24)]`.
  (이유: `--spacing-8` 등을 @theme에 넣으면 Tailwind 기본 스페이싱 스케일 `p-8`을 덮어써 기존 화면이 전부 깨짐 — 절대 옮기지 말 것.)
- 사이즈 스케일: 16/18/24/32/42/56/85px = body-sm/body/subheading/heading-sm/heading/heading-lg/display.
- Pretendard는 `body`에 강제 적용됨(weight 400). `layout.tsx`의 Geist 폰트 변수는 남아있지만 `font-sans` 사용처가 0건이라 실제로 적용되지 않음. **`font-bold`/`font-black` 같은 클래스를 새로 쓰지 마세요.**
- 기존 `jam-*` 토큰은 전부 보존(다른 화면이 참조 중). teal/purple/yellow/lime은 Phase 2 상태 팔레트 이관 대상이라 값 재조정 금지.

### 2. 신규/교체 컴포넌트 props

**`src/components/ui/TopNav.tsx`** (client)
```ts
{ title: string; onBack?: () => void; backHref?: string; rightSlot?: React.ReactNode }
```
- `backHref` 있으면 `<Link>`, 없으면 `onBack ?? router.back()`. sticky + `env(safe-area-inset-top)` 처리 포함, 하단 1px inset border.
- `rightSlot`은 슬롯 내부에서 44×44pt를 직접 보장할 것(TopNav가 강제하지 않음).

**`src/components/ui/TabBar.tsx`** (client) — props는 기존과 동일 `{ username: string | null }`
- 라우팅/활성탭 판별 로직은 `(main)/TabBar.tsx`와 **100% 동일**하게 복사됨(`?u=` 다른 유저 케이스, `/inventory?from=badges` 케이스 포함).
- **아직 아무도 이 컴포넌트를 import하지 않음.** 기존 `(main)/layout.tsx`는 여전히 `(main)/TabBar.tsx`를 씁니다. 교체(re-export 또는 import 경로 변경)는 dev-integration이 화면 통합 시점에 하세요. 교체하면 6개 탭 전 화면의 탭바 룩이 동시에 바뀝니다.
- 로직 수정이 필요해지면 두 파일을 반드시 함께 맞출 것(중복 존재).

**`src/components/ui/Card.tsx`** (server/client 겸용, default export, forwardRef)
```ts
{ children, className?, ...divProps, glow?: boolean /* @deprecated: 무시됨 */ }
```
- 아이스 배경 + 코발트 텍스트, radius 16px, padding 24px, 1px inset border(코발트). 섀도우 없음.

**`src/components/ui/Button.tsx`** (default export, forwardRef)
```ts
{ variant?: 'primary'|'outline'|'arrow' (+레거시 'secondary'|'ghost'|'danger'),
  surface?: 'main'|'sub',   // 이 버튼이 "놓인 배경". 기본 'main'(코발트 배경 위)
  loading?: boolean, fullWidth?: boolean, size?: 'sm'|'md'|'lg' /* @deprecated */ }
```
- `surface='main'`(기본, 코발트 배경 위): primary = 아이스 채움 + 코발트 텍스트 / outline = 1px 아이스 보더 + 아이스 텍스트 / arrow = 아이스 텍스트.
- `surface='sub'`(아이스 배경 위): primary = 코발트 채움 + 아이스 텍스트 / outline = 1px 코발트 보더 + 코발트 텍스트.
- primary는 pill 72px, outline은 pill 50px, arrow는 `→` 접두 + 배경 없음 + radius 16px + padding 24px.
- 전 variant `min-h-11`(44pt) + `active:scale-95` 피드백, weight 400 고정.

### 3. 주의사항 / 리스크

- **레거시 화면 룩이 같이 바뀝니다.** `ui/Button`은 drops/BadgeDetailSheet·DropsClient·badges/ShareCardModal에서, `ui/Card`는 badges/BadgesClient·badges/[id]·itembooks/[id]에서 이미 사용 중. 새 스펙으로 교체했으므로 이 화면들도 코발트/아이스로 보이게 됩니다(타입 에러는 없음 — 레거시 props를 하위호환으로 받아줌). Phase 2에서 정식 리뉴얼 대상이라 의도적으로 허용했지만, 메인세션 스크린샷 검증 시 이 화면들도 한 번 확인해주세요.
- 레거시 `variant="danger"`는 현재 outline으로 렌더됩니다 — 파괴적 액션 시각 구분은 문구/배치로 처리하거나 Phase 2에서 별도 규칙을 정해야 합니다.
- `npx tsc --noEmit`은 `src/lib/points/__tests__/*`에서 @types/jest 누락 에러가 **원래부터** 납니다. 이번 작업과 무관하니 그 에러만 필터링해서 보세요.
- dev 서버(port 3000)는 켜둔 상태입니다. `preview_start` name = `jam-web`.

---

## 2026-07-29 — dev-integration → 메인세션 인계 노트

### 1. i18n 구조

`src/lib/i18n/ko.ts` — namespace 5종. `src/lib/i18n/index.ts`에서 `d`(= ko 딕셔너리 단축 참조)와 `t(template, vars)` 보간 헬퍼를 export.

| namespace | 범위 |
|---|---|
| `common` | close / detail / loadMore / back / countItems("{count}개") |
| `nav` | 바텀 탭바 6개 라벨 |
| `profile` | 헤더·버튼·Strava·빈상태·아이템북 카드 문구 전부 |
| `tabs` | 통계바 4탭 (뱃지/아이템북/팔로워/팔로잉) |
| `feed` | 필터탭·이벤트라벨·희귀도라벨·상세시트 Row 라벨 |

사용법: `d.profile.editButton` 직접 참조, 보간이 필요할 때만 `t(d.profile.pointBalance, { count })`.

### 2. 범위에 대한 판단 (검토 필요)

- **`(main)/FeedSection.tsx`도 함께 리뉴얼했습니다.** grep 결과 이 컴포넌트를 import하는 곳은 `ProfileClient.tsx` 단 한 곳이라 실질적으로 프로필 화면의 일부입니다. 그대로 두면 프로필 화면에 이모지(🏅📦🎁🎯🎉❌📭🧩)와 네오브루탈 카드가 절반 남아 PROJECT_SPEC의 "화면 하나를 절반만 바꾸지 마" 조항을 위반합니다. `DetailSheet`도 같은 파일이라 함께 교체했습니다(BottomSheet 공통화는 Phase 3이므로 **구조는 그대로 두고 토큰/아이콘만** 교체).
- **`TopNav`에 `showBack?: boolean`(기본 true) 옵셔널 prop을 추가**했습니다. 본인 프로필은 탭바로 직접 진입하는 루트 화면이라 되돌아갈 곳 없는 chevron이 뜨는 게 UX 퇴행이어서, `showBack={!isOwnProfile}`로 처리했습니다. 기본값이 true라 기존 호출부 영향 없음.
- **`(main)/TabBar.tsx`는 삭제하지 않고 그대로 뒀습니다.** 이제 어디서도 import되지 않는 데드 파일입니다(layout.tsx가 `@/components/ui/TabBar`를 씀). 정리 시점은 메인세션이 판단하세요.

### 3. 스크린샷 검증 시 특히 봐야 할 것

1. **통계바 4칸 분할선** — `Card`의 24px 패딩을 `p-0 overflow-hidden`으로 죽이고 칸마다 `inset 1px 0 0 0` 세로 보더를 넣었습니다. 첫 칸엔 보더 없음. 라운드 코너에서 보더가 잘리는지 확인.
2. **배지 그리드의 희귀도 배경** — `bg-white`/`bg-jam-teal/20`/`bg-jam-purple/20`/`bg-jam-yellow/30` 매핑을 **지시대로 그대로 유지**했습니다. 코발트 배경 위에서 common(흰색)과 아이스 카드가 미묘하게 다른 흰색으로 보일 수 있음 — Phase 2 상태 팔레트 작업 때 정리 대상.
3. **Strava 브랜드 컬러 `#FC4C02` 제거** — "제3의 컬러 금지" 조항 때문에 주황색 점·텍스트·버튼을 전부 코발트/아이스로 바꿨습니다. Strava 브랜드 가이드상 문제 소지가 있다면 되돌릴지 판단 필요.
4. **`DotmHex8` 로더는 손대지 않았습니다** — `colorPreset="grad-fire"`가 그라데이션이라 스펙 위반 소지가 있지만 공용 애니메이션 컴포넌트라 Phase 2로 미룹니다. 탭 로딩 중에만 보입니다.
5. **탭바 교체로 6개 탭 전 화면의 하단바가 동시에 바뀝니다** — 아직 리뉴얼 안 된 투데이/배지/드랍/미션/인벤토리 화면에서 원색 배경 + 아이스 탭바 조합이 어떻게 보이는지 한 번씩 확인.
6. **`min-h-full` + sticky TopNav** — 스크롤 컨테이너는 `(main)/layout.tsx`의 `<main class="overflow-y-auto">`입니다. 스크롤 시 TopNav가 제대로 붙어있는지, safe-area 패딩이 이중으로 들어가지 않는지 확인.
7. 로그인 세션이 필요해 dev-integration은 브라우저 검증을 못 했습니다(미로그인 시 /login 리다이렉트). **탭 전환(해시)·팔로우 토글·로그아웃·편집 이동은 코드상 원본 그대로지만 실제 클릭 확인 필요.**

### 4. 알려진 lint 경고 (이번 작업과 무관, 원본에도 있던 것)

`ProfileClient.tsx`의 `window.location.hash = tab`(react-hooks/immutability)과 `<a href="/api/strava/auth">`(@next/next/no-html-link-for-pages)는 **HEAD 커밋에도 동일하게 존재**합니다. 기능 로직 보존 지시에 따라 그대로 뒀습니다. 빌드는 통과합니다.

---

# DEAD_ENDS (시도했으나 실패한 접근)

- `--spacing-8` 등 SuperHi 스페이싱 스케일을 `@theme`에 넣는 안 → **채택 안 함**. Tailwind v4의 `--spacing-*` 네임스페이스를 덮어써서 기존 화면의 `p-8`/`gap-4` 등이 전부 깨짐. `:root` 평범한 CSS 변수로 두고 arbitrary value로 참조하는 방식으로 확정.
- (기존 globals.css 주석의 경고와 달리) **비-inline `@theme`에서는 `var()` 간접 참조가 정상 동작**함을 컴파일된 CSS로 확인. `--color-surface: var(--color-main)` 형태가 유틸리티까지 잘 생성됨. 문제가 됐던 건 `@theme inline` 조합뿐임.
- 로그인 없이 `/profile`을 검증하려고 `src/app/_design-preview/profile/page.tsx`를 만들었으나 **404** → Next.js는 `_`로 시작하는 폴더를 라우팅에서 자동 제외(private folder 컨벤션). `designpreviewtemp`처럼 언더스코어 없는 이름으로 재생성해야 함.
- `proxy.ts`의 `publicPaths`에 임시 경로를 추가하지 않으면 전역 인증 가드에 걸려 `/login`으로 리다이렉트됨 — 이 프로젝트는 `middleware.ts`가 아니라 `src/proxy.ts`(커스텀 Next.js 빌드의 네이밍)를 씀.
- 배지 희귀도 타일을 반투명 워시(`bg-jam-teal/20` 등)로 타일 전체에 덮는 방식은 **배경이 코발트로 바뀐 새 디자인에서는 실패**함 — 타일 배경은 항상 불투명 아이스로 고정하고, 희귀도 색은 좁은 영역(라벨 pill)에만 적용해야 코발트 배경과 섞이지 않고 대비가 유지됨. 색상값 자체가 아니라 "덮는 면적"이 문제였음 — Phase 2에서 `state_color_palette` 설계 시 이 교훈 반영 필요.
- iCloud Drive 동기화 환경(`~/Library/Mobile Documents/...`)에서 `.next/types/*.ts`에 ` 2.ts` 같은 동기화 충돌 중복 파일이 생겨 `tsc --noEmit`이 무관한 타입 에러를 뿜을 수 있음 — `.next` 삭제 후 재실행하면 해소. 코드 문제가 아니므로 당황하지 말 것.
