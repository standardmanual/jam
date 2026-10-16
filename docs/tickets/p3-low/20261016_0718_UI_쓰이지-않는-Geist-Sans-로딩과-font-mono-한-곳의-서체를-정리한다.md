---
id: "20261016_0718"
category: UI
priority: P3
status: OPEN
created: 2026-10-16
parent: "20261015_2132"
---

# [UI] 쓰이지 않는 Geist Sans 로딩과 font-mono 한 곳의 서체를 정리한다

## 핵심 요약

- 요구사항: `jam-web/src/app/layout.tsx:8`이 Geist Sans·Geist Mono를 `next/font`로 불러오지만 `font-sans` 사용처는 `src` 전체에서 0건이라 Geist Sans는 로딩만 된다(`globals.css:93`의 `--font-sans`). `src/app/(main)/inventory/[itemId]/InventoryItemHistorySheet.tsx:115`의 `font-mono`(서비스 1곳)는 Geist Mono이고 한글은 폴백 없이 브라우저 기본 서체로 그려진다.
- 구현 계획: Geist Sans 로딩을 제거하고, `font-mono` 한 곳은 서체 단일화에 맞춰 걷는다. 숫자 글리프 모양이 눈에 보이게 바뀌므로 걷기 전에 사용자에게 스크린샷으로 확인받는다.
- 근거: 티켓 20261015_2132 채원① 판정의 범위 밖 발견물.

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
- 환경: production
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
