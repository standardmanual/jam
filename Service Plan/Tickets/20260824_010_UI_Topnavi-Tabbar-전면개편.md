---
id: 20260824_010
category: UI
status: CLOSED
created: 2026-08-24
closed: 2026-08-24
---

# [UI] Topnavi 전면 노출 확대 + 3분할 구성(로고/뒤로가기·동기화·프로필) + Tabbar 프로필 탭 제거

## 배경 / 문제 정의

현재 TopNav는 상세/서브페이지(배지 상세, 미션 상세 등)에만 뒤로가기 용도로 노출되고,
탭 최상위(목록) 페이지(홈·배지·미션·인벤토리)는 각자 다른 자체 헤더를 쓴다. 스트라바 동기화
버튼은 홈 화면 카드 안에만 있고, 프로필 이미지는 TopNav/TabBar 어디에도 노출되지 않으며
TabBar에 별도 프로필 탭(아이콘, 실제 아바타 아님)이 있다.

이번 개편으로 TopNav를 모든 페이지 공통 3분할 구조(좌: 로고 또는 뒤로가기 / 중: 스트라바
동기화 버튼 / 우: 프로필 이미지)로 통일하고, TabBar에서 프로필 탭을 제거해 프로필 진입을
TopNav의 프로필 이미지로 일원화한다. 사용자와 `/design` 세션에서 확정한 스펙 — 아래 "확정
스펙" 절 그대로 구현한다.

## 확정 스펙 (사용자 확인 완료)

### Topnavi 구성 (모든 페이지 공통, 3분할)
`좌측(로고 또는 뒤로가기) | 스트라바 동기화 버튼 | 프로필 이미지`

- **좌측**: 탭 최상위(목록) 페이지(홈/배지/미션/인벤토리)는 공통으로 'Jam 로고' 노출.
  서브페이지(배지 상세, 미션 상세, 프로필 편집, 포인트, 검색, 팔로워/팔로잉, 컬렉션 등
  기존 TopNav 사용 페이지)는 기존처럼 `< 뒤로가기 + 텍스트` 유지 — **title 텍스트 정책
  자체는 건드리지 않는다** (페이지마다 제각각인 현재 문구를 통일하는 작업이 아님).
- **중앙**: 스트라바 동기화 버튼, 레이블 '동기화'. 스트라바 미연동 유저에게도 항상
  노출되며, 누르면 스트라바 연결 플로우로 유도(연동 유저는 기존 SyncButton과 동일하게
  수동 동기화 트리거). 이 버튼이 모든 페이지 공통으로 생기므로, 홈 화면 카드 안에 있던
  기존 동기화 UI(`SyncButton` 렌더 + 미연동 시 "연결하기" 링크)는 제거한다.
- **우측**: 프로필 이미지(서클 안 `avatar_url`, 없으면 기존 placeholder 아이콘 스타일
  유지). 누르면 본인 프로필 페이지(`/{username}`)로 이동.

### 페이지별 적용 범위
- 홈(`/`): 새 Topnavi 노출. 기존 자체 헤더의 Jam 로고 블록(`page.tsx` L64-66,
  `/jam-logo-white.png`) 제거하고 Topnavi로 대체.
- 배지 목록(`/badges`): Topnavi 노출(좌측 Jam 로고). 기존 `BadgesClient` 자체 헤더 대체.
- 배지 상세(`/badges/[id]`): 기존 TopNav(뒤로가기)에 동기화 버튼+프로필 이미지 추가해
  3분할로 통일. 배경 있는 배지의 TopNav 투명 처리 등 기존 동작은 유지.
- 드랍(`/drops`): **변경 없음.** Topnavi 미노출 유지.
- 미션 목록(`/missions`): Topnavi 노출(좌측 Jam 로고).
- 미션 상세(`/missions/[id]`, `/missions/[id]/status`): 기존 TopNav(뒤로가기)에 동기화
  버튼+프로필 이미지 추가해 3분할로 통일.
