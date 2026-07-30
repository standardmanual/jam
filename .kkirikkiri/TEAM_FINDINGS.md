# 발견 사항 & 공유 자료 (transitions-apply)

## 2026-07-30 — 메인세션: transitions-dev 감사 결과 요약 (관리자 제외, jam-web/src/app/(main), (auth) 스코프)

전체 감사 리포트는 이전 대화 턴에서 Explore 서브에이전트가 작성. 핵심 파일/라인:

- `src/components/ui/BottomSheet.tsx:60-75` — 공유 바텀시트, 진입 애니메이션 없음 → Panel reveal
- `src/components/ui/Toast.tsx:57-72` — 전역 토스트, 등장/소멸 애니메이션 없음 → Toast open/close
- `src/components/ui/TabBar.tsx:141-143` — 활성탭 점 표시자 즉시 팝 → Notification badge
- `src/app/(main)/badges/BadgesClient.tsx:104-119`, `src/app/(main)/missions/MissionsListClient.tsx:139-152`, `src/app/(main)/FeedSection.tsx:243-258`, `src/app/(main)/profile/ProfileClient.tsx:339-362` — 탭 배경색 즉시 전환 → Tabs sliding (신규 공유 컴포넌트로)
- `src/app/(main)/[username]/FollowButton.tsx:9-30`, `ProfileClient.tsx:206-219,394-406` — 팔로우/팔로잉 라벨 즉시 전환 → Text states swap
- `src/app/(main)/points/page.tsx:79-83`, `ProfileClient.tsx:339-350` — 숫자 즉시 갱신 → Number pop-in
- `src/app/(main)/onboarding/page.tsx:100-149`, `src/app/(main)/profile/edit/page.tsx:225-244` — 닉네임 중복확인 메시지 → Text states swap + Error state shake
- `src/app/(main)/drops/DropsClient.tsx:262-346` — 커스텀 POI 바텀시트, 진입 애니메이션 없음 → Panel reveal / 헤더 타이틀 → Text states swap
- `src/app/(main)/missions/MissionsListClient.tsx:169-227` — 필터 패널 즉시 표시/숨김 → Accordion expand
- `src/app/(main)/missions/[id]/MissionDetailClient.tsx:181,277-293` — 달성뱃지 텍스트 스왑, 참가확인 카드 → Panel reveal
- `src/app/(main)/FeedSection.tsx:130-172` — DetailSheet(커스텀 오버레이) → Panel reveal
- `src/app/(main)/combine/CombineClient.tsx:99-103` — 조합 성공 배너 → Success check
- `src/app/(main)/profile/ProfileClient.tsx:246-260` — 탭 로딩 스피너 → Skeleton loader and reveal
- `src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx:88-90` — 로딩 스피너 → Skeleton loader and reveal

해당없음(적용 대상 아님, 스킵): 체크박스/토글 UI 없음, 커스텀 드롭다운 없음(네이티브 select만), 좋아요/하트 버튼 없음, 툴팁 UI 없음, +버튼→메뉴 모핑 대상 없음.

## 2026-07-30 — dev-pages: 적용 중 알아낸 것들 (dev-shared도 참고 요망)

### 1. 이 프로젝트는 컴포넌트에서 일반(non-module) CSS를 직접 import 할 수 있다
`src/lib/dotmatrix-core.tsx`가 이미 `import '@/components/dotmatrix-loader.css'`를 하고 있고,
Next 16 App Router에서 정상 동작한다. 즉 CSS Modules로 클래스명을 해싱하지 않아도 되고,
`t-*` / `is-*` / `data-state` 같은 **문서화된 훅 이름을 그대로 쓸 수 있다.**
(CSS Modules를 쓰면 `:root { --… }`가 "not pure" 에러가 나므로 오히려 불리하다.)

### 2. React Compiler 린트 규칙이 매우 엄격하다 — 명령형 오케스트레이션은 ref로만
`react-hooks/set-state-in-effect`, `react-hooks/refs`, `react-hooks/immutability`가 켜져 있다.
- `useEffect` 안에서 `setState()`를 직접 호출하면 에러 → **DOM 클래스/속성을 직접 토글**하면 통과.
- `useState`로 잡은 노드를 mutate 하면 `immutability` 에러 → **`useRef`로 잡은 노드는 통과.**
- 렌더 중 `useRef(x).current`를 읽으면 에러 → 초기값 고정은 `const [v] = useState(x)`로.
결론: 스킬의 바닐라 스니펫을 React로 옮길 때 상태를 만들지 말고 ref + DOM 조작으로 유지하는 편이
린트도 통과하고 문서와도 더 가깝다.

