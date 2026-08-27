---
id: 20260827_009
category: Service
status: OPEN
created: 2026-08-27
---

# [Service] 경로 접두어 매칭 유틸 통합 및 TabBar 죽은 주석 정리

## 배경 / 문제 정의
티켓 `20260827_006_Service_TabBar-활성탭-판정-접두어오매칭-선제수정`의 개선 리뷰에서
범위 밖 발견물로 남은 2건을 처리한다.

`pathname === X || pathname.startsWith(X + '/')` 형태의 안전한 접두어 매칭 로직이
아래 3곳에서 각자 재구현돼 있다:
- `jam-web/src/components/admin/adminNavItems.ts`의 `isNavItemActive`
- `jam-web/src/components/ui/TabBar.tsx`의 `isActive` (마지막 분기)
- `jam-web/src/lib/imageSrc.ts`의 `matchesPathname`

또한 `TabBar.tsx` 상단 docblock(58~66줄 부근, `interface TabBarProps` 바로 위)에
"라우팅/활성탭 판별 로직은 기존 `src/app/(main)/TabBar.tsx`와 100% 동일합니다"라는
문구가 있으나, 실제로 `jam-web/src/app/(main)/TabBar.tsx` 파일은 저장소에 존재하지
않는다(이미 `components/ui/TabBar.tsx`로 통합된 것으로 추정 — 20260827_006 완료 기록에서도
동일하게 확인됨). 존재하지 않는 파일을 가리키는 죽은 주석이라 정리가 필요하다.

## 상세 요구사항

### 서비스/코드베이스 관점
1. **공용 유틸 신설**: `jam-web/src/lib/isPathActive.ts`에 아래 함수를 추가한다.
   ```ts
   /**
    * pathname이 href와 정확히 같거나 href 하위 경로인지 판정한다.
    * 단순 `pathname.startsWith(href)` 접두어 매칭은 `/admin/points`가 `/admin/poi`에
    * 오매칭되는 등 문자열 접두어 사고를 일으킨다(티켓 20260827_003, 20260827_006).
    */
   export function isPathActive(pathname: string, href: string): boolean {
     return pathname === href || pathname.startsWith(href + '/')
   }
   ```
2. **`adminNavItems.ts` 리팩터링**: `isNavItemActive`의 마지막 리턴을
   `isPathActive(pathname, item.href)` 호출로 교체한다. `item.exact` 분기(정확 매칭)는
   그대로 둔다.
3. **`TabBar.tsx` 리팩터링**: `isActive` 함수의 마지막 리턴(`pathname === href ||
   pathname.startsWith(href + '/')`)을 `isPathActive(pathname, href)` 호출로 교체한다.
   위쪽 특수 분기(`href === '/'`, `viewingOtherUser`, `fromBadges`)는 변경하지 않는다.
4. **`imageSrc.ts` 리팩터링**: `matchesPathname`의 `prefix === ''`가 아닌 분기
   (`pathname === prefix || pathname.startsWith(\`${prefix}/\`)`)를
   `isPathActive(pathname, prefix)` 호출로 교체한다. `prefix === ''` 특수 케이스
   (`pathname.startsWith('/')`)와 `pattern.endsWith('/**')`가 아닐 때의 완전 일치 분기는
   그대로 둔다. 파일 상단 JSDoc의 "의도적으로 보수적" 관련 설명은 로직이 바뀌지
   않으므로 수정하지 않는다.
5. **`TabBar.tsx` 죽은 주석 정리**: 58~66줄 부근 docblock에서
   "라우팅/활성탭 판별 로직은 기존 `src/app/(main)/TabBar.tsx`와 100% 동일합니다.
   (다른 유저 프로필 보기 `?u=` 케이스, `/inventory/[itemId]?from=badges` 케이스 포함)"과
   "로직을 수정할 일이 생기면 두 파일을 반드시 함께 맞추세요." 두 문장을 제거한다.
   (해당 경로에 파일이 없으므로 동기화 대상이 없다 — 존재하지 않는 파일을 가리키는
   지시는 오히려 향후 혼란을 유발한다.) 나머지 문구(시각 스타일 설명, 20260816_012
   참조)는 유지한다.
6. **순수 리팩터링 — 기능 변화 금지**: 4곳 모두 반환값이 기존과 100% 동일해야 한다.
   새 유틸 함수 시그니처 외에 다른 추상화·옵션·파라미터를 추가하지 않는다.

## 구현 계획
- 신규 파일: `jam-web/src/lib/isPathActive.ts`
- 변경 파일: `jam-web/src/components/admin/adminNavItems.ts`,
  `jam-web/src/components/ui/TabBar.tsx`, `jam-web/src/lib/imageSrc.ts`
- 회귀 테스트: 4곳(신규 유틸 자체 + 3개 호출부) 각각에 대해 리팩터링 전/후 동일 입력에
  동일 출력이 나오는지 확인한다. 특히:
  - `adminNavItems.ts`: `/admin/points` vs `/admin/poi` 오매칭 없음 재확인
    (티켓 20260827_003 회귀 케이스)
  - `TabBar.tsx`: `/inventory` vs `/inventory/abc123`(true), `/badges` vs `/badge`(false)
    등 20260827_006 완료 기록에 남은 테스트 케이스 재확인
  - `imageSrc.ts`: `isOptimizableImageSrc`의 기존 동작(Supabase Storage 공개 경로,
    `*.googleusercontent.com` 아바타 판정) 회귀 없는지 확인