- 인벤토리(`/inventory`): Topnavi 노출(좌측 Jam 로고).
- 프로필(`/{username}`): **변경 없음** — 티켓 20260820_015 결정(본인 프로필은 TopNav
  미노출, 타인 프로필은 뒤로가기 TopNav 유지) 그대로 존속. 단, 타인 프로필에서 노출되는
  TopNav에도 동기화 버튼+프로필 이미지(본인 프로필로 이동)를 추가해 다른 서브페이지와
  일관성을 맞춘다.
- 그 외 기존 TopNav 사용 서브페이지(`/profile/edit`, `/points`, `/search`,
  `/{username}/followers`, `/{username}/following`, `/{username}/collections`,
  `/collections/[id]`): 배지 상세/미션 상세와 동일한 원칙 — 뒤로가기+텍스트는 유지하고
  동기화 버튼+프로필 이미지를 추가해 3분할로 통일.

### Tabbar 구성
`홈 | 배지 | 드랍 | 미션 | 인벤토리` (5탭, 프로필 탭 제거)
- 각 탭의 기존 링크/라우팅은 유지, 프로필 탭만 제거.
- 드랍 페이지는 Topnavi가 없어 그 화면에서는 프로필 진입 경로가 없어지는데(다른 탭
  경유 필요), **사용자 확인 완료 — 허용, 별도 대응 불필요.**

## UI 탐색·재사용 판정 *(1.5단계, 오케스트레이터 판정)*

`_ds_manifest.json` 확인 결과:
- **Button** (`design-system/components/buttons/Button.jsx`): 기존 `SyncButton.tsx`가
  이미 DS `Button`(`variant="outline" surface="sub" size="sm"`)을 쓰고 있음 →
  Topnavi의 동기화 버튼도 **동일 DS Button 재사용**, 신규 컴포넌트 불필요.
- **Avatar**: DS 매니페스트에 별도 Avatar 컴포넌트 없음. 현재 프로필 원형 이미지는
  `ProfileClient.tsx`에 인라인 스타일로만 구현돼 있음(96px/40px 두 곳). 이번 범위는
  TopNav 우측 슬롯 전용(예상 크기 1종, 약 32~36px)이라 **별도 DS 컴포넌트로 승격하지
  않고 TopNav 내부에 인라인 서브엘리먼트로 추가**한다(스코프 최소화). 재사용처가
  늘어나면 후속 티켓에서 Avatar 컴포넌트 승격을 검토.
- **TopNav 확장 방식**: 티켓 20260820_009에서 이미 `titleSize`/`style` 등 prop 확장
  선례가 있음(하위 호환 유지하며 prop 추가하는 패턴) → 이번에도 동일 패턴으로
  `logoSlot`/`leftContent`(또는 유사 이름), `syncSlot`, `avatarSlot`류 prop을
  `TopNav.jsx`/`.d.ts`에 추가하고 서비스 래퍼(`src/components/ui/TopNav.tsx`)에서
  라우팅·데이터(스트라바 연동 상태, avatar_url)를 채워 넣는다. 기존 `rightSlot`과
  경합하지 않도록 우선순위/우선 적용 범위를 구현 중 정리할 것(현재 `rightSlot`
  사용처는 없는지 확인 필요 — 있다면 마이그레이션 방법 결정).
- **TabBar**: 티켓 20260820_009 시점 기준 `TabBar`는 "병존 구현"(DS `TabBar.jsx` ↔
  서비스 `src/components/ui/TabBar.tsx` 로직 분리, 값만 수동 동기화) 상태로 확인됨.
  이번 프로필 탭 제거는 **두 파일을 각각 고쳐야 한다** — 하나만 고치면 스토리북과
  실제 서비스 화면이 어긋난다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `design-system/components/navigation/TopNav.jsx` + `.d.ts`: 좌측 로고 표시 모드,
  중앙 동기화 버튼 슬롯, 우측 아바타 슬롯을 prop으로 추가(하위 호환 유지 — 기존
  `title`/`showBack`/`onBack`/`rightSlot`/`headerStyle`/`titleSize` 등 호출부 무변경
  동작 보존).