### 3. 조건부 렌더 패널의 Panel reveal은 "다음 프레임에 data-open 뒤집기"가 필요하다
`{open && <Panel/>}` 구조는 마운트 프레임에 이미 `data-open="true"`면 트랜지션이 재생되지 않는다.
JSX에는 항상 `data-open="false"`를 렌더하고, effect에서 `setAttribute('false')` → 리플로우 →
`requestAnimationFrame`으로 `'true'`를 넣는다. `useRevealOnMount`(transitions-pages.ts)에 구현돼 있으니
BottomSheet/DetailSheet에도 그대로 재사용 가능.

### 4. Text states swap을 React에서 쓸 때의 함정
JSX에 `{text}`를 그대로 렌더하면 React가 커밋 단계에서 textContent를 즉시 바꿔버려 exit 단계가 사라진다.
**JSX에는 최초 텍스트만(상수) 렌더하고 이후 교체는 전부 DOM 직접 조작**으로 처리해야 한다.
SSR/하이드레이션도 이 방식이 안전하다. `useTextSwap`이 이 처리를 담고 있다.

### 5. Skeleton reveal의 레이아웃 붕괴
문서 스니펫은 skeleton/content 두 레이어를 모두 `position:absolute`로 깔기 때문에 래퍼가 높이를 갖지 못한다.
로딩 중에는 `--skel-min-h`로 자리를 잡아두고, cross-fade가 끝나면 `.is-settled`로 콘텐츠를 일반 흐름에
되돌리는 프로젝트 로컬 규칙을 `transitions-pages.css` 하단에 추가해 뒀다.
(ProfileClient 탭 로딩 스켈레톤에도 같은 문제가 생길 것이므로 재사용 권장.)

### 6. 바이너리 컬러 원칙과 Error state shake
이 프로젝트는 에러를 색으로 표현하지 않고 inset box-shadow 두께로만 구분한다. 그래서 스니펫의
`border-color` 트윈은 실질적으로 무의미하고, **핵심은 `.is-shaking` 흔들림**이다.
또 `.t-error-msg`는 쓰지 않았다 — 닉네임 메시지는 에러 전용이 아니라 "사용 가능"도 같이 표시하기 때문에
Text states swap으로 처리하는 편이 맞다.

## 2026-07-30 — dev-shared

- **공유 컴포넌트가 3종 준비됨.** 앞으로 같은 패턴이 필요하면 새로 만들지 말고 재사용하세요.
  - `@/components/ui/SlidingTabs` — 세그먼트 컨트롤/필터 탭 전부
  - `@/components/ui/SwapText` — 라벨/상태 문구가 제자리에서 바뀌는 곳
  - `@/components/ui/PopInNumber` — 숫자가 갱신되는 곳
  - `@/lib/motion` 의 `cssDurationMs()` — JS에서 duration이 필요할 때 (하드코딩 금지)
- **`transitions.css` ↔ `transitions-pages.css` 중복.** 두 파일이 `.t-text-swap` /
  `.t-panel-slide` / `.t-digit-*` / `.t-skel-*`와 `:root` 토큰을 각각 정의합니다.
  값은 둘 다 스킬 원본이라 동작 차이는 없지만, 스킬의 "중복 설치 금지" 규칙상
  정리 대상입니다. 정식 위치는 `globals.css`(:root 토큰) + `components/transitions.css`
  (스니펫)이며, `transitions-pages.css`는 여기에 없는 것(Error state shake / Success check)만
  남기고 나머지는 걷어내는 게 좋습니다. **메인세션 통합 시 판단 필요.**
- `DetailSheet`(FeedSection) 시그니처가 `{ item, open, onClose, onClosed, badgeLinkQuery }`로
  바뀌었습니다. 닫힘 트랜지션을 보여주려면 부모가 `open`만 내리고 `onClosed`에서 언마운트합니다.
- `.t-skel` 원본은 두 레이어 모두 absolute라 래퍼 높이가 0이 됩니다. dev-shared는
  `.jam-skel-flow`(콘텐츠는 흐름 유지 + `--jam-skel-min-h`), dev-pages는 `.is-settled`로
  각각 우회했습니다. 통합 시 한쪽으로 통일 권장.