- `npx tsc --noEmit`으로 타입 오류 없음 확인
- 시각적 변경이 없는 순수 로직 리팩터링이므로 브라우저 확인은 선택 사항이다(정적
  회귀 테스트로 전수 커버 가능하면 생략 가능, 완료 기록에 근거를 남길 것).

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 공용 유틸 `jam-web/src/lib/isPathActive.ts`를 신설하고, `adminNavItems.ts`(`isNavItemActive`)·
  `TabBar.tsx`(`isActive`)·`imageSrc.ts`(`matchesPathname`)에서 각자 재구현돼 있던
  `pathname === X || pathname.startsWith(X + '/')` 패턴을 이 함수 호출로 교체했다.
  `item.exact` 분기, `viewingOtherUser`/`fromBadges` 특수 분기, `prefix === ''` 특수 케이스는
  스펙대로 그대로 뒀다.
- `imageSrc.ts`는 `next.config.ts`가 직접 import하는 파일이라(Next의 config 전용 경량
  TS 트랜스파일러는 `@/` 별칭의 중첩 모듈을 재귀적으로 해석하지 못함) `isPathActive`를
  `@/lib/isPathActive` 별칭이 아닌 상대경로(`./isPathActive`)로 import했다. 별칭으로 두면
  `next.config.ts` 로딩 자체가 `Cannot find module` 오류로 깨졌다(vitest 실행 중 실측 확인).
  같은 디렉토리(`src/lib/`)라 상대경로 전환에 다른 부작용은 없다.
- `TabBar.tsx` 상단 docblock에서 존재하지 않는 `src/app/(main)/TabBar.tsx`를 가리키는
  두 문장(동기화 지시 포함)을 제거했다. 나머지 문구(시각 스타일 설명, 20260816_012 참조)는 유지.

### 변경된 파일
```
신규: jam-web/src/lib/isPathActive.ts
신규: jam-web/src/lib/__tests__/isPathActive.test.ts
신규: jam-web/src/components/admin/__tests__/adminNavItems.test.ts
변경: jam-web/src/components/admin/adminNavItems.ts
변경: jam-web/src/components/ui/TabBar.tsx
변경: jam-web/src/lib/imageSrc.ts
```

### 테스트 결과
- [x] `npx vitest run src/lib/__tests__/isPathActive.test.ts src/components/admin/__tests__/adminNavItems.test.ts src/lib/__tests__/imageSrc.test.ts` — 3개 파일 19개 테스트 전체 통과
  - `isPathActive` 자체: 정확 일치/하위 경로/오매칭 방지(`/admin/points` vs `/admin/poi`, `/badge` vs `/badges`) 케이스
  - `adminNavItems.isNavItemActive`: exact 분기, 하위 경로, `/admin/poi` vs `/admin/points` 오매칭 회귀(티켓 20260827_003) 재확인
  - `imageSrc.isOptimizableImageSrc`(기존 테스트, 무수정): Supabase Storage 공개 경로 prefix 경계, 서명 URL 차단, 구글 아바타 서브도메인 등 11개 케이스 회귀 없음
- [x] `TabBar.tsx`의 `isActive`는 함수가 export되지 않아(스펙상 새 추상화 추가 금지) 직접 유닛
  테스트 대상이 아니다. 치환 전/후 표현식이 리터럴로 동일(`pathname === href ||
  pathname.startsWith(href + '/')`)함을 스크래치 스크립트로 기계적 대조해 확인 —
  `/inventory` vs `/inventory/abc123`(true), `/inventory-x` vs `/inventory`(false),
  `/badge` vs `/badges`(false), `/badges` vs `/badges`(true) 등 전부 일치.
- [x] `npx tsc --noEmit` — 오류 없음
- [x] `npx eslint`(변경 파일 전체) — 오류 없음
- 브라우저 확인은 생략함(순수 로직 리팩터링, 위 정적 회귀 테스트로 전수 커버)

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (로직 변경만, 사용자 노출 텍스트 없음)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
- 현재 워크트리(`claude/heuristic-franklin-726d0f`)는 `origin/staging`보다 오래된 지점에서
  분기돼 있어, 워크트리 HEAD의 `adminNavItems.ts`/`TabBar.tsx`에는 티켓 20260827_003/006의
  안전 패턴 수정이 아직 반영돼 있지 않았다(구현 시작 전 확인 결과 `pathname.startsWith(...)`
  단순 접두어만 남아있었음). `origin/staging`에는 이미 안전 패턴이 병합돼 있음을 확인하고,
  절대 규칙 5에 따라 `origin/staging`을 기점으로 새 리뷰 브랜치를 분기해 그 위에서 작업했다.
  따라서 실제 리팩터링은 스펙대로 "이미 안전한 3곳을 공용 유틸로 통합"하는 순수 리팩터링이
  맞다.
- `next.config.ts`가 `imageSrc.ts`를 직접 import하는 구조라 `imageSrc.ts` 내부에서 `@/` 별칭을
  쓰면 config 로딩이 깨진다는 사실을 이번에 처음 확인했다(아래 alerts 참조).
- **티켓 번호 재부여**: 최초 `20260827_007`로 생성했으나, 병합 직전 재확인한 origin/staging에
  동시 세션이 같은 번호(`20260827_007_API_SERVICE_OPERATIONS-어드민API-HTTP메서드-표기오류-정정`)와
  그다음 번호(`20260827_008_Service_인증미들웨어-publicPaths-접두어오매칭-선제수정`)를 이미 병합해
  `20260827_009`로 재번호했다. 참고로 `20260827_008`은 개선 리뷰에서 범위 밖 발견물로 지목했던
  `proxy.ts`의 `publicPaths` 접두어 오매칭을 동시 세션이 이미 별도로 수정한 것이라, 이 티켓에서
  추가 조치는 불필요하다.

### 잔여 이슈
- 없음 (`proxy.ts` 건은 동시 세션이 티켓 20260827_008로 이미 처리함)