- `src/components/ui/TopNav.tsx`: 스트라바 연동 상태 조회(기존 `SyncButton.tsx`가 쓰는
  방식 참고) + 클릭 핸들러(연동 유저=동기화 트리거, 미연동=연결 플로우 이동), 로그인
  유저의 `avatar_url`/`username` 조회해 아바타 렌더+`/{username}` 이동 연결.
- `src/app/(main)/page.tsx`: 기존 로고 헤더 블록과 카드 내 동기화 UI(`SyncButton`,
  "연결하기" 링크) 제거, 새 Topnavi로 대체.
- `src/app/(main)/badges/BadgesClient.tsx`, `src/app/(main)/missions/page.tsx`(또는
  해당 목록 컴포넌트), `src/app/(main)/inventory/page.tsx`: 각 자체 헤더 제거하고
  Topnavi(좌측 로고) 적용.
- 배지 상세/미션 상세/프로필 편집/포인트/검색/팔로워·팔로잉/컬렉션/타인 프로필: 기존
  TopNav 호출부에 동기화+아바타 슬롯을 채워 넣도록 각 호출부 수정(호출부 자체 API가
  안 바뀌면 이상적 — 1.5단계 판정대로 서비스 래퍼에서 기본 주입 시도).
- `src/components/ui/TabBar.tsx`, `design-system/components/navigation/TabBar.jsx`:
  프로필 탭 제거, 5탭 레이아웃 폭 재분배.
- Storybook: `TopNav.stories.tsx`(새 슬롯 스토리 추가), `TabBar.stories.tsx`(5탭 반영).
- `.prompt.md`: `TopNav.prompt.md`, `TabBar.prompt.md` 변경 내용 반영.

### UI/UX 관점
- Topnavi 3영역 배치·터치 타겟(44px 이상) 확인.
- 아바타 없는 유저(placeholder) 상태 확인.
- 배경 있는 배지 상세 등 기존 TopNav 투명 처리 로직과 새 슬롯이 시각적으로 충돌하지
  않는지 확인.
- TabBar 5탭 폭 재분배 후 아이콘 간격·터치 타겟 확인.

## 구현 계획
1. DS `TopNav.jsx`/`.d.ts` 슬롯 확장 → Storybook 스토리 갱신
2. 서비스 `TopNav.tsx` 래퍼에 스트라바 상태·아바타 데이터 연결
3. 홈/배지 목록/미션 목록/인벤토리 자체 헤더 → Topnavi로 교체
4. 배지 상세/미션 상세 등 기존 TopNav 호출부에 신규 슬롯 적용
5. 홈 화면 기존 동기화 카드 UI 제거
6. DS `TabBar.jsx` + 서비스 `TabBar.tsx` 프로필 탭 제거(양쪽 동기화) → Storybook 갱신
7. `.prompt.md` 문서 갱신
8. staging에서 각 페이지 Topnavi 노출·동기화 버튼 동작(연동/미연동)·아바타 클릭 이동·
   TabBar 5탭 확인

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- DS `TopNav.jsx`/`.d.ts`에 `logoSlot`/`centerSlot`/`avatarSlot` 3개 prop 추가(하위 호환
  유지 — 기존 title/showBack/rightSlot 호출부 무변경 동작 보존). 좌측은 `logoSlot`이 있으면
  back+title 블록 전체를 대체, 중앙은 새 고정폭 슬롯, 우측은 기존 `rightSlot` 뒤에
  `avatarSlot`이 이어붙는 구조.
- 서비스 `TopNav.tsx` 래퍼가 신설 컨텍스트 `src/lib/topNavData.tsx`(`(main)/layout.tsx`가
  로그인 유저의 username/avatar_url/스트라바 연동 여부를 1회 조회해 주입)를 읽어 중앙
  슬롯(동기화 버튼)과 우측 아바타 슬롯을 **호출부 변경 없이 자동으로 채운다.** 이 덕분에
  배지 상세·미션 상세·프로필 편집·포인트·검색·팔로워/팔로잉·컬렉션·타인 프로필 등 기존
  `<TopNav>` 호출부는 코드 변경 없이 동기화 버튼+아바타가 함께 노출된다.
  - 연동 유저: 재사용 `SyncButton`(`src/components/SyncButton.tsx`, 기존 홈 카드 전용
    컴포넌트를 공용 위치로 이동)을 그대로 렌더링 — 배지 캐러셀/토스트 동작 동일.
  - 미연동 유저: DS `Button`(variant="outline" surface="sub" size="sm", 라벨 "동기화")을
    렌더링, 클릭 시 `/api/strava/auth`(기존 연결 플로우 라우트)로 이동.
  - 우측 아바타: `avatar_url` 있으면 원형 이미지, 없으면 `UserIcon` placeholder. 클릭 시
    `/{username}`(본인 프로필)로 이동. 터치 영역 44×44, 시각 크기 36px.
