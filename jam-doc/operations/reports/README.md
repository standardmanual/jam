# reports — 시점별 기록 (주간·월간·배포 리포트)

> 신설 폴더 (티켓 20260918_1152, 상위 티켓 20260918_1101 안건 3). 이전에는 주간 브리핑
> 양식(`.claude/skills/jam-work/references/forms/weekly-briefing-format.md`)만 있고 저장
> 위치가 없어 보고가 대화와 함께 사라졌다.

## 구조

```
reports/
  weekly/YYYY-Www.md    예: 2026-W38.md (ISO 주차)
  monthly/YYYY-MM.md     예: 2026-09.md
  deploy/YYYY-MM-DD.md  예: 2026-09-24.md (주간 배포 승인 루틴, 티켓 20260918_1650)
```

- 주간 리포트는 `weekly-briefing-format.md` 형식을 따른다.
- 배포 리포트는 매주 목요일 23:59 KST 실행 결과(배포 여부·승격 커밋 목록·Vercel 검증 결과)를
  남긴다. 절차는 `.claude/skills/jam-work/references/scheduled-jobs.md`의 "주간 배포 승인" 참고.
- 홈피드(투데이 카드) 다음 주 초안도 카즈하 브리핑 다음, 같은 주간 파일 안 "홈피드 초안" 절에 넣는다.
- 리포트에는 집계 수치만 남긴다. 닉네임·이메일·유저 ID 등 개인 식별 정보는 적지 않는다 —
  개별 사례는 "의심 계정 N건, 어드민 화면에서 확인 필요"로만 쓴다.

## 수명주기: 시점별 기록 (쌓기만 하고 덮어쓰지 않음)

- 매주·매월 **새 파일을 추가**한다. 기존 파일을 고쳐 쓰지 않는다.
- 분기 요약 후 `archive/`로 옮기지 않는다 — 요약본을 만들지 않는다는 공통 규칙과 충돌한다.
  오래된 리포트도 계속 이 폴더에 남는다.

## 읽기 상한

에이전트가 다음 리포트를 작성하거나 회고할 때 과거 기록을 참고하더라도, 기본으로는
**주간 최근 4주 · 월간 최근 3개월**만 읽는다. 그보다 오래된 기록이 필요하면 그때 찾아 읽는다.

## 현황판과의 관계

`DASHBOARD.md` 같은 저장 파일은 두지 않는다. 티켓 진행 현황판은 세션 시작 hook
(`scripts/ticket-dashboard.mjs`)이 매번 즉석 생성해 보여준다. 자세한 계약은
`.claude/skills/jam-work/references/dashboard-format.md` 참고.
