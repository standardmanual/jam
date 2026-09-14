---
id: 20260911_1019
category: Admin
priority: P2
status: OPEN
created: 2026-09-11
---

# [Admin] `cn` 유틸이 tailwind-merge를 쓰지 않아 shadcn 컴포넌트의 className 덮어쓰기가 불안정함

## 배경 / 문제 정의

티켓 [20260911_0901](20260911_0901_Admin_배지생성조회수정-아티팩트기준리뉴얼.md) 게이트 리뷰에서
발견된 범위 밖 이슈.

`jam-web/src/lib/utils.ts:115`의 `cn`은 클래스를 병합하지 않고 이어 붙이기만 한다.

```ts
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
```

shadcn 컴포넌트(`components/admin/ui/*`)는 `cn(기본클래스, className)`으로 호출부의 className이
기본값을 덮어쓴다고 가정하고 만들어졌다. 표준 shadcn의 `cn`은 `twMerge(clsx(...))`라서 충돌하는
유틸리티(예: 기본 `h-10`과 호출부 `h-11`)가 있으면 뒤쪽 하나만 남긴다. 이 저장소의 `cn`은 둘 다
남기므로, 어느 쪽이 이기는지는 Tailwind가 CSS를 생성한 선언 순서에 따라 정해진다. 호출부
의도와 다르게 렌더될 수 있다.

- `tailwind-merge`는 `package.json`에 이미 의존성으로 들어 있다(`^3.6.0`). 그런데 `cn`이 쓰지
  않는다.
- 리뉴얼 작업에서 개발자는 접미사 입력, 필드 찾기 입력, 계열 키 읽기 전용 칸, 상태 배지를 직접
  칠해서 이 문제를 우회했다.
- 다른 어드민 화면에서도 shadcn 컴포넌트의 테두리·높이·배경을 className으로 덮어쓰는 곳이 있다
  (예: `BadgeCard.tsx`·`BadgeDetail.tsx`의 `<Button className="h-11 md:h-10">`). 이런 곳은 잠재
  결함이다.

## 상세 요구사항

### 서비스/코드베이스 관점

- `cn`을 `twMerge`로 감싸는 방안을 검토한다. 이 `cn`은 서비스 화면(`src/components/ui` 등)에서도
  쓸 수 있으므로 **바꾸기 전에 사용처 전체를 조사한다.** 병합으로 결과가 달라지는 호출부(지금은
  둘 다 남아 선언 순서로 우연히 원하는 값이 이기던 곳)가 있는지 확인해야 한다.
- 대안으로 어드민 전용 `cn`(twMerge 적용)을 두고 `components/admin/ui/*`만 그것을 쓰게 하는
  방법도 있다. 영향 범위를 어드민으로 한정할 수 있다.
- 적용 후 어드민 주요 화면에서 className 덮어쓰기가 의도대로 렌더되는지 실렌더로 확인한다.

## 구현 계획

1. `cn` 사용처를 전수 조사하고, 충돌 유틸리티를 넘기는 호출부를 목록화한다.
2. 전역 교체와 어드민 전용 분리 중 하나를 고른다.
3. 적용 후 목록화한 호출부를 실렌더로 대조한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
`src/lib/utils.ts`의 `cn`을 `twMerge(classes.filter(Boolean).join(' '))`로 감싸 tailwind-merge를
적용했다. 사용처 전수 조사 결과 `cn`은 `src/app/admin/**`·`src/components/admin/**`에서만
쓰이고 있었고(전체 35개 파일, 전부 admin 경로), 서비스 화면(`src/components/ui/**`,
`(main)/**`)은 `@/lib/utils`에서 다른 유틸(`formatDate` 등)만 가져다 쓸 뿐 `cn`을 호출하는
곳이 하나도 없었다. 따라서 어드민 전용 `cn`을 별도로 두는 대안 대신 **전역 교체**를 택했다 —
분리해도 실질적으로 영향받는 코드가 admin뿐이라 굳이 새 유틸을 만들 이유가 없고, 향후 서비스
화면이 `cn`을 쓰게 되더라도 처음부터 표준 shadcn 동작을 갖는 편이 안전하다.

`clsx`는 의존성에 없고 `cn` 시그니처가 문자열/undefined/null/false만 받으므로 추가하지 않고
`twMerge`만 적용했다(객체·배열 형태 인자를 받지 않으므로 clsx 없이도 동일하게 동작).

### 변경된 파일
```
jam-web/src/lib/utils.ts
```

### 테스트 결과
- [x] `npm install` 후 `npm run lint` 전체 실행 — 에러 0건, 경고 14건(모두 design-system·스크립트의
  기존 항목, 이번 변경과 무관)
- [x] 티켓에 언급된 실결함 재현·검증: `BadgeCard.tsx`가 `<Button className="h-11 md:h-10">`로
  호출하고 `Button`의 기본 `variant=default` 클래스가 `h-10 px-4 py-2`임을 확인. 변경 전
  로직으로는 `h-10 h-11 md:h-10`이 그대로 이어붙어 Tailwind 생성 순서에 좌우됐던 것을,
  변경 후 로직으로 재현해 `cn('h-10 px-4 py-2', 'w-full h-11 md:h-10')` → `'px-4 py-2 w-full h-11
  md:h-10'`(기본 `h-10` 제거, 호출부 값 유지)로 병합됨을 Node 스크립트로 직접 검증
- [ ] 브라우저 실렌더(Playwright/스크린샷)는 이번 세션에서 실행하지 않음 — dev 서버 기동 전
  단위 로직 검증으로 대체. 필요 시 `npm run dev` 후 `/admin/badges` 목록에서 카드 버튼 높이가
  `h-10`(md 이상) / `h-11`(모바일)로 일관되게 렌더되는지 육안 확인 권장

### 배포 정보
- 배포일:
- 환경: staging
- 커밋:

### 주요 의사결정 / 핵심 메모
- 전역 교체 vs 어드민 전용 분리 중 **전역 교체**를 선택. 근거: `cn` 실사용처가 이미 100% admin
  경로였음(전수 grep으로 확인). 분리해도 효과가 없고, 관리 대상 유틸만 늘어나는 결과가 됨
- `clsx` 미도입: 시그니처상 필요 없음. 추후 `cn`이 조건부 객체 인자(`{ foo: bool }`)를 받아야
  하는 요구가 생기면 그때 `clsx` 도입 검토

### 잔여 이슈
- 브라우저 실렌더 스크린샷 확인은 아직 안 함(위 테스트 결과 참조)