- 신규 `logo` prop(서비스 래퍼 전용) — true면 좌측에 Jam 로고(`/jam-logo-white.png`) 노출,
  back+title 무시. 홈/배지 목록/미션 목록/인벤토리 4개 탭 최상위 페이지에 적용.
- 홈(`page.tsx`): 기존 자체 로고 헤더 블록 제거 → `<TopNav logo />`로 대체. Strava 카드
  안의 `SyncButton` 렌더 + 미연동 "연결하기" 링크를 제거(Topnavi 중앙 슬롯으로 일원화됐으므로).
  카드 자체는 연동 상태를 보여주는 정보 표시로만 남김(제목/본문 텍스트는 유지, 스펙이
  명시한 "SyncButton 렌더 + 연결하기 링크"만 제거).
- 배지 목록(`BadgesClient.tsx`)/미션 목록(`MissionsListClient.tsx`)/인벤토리
  (`inventory/page.tsx`): 각 자체 헤더 상단에 `<TopNav logo headerStyle={{ background:
  'var(--color-surface)' }} />` 추가.
- `rightSlot` 충돌 확인: 실사용처는 `badges/[id]/page.tsx`(공유 버튼 `BadgeShareButton`)
  1곳뿐. `rightSlot`은 그대로 유지하고 `avatarSlot`이 그 옆(오른쪽)에 이어 붙도록 DS
  레이아웃을 설계해 마이그레이션 없이 공존시켰다.
- 드랍(`/drops`)·본인 프로필(`/{username}`, 티켓 20260820_015 정책)은 TopNav 자체를
  렌더링하지 않는 기존 로직 그대로 유지 — 변경 없음.
- `src/components/ui/TabBar.tsx`(서비스) + `design-system/components/navigation/TabBar.jsx`
  (DS) 양쪽에서 프로필 탭 제거(6탭→5탭: 홈/배지/드랍/미션/인벤토리). 서비스 쪽은
  `profileHref` 치환 로직·`isActive`의 프로필 판정 분기도 함께 제거.
- Storybook: `TopNav.stories.tsx`에 로고/중앙/아바타/조합/우측공존 스토리 5개 추가,
  `TabBar.stories.tsx`에서 프로필 스토리 제거 + argTypes 옵션 5개로 축소.
- `TopNav.prompt.md`/`TabBar.prompt.md`에 20260824_010 확장 내용 반영.

### 변경된 파일
```
design-system/components/navigation/TopNav.jsx
design-system/components/navigation/TopNav.d.ts
design-system/components/navigation/TopNav.stories.tsx
design-system/components/navigation/TopNav.prompt.md
design-system/components/navigation/TabBar.jsx
design-system/components/navigation/TabBar.d.ts
design-system/components/navigation/TabBar.stories.tsx
design-system/components/navigation/TabBar.prompt.md
src/lib/topNavData.tsx (신규)
src/components/SyncButton.tsx (신규 — src/app/(main)/SyncButton.tsx에서 이동)
src/app/(main)/SyncButton.tsx (삭제, 위로 이동)
src/components/ui/TopNav.tsx
src/components/ui/TabBar.tsx
src/app/(main)/layout.tsx
src/app/(main)/page.tsx
src/app/(main)/badges/BadgesClient.tsx
src/app/(main)/missions/MissionsListClient.tsx
src/app/(main)/inventory/page.tsx
```

