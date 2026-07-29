# JAM! 디자인 리뉴얼 — 프로젝트 스펙

> AI가 리뉴얼 코드를 짤 때 지켜야 할 규칙. 이 문서를 항상 함께 공유하세요.
> 시각 스타일 절대 기준: `Reference/designmd/SuperHighPlus DESIGN.md`

---

## 기술 스택 (변경 없음)

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | Next.js (App Router) | 기존 프로젝트 그대로 유지 |
| DB/백엔드 | Supabase | 기존 프로젝트 그대로 유지 |
| 배포 | Vercel | 기존 프로젝트 그대로 유지 |
| 인증 | Supabase Auth | 변경 없음 |
| 스타일링 | Tailwind CSS 4 (`@theme` in `globals.css`) | 기존 구조 유지, 토큰 값만 SuperHi Plus로 교체 |
| 폰트 | Pretendard Variable, weight 400 고정 | CDN import 확정 (`@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css')`), self-host 전환 없음 |

---

## 디자인 토큰 규칙 (Absolute Rule)

- 메인/서브 컬러는 반드시 CSS 변수(`--color-main`, `--color-sub`)로 바인딩하고, 하드코딩 hex 값을 컴포넌트에 직접 쓰지 않는다. 값은 `theme_presets` 테이블에서 `is_active = true`인 프리셋을 조회해 주입하며, 기본 프리셋은 `--color-main: #0033e5`(Cobalt Voltage), `--color-sub: #f0f7ff`(Ice White).
- `--color-cobalt-mist: #527ceb`는 텍스트에 사용 금지 (Ice White 위 대비 3.6:1로 WCAG 실패). 보조 필/톤 용도로만 사용.
- 타이포그래피는 Pretendard **weight 400 단일**. 굵게/가늘게(600+/300, italic) 사용 금지 — 위계는 크기(16/18/24/32/42/56/85px)와 컬러 대비로만 표현.
- Elevation은 오직 `1px inset border`로만 표현 (`shadow-subtle`, `shadow-subtle-2` 토큰). box-shadow의 offset/blur, gradient 사용 금지.
- Border radius는 지정된 값만 사용: tags 50px / cards 16px / inputs 2px / buttons 16px / nav-buttons 50px / pill-buttons 72px.
- 예외적으로 허용되는 제3의 색상은 오직 `state_color_palette`(배지 희귀도/카테고리)뿐이며, 그 외 화면에서 새로운 컬러를 임의로 추가하지 않는다.
- **라이트 테마 확장 대비**: 현재는 다크 테마 고정이지만, CSS 변수 이름은 `--color-main`/`--color-sub`처럼 값 자체를 가리키는 이름 외에, 배경/텍스트처럼 역할을 가리키는 시맨틱 변수(`--color-surface`, `--color-text`, `--color-border`)를 병행 정의해 다크 값에 매핑한다. 컴포넌트는 가능하면 시맨틱 변수를 참조해, 나중에 라이트 테마 값 세트를 추가하기만 하면 되도록 만든다. 단, 이번 Phase에서 실제 라이트 테마 값을 만들지는 않는다.

---

## iOS HIG 준수 규칙 (UX 패턴 — 절대 기준)

