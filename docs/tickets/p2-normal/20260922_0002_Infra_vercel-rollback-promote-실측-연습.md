---
id: "20260922_0002"
category: Infra
priority: P2
status: CLOSED
created: 2026-09-22
closed: 2026-09-22
parent: "20260921_2303"
---

# [Infra] `vercel rollback`·`vercel promote` 실측 연습: 프로덕션을 직전 배포로 되돌렸다가 복구해 절차와 소요 시간을 확인한다

## 핵심 요약

- 요구사항: `/jam-ship` 4단계 「롤백 계획」의 명령(`vercel rollback`, 복구용 `vercel promote`)은 `--help`와 Vercel 문서로 문법만 확인했고, 실제로 실행해 본 적이 없다. 장애 상황에서 처음 실행하지 않도록, 위험이 낮은 시점에 한 번 실행해서 절차·소요 시간·복구 방법을 확인한다.
- 구현 계획: 사용자 승인 아래 카리나가 세션에서 직접 실행한다. 직전 배포로 되돌린 뒤 `vercel rollback status`와 alias를 확인하고, 곧바로 `vercel promote`로 최신 배포를 복구해 자동 할당이 다시 켜졌는지 확인한다.
- 관련 파일: `.claude/skills/jam-ship/SKILL.md` 4단계·7단계
- 상위 티켓: 20260921_2303. 출처: 아현의 `[주의]` 알림. 경로: 카리나 직접 실행(프로덕션 조작이므로 사용자 승인 필수).

## 배경 / 문제 정의

롤백 계획은 "목표 복구 시간: 승인 후 5분 이내"를 목표로 적고 있으나 실측값이 아니다. 또 Vercel은 롤백을 실행한 뒤 프로덕션 도메인 자동 할당을 끄므로, 복구(`vercel promote`)까지 해 봐야 절차 전체가 검증된다.

## 상세 요구사항

### 서비스/코드베이스 관점

1. 실행 시점은 직전 배포와 현재 배포 사이에 DB 스키마 차이가 없는 때로 고른다. Supabase는 staging·프로덕션 공용 단일 DB라서, 직전 배포의 코드가 현재 스키마와 맞지 않으면 연습 중에 실제 오류가 발생한다.
2. 실행 순서: 직전 Ready 배포 URL 확인 → `vercel rollback <url>` → `vercel rollback status`와 `vercel inspect`로 alias 확인 → `curl https://j-a-m.app` 응답 확인 → `vercel promote <최신 배포 url>` → alias와 자동 할당 복구 확인.
3. 단계마다 걸린 시간을 기록하고, 요금제에 따른 제약(되돌릴 수 있는 배포의 범위)이 실제로 어떻게 나타나는지 적는다.
4. 결과에 따라 `/jam-ship` 4단계의 목표 복구 시간과 절차 문구를 실측값으로 고친다.

## 사전 확인과 결정 (카리나, 2026-09-22)

### 실행 대상을 프로덕션에서 스테이징(`jam-stage`)으로 바꾼다

사용자가 "이 세션에서 생성된 범위밖발견물 티켓을 모두 실행해"라고 지시했다. 그러나 이 티켓은 프로덕션 조작이고, 원문이 "실행 시점과 절차를 사용자에게 보고하고 승인받는다"고 정해 두었다. 사용자는 그 구체안(시점·명령·위험)을 아직 보지 못했다. 프로덕션은 실사용자가 있고, 코드 롤백은 공용 DB를 되돌리지 않아 옛 코드가 최근 마이그레이션(176~179)이 바꾼 DB를 만날 수 있다. 연습의 목적(명령·소요 시간·복구 방법 확인)은 같은 Vercel 기능을 쓰는 스테이징 프로젝트에서 같은 지식을 얻는다. 그래서 **이번 연습은 `jam-stage`에서 실행하고, 프로덕션 롤백 연습은 하지 않는다.** 스테이징은 실사용자가 없어 복구가 늦어져도 피해가 없다.

### 확인한 사실

- `jam-stage`의 현재 프로덕션 배포는 `jam-stage-p48dsfdyt`(`dpl_36s5kY8qWaSbQL6ciuFZXF3drtd2`)이고 `stage.j-a-m.app`이 가리킨다. 직전 Ready 배포는 `jam-stage-jbiuh70o8`이다. 그 밖의 최근 배포는 `ignoreCommand`로 취소(Canceled)돼 롤백 대상이 아니다.
- 도메인이 서빙 중인 배포 id는 페이지 HTML의 `?dpl=` 값으로 읽을 수 있다(티켓 20260922_0001). 롤백·복구 전후로 이 값이 바뀌는지 함께 재면, Vercel 화면 없이도 "반영됐는가"를 검증한다.
- 이 연습이 검증하지 못하는 것: 프로덕션 프로젝트 자체의 롤백 동작(요금제와 기능은 같은 팀이라 같다고 본다), 롤백 상태에서 새로 push한 배포가 공개되지 않는다는 Vercel 문서의 서술(스테이징에 불필요한 빌드를 만들지 않으려고 시험하지 않는다).

