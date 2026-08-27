---
id: 20260827_005
category: Service
status: CLOSED
created: 2026-08-27
closed: 2026-08-27
---

# [Service] TabBar 활성탭 판정 startsWith 접두어 오매칭 선제 수정

## 배경 / 문제 정의
어드민 사이드바에서 `/admin/points`가 `/admin/poi`의 문자열 접두어로 잘못 매칭되는 버그가
발생해 `isNavItemActive`를 `pathname === href || pathname.startsWith(href + '/')`로 수정한 바
있다 (티켓 `20260827_003_Admin_사이드바-활성메뉴-판정-버그수정`).

서비스 하단 탭바(`jam-web/src/components/ui/TabBar.tsx`)의 `isActive` 함수 마지막 분기가 동일한
패턴(`return pathname.startsWith(href)`)을 그대로 쓰고 있다. 현재 `baseTabs`의 href 목록
(`/`, `/badges`, `/drops`, `/missions`, `/inventory`)은 서로 문자열 접두어 관계가 아니므로
**지금 당장 실제 오매칭은 발생하지 않는다.** 다만 향후 탭 경로가 추가·변경되면(예: `/badge`,
`/drop` 같은 유사 경로) 동일 패턴으로 재발할 수 있는 취약한 코드이므로 선제적으로 안전한
형태로 고쳐둔다.

## 상세 요구사항

### 서비스/코드베이스 관점
- `TabBar.tsx`의 `isActive` 함수(172~177줄) 마지막 `return pathname.startsWith(href)`를
  `return pathname === href || pathname.startsWith(href + '/')`로 변경
- 위쪽 특수 분기(`href === '/'` 정확 매칭, `viewingOtherUser` 시 `/badges` false 처리,
  `fromBadges` 시 `/badges`만 true)는 이미 정확 매칭이거나 별도 로직이므로 변경하지 않음
- `/inventory/[itemId]`, `/badges/[id]`, `/missions/[id]` 같은 상세 페이지에서 해당 탭이
  계속 활성 상태로 유지되는지 확인 (수정 후에도 하위 경로 매칭이 깨지지 않아야 함)
- 154~166줄 부근 `fromBadges`/`viewingOtherUser` 관련 `pathname.startsWith('/inventory')`,
  `pathname.startsWith('/collections')`, `pathname.startsWith('/badges')` 호출부도 같은
  종류의 접두어 오매칭 위험이 있는지 점검 (`jam-web/src/app/(main)/` 하위에 `/inventory*`,
  `/collections*`, `/badges*`로 시작하는 다른 형제 라우트가 있는지)

## 구현 계획
- 사전 조사 결과(오케스트레이터 확인): `jam-web/src/app/(main)/` 최상위 라우트는
  `badges`, `collections`, `combine`, `drops`, `inventory`, `missions`, `notifications`,
  `onboarding`, `points`, `profile`, `search`, `today`, `[username]`로 서로 접두어 충돌이
  없다. `/inventory/[itemId]`, `/badges/[id]`, `/missions/[id]`는 하위 상세 라우트로 존재하고
  `/drops`, `/collections`는 최상위에서 `[id]` 하위 라우트를 가진다(`/collections/[id]`).
  → 154~166줄의 `startsWith('/inventory')`/`startsWith('/collections')`/`startsWith('/badges')`는
  **현재는 접두어 오매칭 위험이 없음** (형제 라우트 부재). 수정 범위는 `isActive` 마지막
  분기 1곳으로 한정한다.
- 변경 파일: `jam-web/src/components/ui/TabBar.tsx`

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`TabBar.tsx`의 `isActive` 함수 마지막 분기를 `pathname.startsWith(href)`에서
`pathname === href || pathname.startsWith(href + '/')`로 변경했다. 어드민 사이드바
`isNavItemActive`(티켓 20260827_003)와 동일한 안전 패턴이다. 위쪽 특수 분기
(`href === '/'`, `viewingOtherUser`, `fromBadges`)와 154~166줄의 `fromBadges` 판정용
`startsWith('/inventory')`/`startsWith('/collections')`는 요구사항대로 변경하지 않았다.

### 변경된 파일
```
jam-web/src/components/ui/TabBar.tsx
```

### 테스트 결과
- [x] `isActive` 로직을 순수 함수로 재현해 케이스 검증(Node 스크립트):
  - `/` ↔ `/`(true), `/` ↔ `/inventory`(false, `/`는 별도 정확매칭 분기 유지)
  - `/inventory` ↔ `/inventory`(true), `/inventory` ↔ `/inventory/abc123`(true)
  - `/badges` ↔ `/badges/abc123`(true)
  - `/missions` ↔ `/missions/abc123`(true)
  - `/drops` ↔ `/drops`(true), `/drops` ↔ `/drops/abc`(true)
  - `/badges` ↔ `/badge`(false) — 향후 유사 경로 추가 시 접두어 오매칭 방지 확인
  - 전 케이스 PASS
- [x] `npx tsc --noEmit`으로 `TabBar.tsx` 타입 오류 없음 확인
- [ ] 실제 브라우저(스테이징/로컬 dev)에서 탭 클릭 시각 확인은 미실시(순수 로직 1줄 변경,
  분기 도달 케이스가 위 정적 검증으로 전수 커버됨)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (로직 변경만, 사용자 노출 텍스트 없음)

### 배포 정보
- 배포일: staging 2026-08-27 (프로덕션 반영은 `/jam-ship`으로 별도 진행)
- 환경: staging
- 커밋: (staging 머지 커밋 참조)

### 주요 의사결정 / 핵심 메모
- 티켓 구현 계획에 명시된 대로 154~166줄의 `startsWith('/inventory')`/`startsWith('/collections')`/
  `startsWith('/badges')`는 현재 형제 라우트 부재로 오매칭 위험이 없어 수정 범위에서 제외했다.
- 코드 상단 주석에 "로직은 `src/app/(main)/TabBar.tsx`와 100% 동일해야 한다"는 문구가 있으나
  실제로 해당 경로에 파일이 존재하지 않아(이미 통합된 것으로 추정) 동기화 대상이 없었다.
- **티켓 번호 재부여**: 최초 `20260827_004`로 생성했으나, 같은 날 다른 세션이 동일 번호
  (`20260827_004_Service_컬렉션비활성화-미픽업드랍-지연무효화`)를 먼저 staging에 병합해
  머지 직전 `20260827_005`로 재번호했다. 구현 커밋 메시지에는 원래 번호(004)가 남아있다.
- 게이트 리뷰 PASS, 개선 리뷰에서 범위 밖 발견물 2건(공용 `isPathActive` 유틸화 여지,
  `proxy.ts`의 동일 패턴 `startsWith` 접두어 위험) 확인 — 별도 작업으로 분리함.

### 잔여 이슈
- `jam-web/src/proxy.ts`의 `publicPaths.some(p => pathname.startsWith(p))`도 동일 패턴의
  접두어 오매칭 위험 (별도 작업 칩으로 분리 예정)