- **터치 영역**: 모든 버튼/링크/아이콘은 최소 44×44pt 히트 영역 확보 (시각적 크기가 작아도 padding으로 44pt 채움).
- **터치 피드백**: 모든 인터랙티브 요소에 active state(스케일 축소 또는 배경 반전) 적용, `active:` Tailwind variant 사용.
- **바텀 탭바**: 기존 `(main)/TabBar.tsx`의 6탭 구조·라우팅 로직(다른 유저 프로필 특수 케이스, `?from=badges` 케이스)을 그대로 유지하고 스타일만 교체한다. 탭 개수를 임의로 바꾸지 않는다.
- **상단 네비게이션**: 새로 만드는 `TopNav` 공통 컴포넌트를 모든 서브페이지에 적용 — 뒤로가기(chevron) + 타이틀 + 우측 액션 슬롯. `router.back()` 우선, 명시적 `href`가 있으면 `Link`로 대체.
- **바텀시트**: 상세 옵션/빠른 작업/컨텍스트 메뉴는 중앙 모달이 아닌 하단에서 올라오는 시트로 구현하고 상단에 드래그 핸들 바를 반드시 표시한다. 파괴적 액션(삭제 등)은 시각적으로 구분되는 색상/문구를 사용한다.
- **세이프 에어리어**: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`을 모든 풀스크린 레이아웃에서 준수한다 (기존 `(main)/layout.tsx` 패턴 유지).
- **엄지존/Sticky CTA**: 주요 전환 액션 버튼은 화면 하단 고정 영역에 배치한다.
- **로딩/빈 상태**: 로딩은 스켈레톤 또는 액티비티 인디케이터, 빈 상태는 다음 행동을 유도하는 버튼을 함께 제공한다 (이모지 대신 SVG 아이콘 사용).
- **키보드 세이프 영역**: 입력 폼 포커스 시 하단 CTA/입력창이 키보드에 가려지지 않도록 처리한다.

---

## i18n 규칙

- 모든 UI 텍스트(타이틀/버튼/안내문구/에러메시지/placeholder)는 JSX에 직접 문자열을 쓰지 않고 `src/lib/i18n/`의 딕셔너리 키로 참조한다.
- 새 문구가 필요하면 반드시 `ko.ts`에 키를 먼저 추가한 뒤 컴포넌트에서 참조한다. 반대 순서(하드코딩 먼저, 나중에 이관) 금지.
- 동적 값은 `{변수}` 보간 패턴을 사용한다 (예: `"{count}P"`).
- Phase 1 범위는 `ko` 로케일만 채우면 되고, 실제 번역(en 등)은 만들지 않는다.

---

## 절대 하지 마 (DO NOT)

- [ ] 이모지(🏅👤🔥 등)를 UI 아이콘/장식으로 새로 추가하지 마 — 단, 배지/아이템북 관리자가 등록한 실제 이미지(`badge_image_url`, `image_url`)는 예외로 그대로 유지.
- [ ] 드롭섀도, 블러, 그라데이션을 어떤 형태로도 추가하지 마 — 오직 1px inset border만 사용.
- [ ] 메인/서브 컬러, 상태 팔레트 외의 제3의 컬러를 임의로 도입하지 마.
- [ ] Pretendard 외 폰트를 추가하거나 400이 아닌 weight를 사용하지 마.
- [ ] UI 텍스트를 JSX에 직접 하드코딩하지 마 (i18n 딕셔너리 키 경유 필수).
- [ ] 기존 `(main)/TabBar.tsx`의 라우팅/활성탭 판별 로직을 스타일 변경 과정에서 임의로 바꾸지 마.
- [ ] 기존 Supabase 스키마(users/badges/missions 등)를 이번 리뉴얼 범위에서 임의로 변경하지 마 — 신규 테이블(`admin_theme_settings`, `state_color_palette`)만 추가.
- [ ] 터치 영역이 44×44pt 미만인 인터랙티브 요소를 만들지 마.
- [ ] 화면 하나를 절반만 새 디자인으로 바꾸고 완료라고 하지 마 — 한 화면은 항상 전체를 새 컴포넌트로 교체.

---

## 항상 해 (ALWAYS DO)

- [ ] 화면 하나를 바꾸기 전에 어떤 공통 컴포넌트를 쓸지 먼저 명시하고 진행.
- [ ] 모든 신규/수정 컴포넌트는 실제 브라우저(모바일 뷰포트)에서 스크린샷으로 확인 후 완료 보고.
- [ ] i18n 딕셔너리에 새 키를 추가할 때 namespace 규칙(`profile.*`, `tabs.*` 등)을 따른다.
- [ ] 상태 팔레트가 필요한 곳(배지 희귀도 등)은 하드코딩된 색상 매핑 객체 대신 팔레트 조회 함수를 통해 값을 가져온다. 단, 팔레트 시드 값 자체는 기존 jam-teal/purple/yellow에서 재조정하지 않고 그대로 이관한다.
- [ ] 접근성: 텍스트 색상과 배경 색상의 대비가 WCAG AA(4.5:1) 이상인지 확인 (특히 Cobalt Mist 사용 시 주의).

---

## 테스트 방법

```bash
# 로컬 실행
cd jam-web && npm run dev

# 타입 체크
cd jam-web && npx tsc --noEmit

# 빌드 확인
cd jam-web && npm run build
```

- 화면별 리뉴얼 완료 시 Browser 프리뷰(모바일 393×852 뷰포트)로 스크린샷 검증 필수.
- 실기기 확인은 iOS Safari 기준으로 최소 1회 진행 (Safe Area, 스와이프 백 제스처 확인).

---

## 배포 방법

- 기존과 동일하게 Vercel Git 연동 자동 배포. 화면별로 작은 PR 단위로 나눠 리뷰/롤백을 쉽게 한다.

---

## 환경변수

- 변경 없음 (기존 `.env.local` 그대로 사용). 신규 테이블(`theme_presets`, `state_color_palette`) 접근에 별도 환경변수 불필요 (기존 Supabase 클라이언트 재사용).

---

## RLS 정책 (확정)

- `theme_presets`, `state_color_palette` 모두 전체 유저 SELECT 허용 + INSERT/UPDATE/DELETE는 admin 역할만 가능 (기존 `badges`/`missions` 등 어드민 관리 테이블과 동일한 패턴).

## [NEEDS CLARIFICATION]

- [ ] `state_color_palette`의 `scope` 종류를 배지 희귀도/카테고리 외에 어디까지 미리 정의해둘지 — Phase 2 착수 시점에 재검토.