### 실행 순서 (각 단계의 소요 시간을 잰다)

1. 시작 상태 기록: `vercel inspect https://stage.j-a-m.app`의 배포 id, 페이지의 `dpl` 값.
2. `vercel rollback https://jam-stage-jbiuh70o8-standard-manual.vercel.app --scope standard-manual` — 명령 종료 시간, `vercel rollback status`, 페이지 `dpl`이 옛 배포 id로 바뀔 때까지의 시간.
3. 롤백 상태에서 `vercel inspect`의 alias와 자동 할당 상태를 기록한다.
4. `vercel promote https://jam-stage-p48dsfdyt-standard-manual.vercel.app --scope standard-manual` — 명령 종료 시간, 페이지 `dpl`이 원래 값으로 돌아올 때까지의 시간.
5. 끝 상태가 시작 상태와 같은지 확인한다. 다르면 즉시 복구하고 사유를 기록한다.

### 실행 시도와 대기 사유 (2026-09-22)

- 첫 명령 `vercel rollback https://jam-stage-jbiuh70o8-standard-manual.vercel.app --scope standard-manual`을 실행하려 했으나, Claude Code 자동 모드의 권한 분류기가 "공유 자원 변경"으로 **실행 전에 거부했다.** 명령은 실행되지 않았고, 읽기 전용 명령으로 확인한 결과 진행 중인 롤백이 없다(`vercel rollback status`). 사용자의 포괄 지시("모두 실행해")는 이 종류의 조작에 대한 승인으로 인정되지 않았다. 다른 도구로 우회하지 않는다.
- **대기 조건:** 사용자가 스테이징 롤백 연습을 명시적으로 허용한다(대화로 "허용", 또는 설정에 `vercel rollback`·`vercel promote` Bash 권한 규칙 추가).
- 시작 상태가 바뀌었다. 그 사이 `jam-stage`에 새 프로덕션 배포(`jam-stage-17bv3ohaf`, `dpl_B1EE3uHhHzTBjAkT7KnBE6x8AHeh`)가 생겼다. 원인은 빌드 로그로 확인했다: `vercel-ignore.sh`가 "직전 빌드 커밋 10ac65ba가 이 클론에 없음(얕은 클론) — 빌드합니다"라는 안전 규칙으로 문서 전용 push에서도 빌드한 것이다. 연습을 실제로 실행할 때는 그 시점의 직전 Ready 배포(지금은 `jam-stage-p48dsfdyt`)를 롤백 대상으로 다시 잡는다.
- 열린 질문: `vercel rollback`이 비대화형 세션에서 확인 프롬프트를 요구하는지(`--yes` 필요 여부). `--help`에는 `-y, --yes`와 `--timeout <TIME>`(기본 3분)이 있다. 입력을 닫고(`< /dev/null`) 실행해 확인한다. 필요하면 `/jam-ship` 4단계 명령에 `--yes`를 넣는다.
- `/jam-ship` 4단계의 "목표 복구 시간"은 실측 전이므로 "실측 전의 목표값" 표기를 유지한다.

## 구현 계획

1. 사용자 허용을 받아 카리나가 스테이징에서 실행한다(위 「실행 순서」).
2. 실행하고 결과를 이 티켓에 기록한다.
3. 필요하면 `/jam-ship` SKILL.md를 고친다(경미 수정).

## 완료 조건

- `jam-stage`에서 롤백과 복구를 한 번씩 실행했고, 단계별 소요 시간과 끝 상태(시작 상태와 동일)가 기록돼 있다.
- 복구 뒤 자동 할당이 다시 켜졌는지를 `vercel inspect`와 페이지의 `dpl` 값으로 확인했다. 새 배포 push로 확인하는 일은 다음 `/jam-ship` 때 프로덕션에서 자연스럽게 확인된다.
- `/jam-ship` 4단계의 문구가 실측 결과와 일치한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

사용자가 "스테이징 롤백 연습 허용"을 선택해(2026-09-22) 카리나가 `jam-stage`에서 롤백과 복구를 한 번씩 실행했다. 프로덕션은 건드리지 않았다. 처음 시도한 명령은 권한 분류기가 실행 전에 거부했고(포괄 지시만으로는 허용되지 않음), 사용자가 명시적으로 허용한 뒤에 실행했다.

**실행한 명령과 실측(모두 07:1x KST, 입력을 닫고 `--yes` 없이 실행):**

