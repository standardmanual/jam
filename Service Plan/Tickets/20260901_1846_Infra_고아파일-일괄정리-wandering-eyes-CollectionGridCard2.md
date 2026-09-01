---
id: 20260901_1846
category: Infra
status: OPEN
created: 2026-09-01
closed:
---

# [Infra] 고아 파일 일괄 정리 — wandering-eyes.css / CollectionGridCard 2.tsx

## 배경 / 문제 정의
두 건의 죽은 파일이 여러 티켓에서 반복 발견됐으나 실제 삭제까지 이어지지 않았다:
- `jam-web/src/components/ui/wandering-eyes.css` — 티켓
  [20260824_017](20260824_017_Infra_떠돌이신화-기능-전면제거.md)에서 발견. DS의
  `WanderingEyesLoader.jsx`가 CSS를 `STATIC_CSS` 문자열로 인라인 주입하므로 이 파일은
  어디서도 import되지 않는 사문서다.
- `jam-web/src/components/ui/CollectionGridCard 2.tsx` — 티켓
  [20260820_017](20260820_017_bug_프로필컬렉션-등급태그-미노출.md)·
  [20260820_007](20260820_007_research_모듈러-서비스-전체연결-파이프라인-조사.md)에서
  중복 발견. `rarity` prop이 없는 구버전 중복 파일로, iCloud 동기화 충돌 산물로 추정된다
  (파일명의 공백+숫자 패턴이 전형적인 macOS 동기화 충돌 이름).

## 상세 요구사항

### 서비스/코드베이스 관점
- 두 파일 모두 실제로 어디서도 import되지 않음을 `grep`으로 재확인 후 삭제
- `.gitignore`에 이런 동기화 충돌 파일 패턴(` \d\.tsx$` 등)이 없다면 이번 건만 삭제하고
  재발 방지는 별도 판단(CLAUDE.md 규칙상 `.gitignore` 항목 추가는 원칙적으로 금지 —
  이번 티켓 범위에 포함하지 않는다)

## 구현 계획
- `grep -rn "CollectionGridCard 2\|wandering-eyes.css"` 로 참조 여부 최종 확인 후 `git rm`

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
해당 없음 (죽은 파일 삭제)

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
