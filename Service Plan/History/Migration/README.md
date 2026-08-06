# Migration — 신규 개선사항 이력

> 4카테고리 문서 체계의 **② 티켓** 카테고리 (2026-08-06 도입).
> 개선사항·버그 수정·인프라 변경 등 **모든 작업의 공식 기록**.

---

## 폴더 구성

### Ticket/ — 티켓 72개 (2026-07-15~2026-08-06)
**신규 개선사항 착수 시 가장 먼저 검색해야 할 폴더.**

파일명 규칙:
- `YYYYMMDD_NNN_[카테고리]_[제목].md`
- 예: `20260806_003_Infra_Google-로그인-화면-도메인-노출-검토.md`

카테고리:
- `Admin` — 어드민 패널 기능·UI
- `Service` — 배지엔진·드랍엔진·Strava 동기화 등 핵심 서비스 로직
- `Feature` — 사용자 대면 기능 단위
- `Content` — 배지·아이템·텍스트 컨텐츠
- `BadgeEngine` — 배지 엔진 전용
- `Infra` — DB 마이그레이션, 환경변수, 도메인, 배포 설정
- `UI` — UI/UX 개선
- `API` — API 라우트 변경·추가·삭제

---

## 신규 개선사항 접수 시

1. **먼저 이 폴더 검색** — 유사하거나 관련된 티켓이 이미 있는지 확인
   ```bash
   # 최신 티켓 20개
   ls -t Ticket/ | head -20
   
   # "드랍" 관련 티켓 검색
   grep -l "드랍" Ticket/*.md
   ```

2. **해당 티켓 읽기** — 다음을 파악:
   - 이미 완료된 작업인지 (재구현 방지)
   - 채택하지 않은 대안과 그 이유 (동일한 검토 반복 방지)
   - 잔여 이슈로 남긴 사항인지 (이어서 처리 가능)

3. **구현 후 티켓 CLOSED 처리** — 완료 기록 필수:
   - 구현 내용 요약
   - 변경된 파일 목록
   - 테스트 결과
   - 배포 정보
   - 주요 의사결정 / 핵심 대화 내용 요약
   - 잔여 이슈

> [[feedback_ticket_first]] — 이것이 신규 개선사항의 첫 번째 정보 소스. 
> 코드 탐색보다 우선.

---

## 이전 체계와의 관계

| 이전 체계 | 현재 체계 |
|----------|----------|
| `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` (자동 생성, 68개) | `Ticket/YYYYMMDD_NNN_[카테고리]_[제목].md` (정형화, 72개) |
| 시간별 타임스탬프 파일 | 날짜별 일련번호 파일 |
| Specs 루트에 분산 | Migration/Ticket 통합 |
| 내용 구조화 안 됨 | YAML 프론트매터 + 템플릿 구조 |

> [[feedback_operations_ticketized]] — SERVICE_OPERATIONS 68건을 모두 티켓화 완료 (2026-08-06).
> 이제 신규 작업은 무조건 이 Ticket 폴더에 기록.

---

## 티켓 생성 템플릿

```markdown
---
id: YYYYMMDD_NNN
category: [Admin|Service|Feature|Content|BadgeEngine|Infra|UI|API]
status: [OPEN|CLOSED]
created: YYYY-MM-DD
closed: YYYY-MM-DD (완료 시에만)
---

# [카테고리] 제목

## 배경 / 문제 정의

## 상세 요구사항

## 구현 계획

---

## 완료 기록 (status: CLOSED일 때만)

### 구현 내용 요약
...

### 변경된 파일
...

### 테스트 결과
- [x] 기능 동작 확인
...

### 배포 정보
- 배포일: YYYY-MM-DD
- 환경: production/staging/local
- 커밋: hash 또는 PR 링크

### 주요 의사결정 / 핵심 메모
...

### 잔여 이슈
...
```

---

## 관련 기억사항

- [[feedback_ticket_first]] — 코드·Specs 보다 먼저 기존 티켓 확인, 반복 작업·토큰 낭비 방지
- [[feedback_doc_4category_system]] — 4카테고리 문서 체계 마스터 규칙
- [[feedback_operations_ticketized]] — SERVICE_OPERATIONS 전수 티켓화 완료
