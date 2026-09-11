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

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: staging
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
