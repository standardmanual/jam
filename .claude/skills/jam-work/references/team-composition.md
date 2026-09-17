# 에이전트 팀 구성

> 설계 원본(아이클라우드 `JAM-WORK/00_팀구성.md`)을 프로젝트 안으로 이관 · 정리했다
> (티켓 20260918_0423). 에이전트 정의의 **진실은 `.claude/agents/*.md`(영어)**이고,
> 이 문서는 팀 구조를 빠르게 훑어보기 위한 한국어 개요다.

평소 개발 흐름에 관여하는 건 **카리나·아현·민지·채원 넷**이다. 나머지는 상황이 있을 때만 부른다.

| 이름 | 역할 | 정의 파일 | 모델 |
| --- | --- | --- | --- |
| 카리나 | 오케스트레이터 (메인 대화, 정식 에이전트 아님) | — | Sonnet |
| 아현 | 개발 | `jam-developer` | Sonnet |
| 민지 | 판정 리뷰 (게이트) | `conservative-reviewer` | Sonnet |
| 채원 | 디자인 | `jam-designer` | 모드별 (Sonnet/Haiku) |
| 혜린 | PM (기획·타당성·리스크) | `jam-pm` | Sonnet (조사 Haiku) |
| 윈터 | 세계관 | `jam-tribe` | 모드별 (Opus/Sonnet/Haiku) |
| 윤진 | 마케팅 | `jam-marketer` | Sonnet (수집 Haiku) |
| 카즈하 | 운영·리스크 | `jam-ops` | 모드별 (Haiku/Sonnet) |
| 하니 | 문서 체계 | `jam-guide` | Haiku (개편 제안 Sonnet) |

**삭제:** `progressive-reviewer` — 개선 리뷰 단계를 없애고 그 역할을 아현·민지·채원으로 분산했다.

## 스킬

| 구분 | 스킬 |
| --- | --- |
| 기존 유지 | `/jam-work` `/jam-docs` `/jam-design` `/jam-ds` `/jam-img` `/jam-ship` `/jam-sync` |
| 신규 | `/jam-plan`(혜린) `/jam-story`(윈터·윤진 협업) |

## 개발 파이프라인 (`ui`·`ds` 유형)

```
채원① 사전 판정 → 아현 구현 → 민지 판정 → [채원② 사후 리뷰 · 한국어 리뷰 동시]
```

- 15줄 미만이거나 이전 판정이 있으면 채원①·②를 생략한다.
- 경미 수정(파일 1~2개, 10줄 이내)은 카리나가 직접 처리한다.

## 참고

같은 폴더의 다른 참조 문서:
- `common-rules.md` — 팀 공통 규칙 26개, 슬롭 제거 기준, 티켓 생성 권한
- `automation-list.md` — 자동화 1차·2차, 어드민 영역별 담당
- `loop-improvements.md` — 완료 조건·결과 기록·상위 티켓 등 루프 보완 사항
- `handling-rules.md` — 공용 처리 규칙표 (에이전트별 섹션)