| 단계 | 결과 |
|---|---|
| 시작 상태 | 서빙 배포 `jam-stage-ctzo0ychm`(`dpl_62wZTFWQ49bFPEQAnXxMnTHLoBqi`), 직전 Ready 배포 `jam-stage-17bv3ohaf`(`dpl_B1EE3uHhHzTBjAkT7KnBE6x8AHeh`) |
| `vercel rollback https://jam-stage-17bv3ohaf-standard-manual.vercel.app --scope standard-manual` | 종료 코드 0, **5.1초**(npx 기동 약 0.7초 포함, 서버 표시 `[2s]`). 확인 프롬프트 없음 |
| 페이지가 서빙하는 배포 id(`?dpl=`)가 롤백 대상으로 바뀜 | 명령 종료 **1.0초** 뒤(명령 시작 6.1초 뒤) |
| 롤백 상태 확인 | `vercel rollback status`가 "rolled back to …17bv3ohaf"를 보고, `vercel inspect https://stage.j-a-m.app`의 대상이 `dpl_B1EE…`로 바뀜 |
| `vercel promote https://jam-stage-ctzo0ychm-standard-manual.vercel.app --scope standard-manual` | 종료 코드 0, **5.6초**(서버 표시 `[2s]`) |
| 페이지가 서빙하는 배포 id가 원래 값으로 복구됨 | 명령 종료 **1.2초** 뒤(명령 시작 6.8초 뒤) |
| 끝 상태 | 서빙 배포가 시작 상태와 같다(`dpl_62wZ…`) |

롤백과 복구 사이의 서빙 배포 전환은 페이지 HTML의 `?dpl=` 값(티켓 20260922_0001에서 발견)으로 Vercel 화면 없이 확인했다.

### 변경된 파일
```
.claude/skills/jam-ship/SKILL.md   (4단계 절차·복구·목표 복구 시간을 실측으로 갱신)
```

### 테스트 결과
- [x] `jam-stage`에서 롤백과 복구를 한 번씩 실행했고 단계별 소요 시간과 끝 상태(시작 상태와 동일)를 기록했다
- [x] 두 명령 모두 확인 프롬프트가 없어 비대화형 세션에서 `--yes` 없이 종료 코드 0으로 끝난다. 티켓의 열린 질문("`--yes` 필요 여부")이 해소됐다
- [x] `/jam-ship` 4단계 문구를 실측으로 갱신했다(목표 복구 시간 1분 이내, `--yes` 불필요, 롤백 뒤 서빙 배포 id 확인)
- [ ] **자동 할당 플래그의 복구는 직접 확인하지 못했다.** CLI(`vercel inspect`, `vercel rollback status`, `vercel project inspect`)와 Vercel MCP `get_project` 어디에도 이 값이 노출되지 않는다. 서빙 배포가 원래대로 돌아온 것만 확인했고, "승격이 자동 할당을 다시 켠다"는 Vercel 문서 서술에 기댄다

### 배포 정보
- 배포일: 2026-09-22
- 환경: `jam-stage`(스테이징 프로젝트)에서 실행. 저장소는 문서만 변경(빌드 없음)
- 커밋: `git log --grep 20260922_0002`

### 주요 의사결정 / 핵심 메모
- 실행 대상을 프로덕션에서 스테이징으로 바꾼 이유는 실사용자 영향 회피와, 구체안을 보지 못한 사용자의 포괄 지시로는 프로덕션 조작 승인이 성립하지 않는다는 판단이다. 결과적으로 자동 모드 권한 분류기도 같은 판단이었다.
- 프로덕션 프로젝트의 롤백 시간은 실측하지 않았다. 같은 팀의 같은 기능이라 같다고 본다.
- 이 연습이 검증하지 못한 것: 롤백 상태에서 새로 push한 배포가 공개되지 않는다는 Vercel 문서의 서술(스테이징에 불필요한 빌드를 만들지 않으려고 시험하지 않았다), 자동 할당 플래그의 복구.

### 잔여 이슈
- **다음 `jam-web` 변경이 스테이징에 배포될 때(또는 빌드 안전 규칙으로 빌드가 생길 때) 그 배포가 자동으로 공개되는지 확인한다.** 공개되지 않으면(`stage.j-a-m.app`의 `?dpl=` 값이 새 배포 id로 바뀌지 않으면) 자동 할당이 꺼진 상태이므로 `vercel promote <그 배포 URL>`로 다시 승격한다. 스테이징은 쿠키가 필요해 `deploy-gate served`가 실패하므로 확인은 `curl -sL -c jar -b jar https://stage.j-a-m.app/`로 한다(티켓 20260922_0653이 다룬다)
