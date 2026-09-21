---
id: "20260921_2303"
category: Infra
priority: P1
status: IN_PROGRESS
created: 2026-09-21
parent: "20260921_2219"
---

# [Infra] 이식 ① SHIP 보강 — `/jam-ship`에 롤백 계획·배포 전 점검·배포 후 검증, `db` 유형에 확장→전환→축소 절차

## 핵심 요약

- 요구사항: agent-skills의 `shipping-and-launch`와 `deprecation-and-migration` 스킬을 JAM의 배포 관문(`/jam-ship`)과 `db` 유형 규칙에 이식한다. 스킬 원본 전문을 읽고, JAM 환경에 맞지 않는 항목만 제외하되 제외 사유를 문서에 남긴다(사용자 결정 2026-09-21: 각 스킬의 상세 특징·설정·기능을 최대한 이식한다).
- 구현 계획: `/jam-ship` SKILL.md에 「배포 전 점검표」「롤백 계획」「배포 후 검증」 절을 신설하고 보고 양식에 롤백 계획을 필수 항목으로 넣는다. `jam-developer.md`와 `/jam-work` SKILL.md의 `db` 유형에 확장→전환→축소(expand/contract) 순서와 되돌림 SQL 동반 규칙을 넣는다.
- 관련 파일: `.claude/skills/jam-ship/SKILL.md`, `.claude/agents/jam-developer.md`(Hard rules 3·`db` 절), `.claude/skills/jam-work/SKILL.md`(0.2 분기표 `db` 행), `docs/agents/team-operations.md` §3 「머지와 배포의 경계」. 원본 스킬: `~/.claude/plugins/cache/addy-agent-skills/agent-skills/0.6.10/skills/shipping-and-launch/SKILL.md`, `~/.claude/plugins/cache/addy-agent-skills/agent-skills/0.6.10/skills/deprecation-and-migration/SKILL.md`, `~/.claude/plugins/cache/addy-agent-skills/agent-skills/0.6.10/skills/../references/definition-of-done.md` (이 PC 설치 경로. 없으면 https://github.com/addyosmani/agent-skills v0.6.10)
- 상위 티켓: 20260921_2219(이식 분석). 경로: ③ 표준(infra, 채원 없이 아현 → 민지)

## 배경 / 문제 정의

이식 분석(20260921_2219 §1.3)에서 SHIP 단계가 JAM에 가장 비어 있는 곳으로 확인됐다. `/jam-ship`은 staging 확인(사용자) → main 승격 → Vercel Ready·alias 확인까지만 하고, 롤백 계획·배포 전 기계 점검·배포 후 검증이 없다. 또 Supabase는 staging·프로덕션 공용 단일 DB라 마이그레이션 되돌림이 JAM에서 가장 위험한 지점인데, 확장→전환→축소 같은 안전 절차가 규칙으로 없다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. **배포 전 점검표** (`shipping-and-launch` §The Pre-Launch Checklist 기준): 코드 품질·보안·성능·접근성·인프라·문서 여섯 묶음을 JAM 항목으로 옮긴다. 각 항목은 확인 명령 또는 확인 방법을 동반한다(예: 테스트 = `scripts/verify.sh`, 비밀값 = `git grep` 패턴, 마이그레이션 = `jam-web/supabase/migrations/` 신규 파일 여부와 적용 기록). JAM에 해당 없는 항목(예: 번들 예산이 정의되지 않은 항목)은 "해당 없음"이 아니라 「제외 목록」에 사유와 함께 적는다.
2. **롤백 계획** (§Rollback Strategy 양식): 트리거 조건 · 절차 · 목표 복구 시간 · DB 고려. JAM 값으로 채운다: 코드는 Vercel에서 직전 배포를 alias로 되돌리는 명령, DB는 해당 마이그레이션의 되돌림 SQL 존재 여부. 배포 보고 양식에 롤백 계획이 없으면 배포를 진행하지 않는다.
3. **배포 후 검증** (§Post-Launch Verification): 배포 직후 카리나가 확인할 항목(스테이징 자동 로그인 경로로 핵심 화면 응답, `engine_decision_log` 오류 증가 여부, Strava 동기화 실패 건수)과, 주간 브리핑에서 카즈하가 이어서 볼 항목을 나눈다.
4. **단계 배포·오류 예산** (§Staged Rollout·§Error Budget): Vercel 단일 배포 구조라 단계 배포는 제외하되 사유를 남긴다. 오류 예산은 카즈하의 정상 범위(07_루프보완 #7)가 정해진 뒤 도입하도록 후속 항목으로 적는다.
5. **`db` 유형 규칙** (`deprecation-and-migration` expand/contract): 컬럼·함수 변경은 ① 새 것을 추가(확장) → ② 코드가 새 것을 쓰게 전환 → ③ 옛 것을 제거(축소)의 세 마이그레이션으로 나눈다. 한 마이그레이션에서 삭제와 추가를 함께 하지 않는다. 모든 마이그레이션 파일에 되돌림 SQL(주석 블록 또는 `_down.sql`)을 동반한다. 가드레일 패턴 2·14와 연결한다.
6. **완료 기준(DoD)**: `definition-of-done.md`의 Ship-readiness 항목(보안 검토·관측·롤백 경로·사람 승인)을 `/jam-ship` 절차의 마지막 관문으로 넣는다.
7. 문서에는 "무엇을 하는가"만 적고 이식 출처는 절 끝에 한 줄로 남긴다. 원본 스킬 전문을 복사해 넣지 않는다.
8. **관련 문서 전수 갱신** (사용자 추가 지시, 2026-09-21 착수 직후): 구현이 게이트를 통과하면 `docs/`와 `jam-doc/` 안에서 배포 절차·롤백·DB 마이그레이션 규칙을 서술하는 현재 상태 문서를 새 내용에 맞춘다.
   - 담당: 카리나(`docs` 유형으로 직접 처리). 시점은 review 브랜치를 staging에 머지한 뒤, push하기 전이다. 아현의 구현 범위(1~7번)에는 넣지 않는다.
   - 방식: 같은 사실을 옮겨 적지 않는다. 절차의 단일 원천은 `/jam-ship` SKILL.md와 `jam-developer.md`로 두고, 다른 문서는 낡은 서술을 고치거나 단일 원천을 가리키게 바꾼다(`CLAUDE.md` 규칙 5).
   - 확인 후보(2026-09-21 `grep`으로 추린 목록): `docs/agents/team-operations.md`, `docs/agents/orchestrator.md`, `docs/agents/issue-tracker.md`, `docs/specs/DEV_PROCESS_GUARDRAILS.md`, `docs/specs/SERVICE_OPERATIONS.md`, `docs/specs/prd/04_PROJECT_SPEC.md`, `docs/specs/prd/02_DATA_MODEL.md`, `docs/specs/prd/README.md`, `jam-doc/planning/business-plan/02 JAM! 서비스 플랜.md`, `CLAUDE.md`, `.claude/skills/jam-work/references/`의 `handling-rules.md`·`scheduled-jobs.md`·`team-composition.md`·`forms/weekly-briefing-format.md`·`forms/implementation-summary-format.md`.
   - 제외: `docs/tickets/`(작업 이력), `jam-doc/archive/`(읽기 전용), `jam-doc/operations/reports/`(시점별 기록), `docs/agents/workflow/`(티켓 20260921_2311에서 기록으로 동결할 예정인 설계 원본).

## 구현 계획

1. 원본 스킬 두 개와 DoD 참조를 전문으로 읽고, 항목별로 「이식 / 조정 / 제외(사유)」 표를 먼저 만든다.
2. `/jam-ship` SKILL.md를 고치고 보고 양식을 갱신한다.
3. `jam-developer.md`·`jam-work/SKILL.md`의 `db` 규칙을 고친다.
4. `team-operations.md` §3의 배포 경계 서술이 바뀌면 함께 고친다(생성 구간이면 생성기 실행).
5. `scripts/verify.sh` 통과, `doc-check`·`check-contract` 통과.

## 완료 조건

- `/jam-ship` SKILL.md에 「배포 전 점검표」「롤백 계획」「배포 후 검증」 절이 있고, 점검표의 모든 항목에 확인 명령 또는 방법이 붙어 있다.
- 배포 보고 양식에 롤백 계획(트리거·절차·목표 시간·DB)이 필수 항목으로 있고, 롤백 계획이 비어 있으면 배포하지 않는다는 문장이 있다.
- `jam-developer.md`에 `db` 유형의 확장→전환→축소 규칙과 되돌림 SQL 동반 규칙이 있고, `/jam-work` 분기표 `db` 행이 그 규칙을 가리킨다.
- 원본 스킬 항목 중 제외한 것이 「제외 목록」에 사유와 함께 적혀 있다.
- `scripts/verify.sh`가 통과한다.
- 요구사항 8번의 확인 후보를 전부 확인했고, 고친 문서와 고칠 필요가 없던 문서가 완료 기록에 나뉘어 적혀 있다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

세 갈래로 진행했다. 아현의 구현(커밋 90903610)은 민지의 1차 게이트에서 WARN으로 통과했고, 카리나의 보완과 문서 갱신(커밋 6766c1b5·26e0fdac·7e8cc86e)은 민지의 2차 게이트에서 PASS로 통과했다. 2차 게이트 뒤에 두 건을 더 보완했다(아래 3번의 마지막 두 항목).

1. **`/jam-ship` 재편 (아현)**: 5단계였던 절차를 9단계로 나눴다. 「3. 배포 전 점검표」(코드 품질·보안·성능·접근성·인프라·문서, 항목마다 확인 명령이나 방법 동반), 「4. 롤백 계획」(트리거·절차·목표 복구 시간·DB 고려. 비어 있으면 main 승격으로 진행하지 않는다), 「5. 완료 기준」(보안 검토·관측·롤백 경로·사람 승인), 「8. 배포 후 검증」(카리나가 배포 직후 확인하는 항목과 카즈하의 ① 실행 점검이 이어서 보는 항목의 경계)을 신설했고, 「9. 보고」에 롤백 계획 요약을 필수 항목으로 넣었다.
2. **`db` 유형 규칙 (아현)**: `jam-developer.md` Hard rule 3에 확장→전환→축소 분리 규칙과 되돌림 SQL 동반 규칙을 넣고 가드레일 패턴 2·14와 연결했다. `/jam-work` 분기표의 `db` 행은 이 규칙을 단일 원천으로 가리킨다.
3. **카리나 보완**:
   - 롤백 절차의 "즉시 되돌린다"가 「하지 않는 것」의 "사용자 승인 없는 재배포·롤백"과 모순이어서, 승인을 받은 뒤 실행하는 것으로 통일했다. `scheduled-jobs.md` 「안전장치」 표의 서술과도 일치한다.
   - 트리거 조건에서 기준선이 없는 "에러율 2배"를 빼고, 7·8단계에서 확인할 수 있는 조건으로 바꿨다.
   - 「롤백 이후의 복구」를 추가했다. Vercel은 롤백 뒤에 프로덕션 도메인 자동 할당을 끄므로, 다음 배포는 `vercel promote`로 공개해야 한다(Vercel 문서 「Performing an Instant Rollback」으로 확인).
   - 새 API 라우트의 인증·인가 점검 항목에 확인 명령을 붙였다(민지 1차의 범위 밖 발견물). 2차 게이트의 지적에 따라 패턴에 `ADMIN_SECRET`을 더했고, 전체 117개 라우트 중 패턴에 걸리지 않는 것은 3개(`dev-login`, `strava/callback`, `username/check`)임을 확인했다.
   - 스테이징 주소를 정정했다. `jam-stage.vercel.app`은 404로 응답하고 실제 주소는 `stage.j-a-m.app`이다(2026-09-22 `curl` 확인). 스킬·에이전트 정의 3종·스크립트 주석·pre-push 안내문을 고치고 `contract.json`에 낡은 문구 검사를 추가했다.
   - 「주간 무인 배포와의 관계」 절을 신설했다(민지 1차의 WARN 사유 대응).
   - 원본의 이중 쓰기 → 백필 → 읽기 전환 순서와 대형 인덱스 생성 규칙(`CREATE INDEX CONCURRENTLY`)이 아현의 규칙에서 빠져 있어 `jam-developer.md` Hard rule 3에 보완했다(2차 게이트 이후).
4. **요구사항 8번 문서 갱신 (카리나)**: 아래 「확인 후보 전수 결과」 참고.

#### 이식 / 조정 / 제외

| 원본 | 처리 | JAM 위치·사유 |
|---|---|---|
| `shipping-and-launch` §The Pre-Launch Checklist | 이식(조정) | `/jam-ship` 3단계. JAM에 장치가 없는 7건(번들 예산, Core Web Vitals 게이트, 전체 페이지 접근성 자동 검사, 헬스체크 엔드포인트, CDN 설정, 캐싱 설정, changelog)은 같은 절의 「제외 목록」에 사유와 함께 있다 |
| §Rollback Strategy | 이식(조정) | 4단계. 승인 후 실행, 롤백 이후 복구 절차를 JAM 값으로 채웠다 |
| §Post-Launch Verification | 이식(조정) | 8단계. 프로덕션은 구글 로그인이 필수라서 스테이징 자동 로그인 경로로 대신 확인한다 |
| `definition-of-done.md` Ship-readiness | 이식 | 5단계 |
| §Feature Flag Strategy·§Staged Rollout | 제외 | Vercel 프로덕션 alias가 하나뿐이라 트래픽을 나눠 배포할 수 없다(「하지 않는 것」) |
| §Error Budget Release Gate | 보류 | 에러율 기준선이 없다. 카즈하의 지표 정상 범위(`loop-improvements.md` 항목 7)가 정해진 뒤 도입한다 |
| §Monitoring and Observability(지표 트리·에러 리포팅 코드) | 이번 범위 밖 | 상위 티켓 20260921_2219의 이식 순서에서 뒤 단계로 분리돼 있다. 배포 직후 부분만 8단계에 반영했다 |
| §Common Rationalizations·§Red Flags | 제외 | 설득용 서술이라 절차 문서에 넣지 않았다(요구사항 7번). 핵심은 규칙으로 흡수했다: 롤백 계획 없는 배포 금지, 추가와 삭제의 분리, 되돌림 SQL 선작성 |
| §Verification의 "지연 시간 정상"·"팀 공지" | 미대응 | JAM 절차에 대응하는 항목이 없다. 잔여 이슈 참고 |
| `deprecation-and-migration` §Database Schema Migrations (Expand/Contract) | 이식 | `jam-developer.md` Hard rule 3. 이중 쓰기·백필·대형 인덱스 규칙 포함 |
| 같은 스킬의 나머지 절(폐기 결정 기준, 공지·이전 절차, Strangler·Adapter 패턴, 좀비 코드) | 이번 범위 밖 | 상위 티켓의 이식 지도에서 채택 대상은 Expand/Contract뿐이었다 |

#### 요구사항 8번: 확인 후보 전수 결과

고친 문서:
- `.claude/skills/jam-work/references/scheduled-jobs.md`: 무인 배포가 `/jam-ship` 단계를 번호가 아니라 이름으로 가리키게 했고, 새 관문이 무인 경로에 아직 적용되지 않음을 명시했다.
- `docs/specs/prd/04_PROJECT_SPEC.md`: 「배포 방법」의 `vercel --prod` 안내를 `/jam-ship` 절차로 교체했다. DB 규칙의 낡은 번호(080)를 지우고 확장→전환→축소 규칙을 연결했다.
- `docs/agents/orchestrator.md`: DB 실행 전에 되돌림 SQL을 확인하는 항목을 넣고, 배포 확인 절차를 `/jam-ship` 7·8단계로 연결했다.
- `docs/specs/DEV_PROCESS_GUARDRAILS.md`: 패턴 2·14에서 `jam-developer.md` Hard rule 3으로 연결했다.
- `CLAUDE.md`: 규칙 3의 배포 절차 요약을 갱신하고, 규칙 6에 DB 안전 절차를 가리키는 한 줄을 넣었다.
- `.claude/agents/jam-reviewer.md`: 점검표 8번이 되돌림 SQL 동반과 확장→전환→축소 분리를 확인한다.
- `docs/agents/team-operations.md`: 알려진 빈틈 ⑥(배포 안전 관문이 사람이 있는 경로에만 적용)을 추가했다. §3 「머지와 배포의 경계」 표는 권한 경계만 다루므로 고치지 않았다(아현·민지 판단 일치).

고칠 필요가 없던 문서(민지 2차 게이트가 대조 확인):
- `docs/agents/issue-tracker.md`(`/jam-ship`을 이름으로만 가리킨다), `docs/specs/SERVICE_OPERATIONS.md`(기능별 롤백 서술뿐이다), `docs/specs/prd/02_DATA_MODEL.md`(테이블별 마이그레이션 번호 기록뿐이다), `docs/specs/prd/README.md`(해당 서술 없음), `jam-doc/planning/business-plan/02 JAM! 서비스 플랜.md`(서비스 이력 서술뿐이다), `.claude/skills/jam-work/references/`의 `handling-rules.md`(스테이징 주소가 이미 정확하다)·`team-composition.md`(스킬 이름 목록뿐이다)·`forms/weekly-briefing-format.md`(지표 서술뿐이다)·`forms/implementation-summary-format.md`(해당 서술 없음).

### 변경된 파일
```
.claude/skills/jam-ship/SKILL.md
.claude/agents/jam-developer.md
.claude/agents/jam-reviewer.md
.claude/agents/jam-ops.md
.claude/skills/jam-work/SKILL.md
.claude/skills/jam-work/references/scheduled-jobs.md
.githooks/pre-push
scripts/admin-api-read.mjs
CLAUDE.md
docs/agents/contract.json
docs/agents/orchestrator.md
docs/agents/team-operations.md
docs/specs/DEV_PROCESS_GUARDRAILS.md
docs/specs/prd/04_PROJECT_SPEC.md
docs/tickets/ (후속 티켓 3건: 20260922_0001·0002·0003)
```

### 테스트 결과
- [x] `scripts/verify.sh` 통과: 아현의 워크트리, 민지의 1차 재실행, 카리나의 격리 워크트리에서 각각 확인했다 (lint · typecheck · test · ds:check · slop · scripts-test · contract · team-doc)
- [x] 민지 1차 게이트 WARN(재작업 없음), 2차 게이트(보완분 `90903610..7e8cc86e`) PASS
- [x] 새 라우트 추출 명령(`:(glob)` 경로 지정)과 인증 확인 `grep`을 실제 저장소에서 실행해 동작을 확인했다
- [x] `contract.json`의 낡은 문구 검사를 역검증했다: 옛 주소를 한 곳에 되살리면 검사가 막고, 복원하면 통과한다
- [x] Vercel CLI 문법(`rollback`·`promote`·`env ls`·`inspect --logs`)은 `--help`로 확인했다. 실제 롤백은 실행하지 않았다

### 배포 정보
- 배포일: 2026-09-22
- 환경: staging (빌드 없음. `jam-web/` 변경 0줄)
- 커밋: 90903610(아현), 이어서 카리나의 후속 티켓 생성·`/jam-ship` 보완·문서 갱신·인증 패턴 보완·완료 기록 커밋 (해시는 `git log --grep 20260921_2303`으로 조회한다)

### 워크플로 수치
- Workflow(아현 → 민지 1차): 에이전트 2명, 전체 341,102토큰, 2,542초(약 42분), 도구 호출 130회. 출력 토큰은 jam-developer 117,006, gate 69,300
- 민지 2차 게이트(카리나가 직접 호출): 143,532토큰, 693초(약 12분), 도구 호출 43회

### 주요 의사결정 / 핵심 메모
- 롤백은 승인 후 실행으로 통일했다. 무인 경로의 "롤백하지 않는다"(티켓 20260918_1650에서 사용자가 승인한 정책)와 같은 원칙이다.
- 주간 무인 배포에 새 관문을 적용하는 일은 이 티켓에서 하지 않고 후속 티켓으로 분리했다. 루틴 프롬프트가 저장소 밖에 있고, 무인 프로덕션 배포의 동작을 바꾸는 일이라 별도의 사용자 승인이 필요하기 때문이다. 무인 경로의 동작은 이 티켓 이전과 같다.
- 요구사항 8번에서 `docs/agents/workflow/`는 제외했다. 티켓 20260921_2311이 그 폴더를 기록으로 동결할 예정이다.
- 아현은 `plan_only` 기준(100줄 초과)에 해당하는 분량이었는데도 계획 반환 없이 구현을 끝냈다. 결과가 게이트를 통과했으므로 그대로 받았다.

### 잔여 이슈
- 20260922_0001 (P1): 주간 무인 배포 경로에 새 관문을 어디까지 적용할지 정하고 루틴 프롬프트를 고친다. 첫 무인 실행(2026-09-24)에는 새 관문이 적용되지 않는다.
- 20260922_0002 (P2): `vercel rollback`·`vercel promote` 실측 연습. 목표 복구 시간 "승인 후 5분 이내"는 실측 전의 목표값이다.
- 20260922_0003 (P3): 티켓 완료 조건에 구현 범위와 후속 범위를 나눠 적는 양식 보완.
- 오류 예산 게이트는 카즈하의 지표 정상 범위가 정해진 뒤에 도입한다.
- 원본 §Verification의 "지연 시간 정상"과 "팀 공지"에 대응하는 JAM 항목이 없다. 지연 시간은 측정 기준을 정한 뒤에, 공지는 Slack 배포 리포트로 대신할지 정한 뒤에 다룬다.
