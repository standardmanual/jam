# JAM! Service Plan — 이력 자료 (History)

> 4카테고리 문서 체계(① PRD ② 티켓 ③ 컨텐츠 ④ 배지엔진) 재정리 후 작성 (2026-08-06).
> 이 폴더는 과거 버전 스냅샷과 운영 기록을 아카이브로 보관합니다.

---

## 폴더 구성

### Migration/Ticket/ — ② 티켓 카테고리 (신규 개선사항 이력)
- **용도**: 개선사항·버그 수정·인프라 변경 등 **실제 작업 이력**
- **파일명**: `YYYYMMDD_NNN_[카테고리]_[제목].md`
- **범위**: 2026-07-15 ~ 현재 (72개, 계속 누적)
- **언제 보나**: 유사 작업이 이전에 있었는지 확인할 때, 신규 개선사항 착수 시 [[feedback_ticket_first]]
- **우선순위**: 이 폴더를 **가장 먼저 검색** — 코드/Specs 보다 먼저 확인

### Snapshots/ — 과거 Phase별 PRD 문서 스냅샷 (참고용 아카이브)
- **용도**: 각 Phase 시점(Phase 7~17)에서의 `01_PRD.md`, `02_DATA_MODEL.md`, `03_PHASES.md`, `04_PROJECT_SPEC.md` 4종 버전 스냅샷
- **구조**:
  - `Snapshots/Phase7/` — Phase 7 시점의 4종 문서
  - `Snapshots/Phase8/` — Phase 8 시점의 4종 문서
  - ... (Phase 9~17, Design_Phase01)
- **언제 보나**: "Phase X 시점에는 뭐가 계획돼 있었나?" 궁금할 때만 — 현재 최신 스펙은 아님
- **주의**: Phase 로드맵 번호와 실제 개발 순서가 다르다는 점 반드시 확인 — [[feedback_prd_needs_content_update]]

### Operations/ — 운영 기록 아카이브 (폐기된 체계)
- **용도**: 과거 `SERVICE_OPERATIONS_YYYYMMDD_HHMM.md` 파일들 (2026-07-15 전후) — 자동 생성 크론 기반 타임스탬프 방식
- **상태**: **폐기됨** — 더 이상 신규 SERVICE_OPERATIONS 생성 금지. [[feedback_operations_ticketized]]
- **현황**: 이 폴더의 54건을 모두 `Migration/Ticket/`으로 티켓화 완료 (2026-08-06)
- **용도 변경**: 신규 작업 이력은 `Migration/Ticket/`을 사용할 것

---

## 신규 개선사항 접수 시 이 폴더를 활용하는 방법

1. **먼저 `Migration/Ticket/` 검색** — 유사 작업이 이전에 있었는지 확인
   ```bash
   # 최신 티켓 확인
   ls -t Migration/Ticket/ | head -20
   
   # 특정 카테고리 검색 (예: Service)
   ls Migration/Ticket/ | grep "_Service_"
   ```

2. **필요하면 `Snapshots/` 참고** — "그 당시 계획은 뭐였나" 궁금할 때만
   - 절대 현재 스펙으로 신뢰하지 말 것

3. **`Operations/` 절대 새 파일 추가 금지** — 이곳은 아카이브만

---

## 관련 기억사항

- [[feedback_ticket_first]] — 코드·Specs 보다 먼저 기존 티켓 확인
- [[feedback_operations_ticketized]] — SERVICE_OPERATIONS 68건을 모두 티켓화 완료, 신규 생성 폐기
- [[feedback_doc_4category_system]] — 4카테고리 체계 마스터 규칙
- [[feedback_prd_needs_content_update]] — Snapshots의 Phase 로드맵과 실제 개발 순서의 불일치 사항

---

## 2026-08-06 정리 요약

| 항목 | 이전 | 현재 |
|------|------|------|
| Phase 스냅샷 | 루트에 평평히 흩어진 20개 파일 | `Snapshots/Phase7~17/` 하위 폴더로 정렬 |
| 운영 기록 | `Operations/` (54개) + `Specs/` (14개) 분산 | `Operations/` (69개) 통합, 티켓화 완료 |
| 티켓 시스템 | 없음 | `Migration/Ticket/` (72개, 계속 누적) |
| 신규 SERVICE_OPERATIONS | 자동 생성 (시간별 크론) | **폐기** — 티켓으로 대체 |

---

## 각 Snapshots 폴더의 내용물 (샘플)

```
Snapshots/
├── Phase7/       Phase 1~7 최초 구축 완료 시점 (2026-07-09)
├── Phase8/       (로드맵상 "아이템북 완성 루프" — 실제와 불일치)
├── Phase9/       ...
├── ...
├── Phase16/      (로드맵상 "다이나믹 미션 시스템" — 실제와 불일치)
├── Phase17/      (로드맵상 "신화 아이템 떠돌이" — 실제와 불일치)
└── Design/       (초기 디자인 페이즈 문서)
```

> **⚠️ 중요**: Snapshots의 Phase 번호는 2026-07-09~10에 작성된 계획이며, 
> 실제 개발은 이와 다르게 진행됐습니다. 상세는 
> [../Specs/PRD/03_PHASES.md](../Specs/PRD/03_PHASES.md) 참고.
