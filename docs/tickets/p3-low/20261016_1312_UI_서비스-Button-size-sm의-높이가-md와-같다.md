---
id: "20261016_1312"
category: UI
priority: P3
status: OPEN
created: 2026-10-16
parent: "20261015_2133"
---

# [UI] 서비스 Button size sm의 높이가 md와 같다

## 핵심 요약

- 요구사항: `jam-web/src/components/ui/Button.tsx:74-86`에서 `size="sm"`의 세로 패딩(`py-[9px]`)이 `pillShape`의 `py-[13px]`에 CSS 우선순위에서 져서 sm이 md와 같은 52px이다(전·후 모두 같음). 주석(「sm」)과 동작이 다르고 `FollowButton`(`size="sm"`)이 이 영향을 받는다.
- 구현 계획: sm의 의도 높이를 정하고 `Button.tsx` 주석과 `buttonVariantPairs` 테스트에 못박는다. 간격 임의값(`py-[13px]`·`py-[9px]`·`py-[17px]`)은 같은 티켓에서 측정과 함께 정리한다.
- 근거: 티켓 20261015_2133 2회 민지·채원② 발견물.

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