### 테스트 결과
- [x] `npx tsc --noEmit` 통과
- [x] `npx eslint`(변경 파일 전체) 통과, 경고 없음
- [x] `npm run build` 프로덕션 빌드 성공(전체 라우트 컴파일 확인)
- [x] staging 병합 완료(`b100f407`) — 실제 화면(동기화 버튼 연동/미연동 클릭, 아바타 클릭
  이동, 탭바 5탭, 배지 상세 배경 테마 페이지에서 3분할 시각 확인)은 게이트 리뷰 WARN
  사유로 잔여 이슈에 남겨두고 별도 확인 예정

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [x] 용어 일관성: 새 문구 없음 — 기존 `d.today.syncButton`("동기화"), `d.profile.title`/
  `avatarAlt`만 재사용
- [x] 톤앤매너: 해당 없음(신규 문구 없음)
- [x] 에러 메시지: 해당 없음(신규 에러 문구 없음)
- [x] 문장 규칙: 해당 없음
- [x] 표기 규칙: 해당 없음

### 배포 정보
- 배포일: 2026-08-24
- 환경: staging
- 커밋: b100f407 (머지 커밋), staging에서 프로덕션 미배포 — `/jam-ship`으로 별도 진행 필요

### 주요 의사결정 / 핵심 메모
- `/design` 세션에서 4개 질문(좌측 영역 통일 여부, 서브페이지 적용 범위, 동기화 버튼
  미연동 처리, 드랍 페이지 프로필 접근 공백)에 대해 사용자 확인 완료 — 위 "확정 스펙"
  절 참고.
- Avatar를 별도 DS 컴포넌트로 승격하지 않고 TopNav 내부 슬롯으로만 처리하기로 결정
  (스코프 최소화, 재사용처 부족).
- 서비스 래퍼(`TopNav.tsx`)가 컨텍스트로 로그인 유저 데이터를 자동 주입하는 방식을
  택해, 배지 상세/미션 상세 등 기존 TopNav 호출부 13곳을 코드 변경 없이 3분할로
  전환했다(1.5단계 판정의 "서비스 래퍼에서 기본 주입" 지시를 문자 그대로 구현).
- 홈 화면 카드 UI는 스펙 문구("SyncButton 렌더 + 연결하기 링크 제거")를 그대로 따라
  액션만 제거하고 카드 자체(제목/본문/연동 상태 표시)는 유지했다 — 카드 전체를
  없애는 것은 스펙 범위 밖이라 판단.

### 잔여 이슈
- 배지 상세 등 테마 배경(비디오/이미지)이 적용된 페이지에서 동기화 버튼이 기존
  SyncButton 스타일(surface="sub", 라이트 배경 전제)을 그대로 쓴다 — 1.5단계 판정에서
  "기존 SyncButton과 동일하게" 재사용하도록 명시했기 때문에 그대로 따랐으나, 어두운
  테마 배경 위에서 대비가 낮아 보일 가능성이 있다. staging에서 육안 확인 권장.
- **게이트 리뷰 판정: WARN.** 스펙 일치는 코드 대조로 확인됐으나, 위 대비 이슈를
  포함해 실제 화면 육안 확인이 staging 병합 전이라 안 됐던 상태였다(현재는 병합
  완료, 육안 확인은 후속으로 진행).
- 개선 리뷰 제안: 미연동 유저에게도 "동기화" 라벨이 뜨는 라벨-동작 불일치 가능성
  (실제로는 "연결" 액션) — 문구 담당 검토 권장. 아바타 렌더링 로직이 TopNav/
  ProfileClient/MissionDetailClient 3곳에 중복 — 재사용처 늘면 DS Avatar 컴포넌트
  승격 검토.
- 범위 밖 발견물 2건은 사용자 승인 하에 별도 작업으로 분리함:
  1. 어드민 배지/아이템북 미리보기 프레임이 `TopNavDataProvider` 밖에서 렌더돼 실제
     화면엔 없던 동기화 버튼/아바타 placeholder가 미리보기에 나타남(클릭은 막혀
     있어 기능 오류는 없음)
  2. `d.today.stravaConnectButton`("지금 동기화하기") i18n 키가 이번 변경으로
     미사용 상태가 됨 — 정리 필요
