/**
 * 카드·미션 문구의 카피 규칙 중 «문자열만 보고 판정할 수 있는 것»(티켓 20261103_1236, 상위 20261103_1152).
 *
 * 규칙의 사람용 정본은 `docs/service/writing/UX_WRITING_GUIDELINE.md` §2.6이고, 기계가 거르는 규칙은 이 파일의
 * `COPY_RULES`가 단일 원천이다. 문맥 판단이 필요한 규칙(기한 암시, 절기 표현, 문장 모양 반복, 끝맺음 쏠림, 같은 과제 중복)은
 * 오탐이 늘어 우회되므로 넣지 않는다.
 *
 * 홈피드 카드(`validateCard`)와 미션(`validateMission`)이 같은 함수를 부르므로 윤진 묶음과 어드민 예약 등록이 모두 막힌다.
 * 순수 함수 파일이다 — 이 폴더 규칙대로 `node:` 모듈과 `scripts/` 아래 파일을 가져오지 않는다.
 */

export type CopyField = 'title' | 'subtitle' | 'description'
/** 문구를 쓰는 대상 — 카드(`card.`)와 미션(`mission.`)은 같은 규칙 목록을 쓰지만 일부 규칙은 한쪽에만 적용한다. */
export type CopySubject = 'card' | 'mission'

export interface CopyRule {
  /** 규칙 식별자(시험·로그용). */
  id: string
  /** 규칙을 적용하는 칸. 없으면 제목·부제·설명 모두. */
  fields?: readonly CopyField[]
  /** 규칙을 적용하는 대상. 없으면 카드·미션 모두. */
  subjects?: readonly CopySubject[]
  /** 문구가 규칙에 걸리는지. */
  pattern: RegExp
  /** 걸렸을 때 어떻게 고칠지 알리는 해요체 안내(칸 이름은 앞에 붙는다). */
  message: string
}

/** 쓰지 않는 말 규칙 하나를 만든다 — 같은 안내 문장 틀을 쓴다. */
function bannedTerm(id: string, pattern: RegExp, term: string, instead: string): CopyRule {
  return { id, pattern, message: `「${term}」은 카피에 쓰지 않아요. ${instead}` }
}

export const COPY_RULES: readonly CopyRule[] = [
  {
    id: 'recommend-seyo',
    // 「해 주세요」(앞이 `주`)는 요청 문장이라 제외한다.
    pattern: /(?<!주)세요/,
    message: '권유 자리에 「~하세요」를 쓰지 않아요. 같이 해 보자는 말투로 「~해 봐요」라고 써 주세요(요청은 「~해 주세요」).',
  },
  {
    id: 'exclamation',
    fields: ['description'],
    pattern: /[!！]/,
    message: '설명에는 느낌표를 쓰지 않아요. 권유·안내 문장은 느낌표 없이 단어로 온도를 내 주세요.',
  },
  {
    id: 'noun-ending',
    fields: ['description'],
    // 문장 끝의 「획득」·「보상」 — 뒤에 공백·`!`·`.`만 붙은 것까지. 중간의 「획득한 배지」는 걸리지 않는다.
    pattern: /(?:획득|보상)(?:\s*[!！.]+(?=\s|$)|\s*$)/,
    message: '문장을 「획득」·「보상」으로 끊지 않아요. 「아이템 배지를 획득해요」처럼 문장으로 맺어 주세요.',
  },
  {
    id: 'mission-description-reward',
    subjects: ['mission'],
    fields: ['description'],
    // 보상 수량(`10포인트`·`100잼`)과 「보상」이라는 말. 보상은 화면이 따로 보여 주므로 미션 설명에서 말하지 않는다(티켓 20261104_2148).
    pattern: /\d[\d,]*\s*(?:포인트|잼)|보상/,
    message: '미션 설명에는 보상을 쓰지 않아요. 보상은 화면에 따로 보여 줘요. 미션이 주는 재미를 유저 입장의 장면으로 써 주세요.',
  },
  {
    id: 'title-condition-summary',
    fields: ['title'],
    // 제목이 «조건을 요약한 말»인 세 모양: (가) 행동 이름 + 수량, (나) 이동 수단 + 거리·시간, (다) 고정 용어로 끝나는 명사구.
    // 부제·설명은 조건을 말하는 자리라 제목에만 적용한다.
    pattern:
      /(?:(?:체크인|걷기|달리기|라이딩|등산|활동|동기화|드랍|픽업|획득)\s*(?:\d+|한|두|세|네|다섯)\s?(?:곳|번|개|회|일|km|m|분|시간)$)|(?:^(?:걸어서|달려서|올라서|타고)\s*\d+(?:\.\d+)?\s?(?:km|m|분|시간)$)|(?:(?:체크인|획득|드랍|픽업|동기화)$)/,
    message: '제목이 조건을 요약한 말처럼 읽혀요. 「지하철 역에서 만나는 행운」처럼 장면이나 기대가 보이게 써 주세요(UX 라이팅 가이드라인 §2.6).',
  },
  bannedTerm('stamp', /도장/, '도장', '「체크인」이나 「획득」으로 써 주세요.'),
  bannedTerm('radius-500m', /(?<![\d,.])500\s*(?:m(?![A-Za-z])|미터)/, '500m', '체크인 반경 숫자는 화면에 노출하지 않으니 빼 주세요.'),
  bannedTerm('place-badge', /(?:장소|POI|지점|방문)\s*배지/, '장소 배지·POI 배지·지점 배지·방문 배지', '「체크인 배지」처럼 고정 용어로 써 주세요(UX 라이팅 가이드 §1.3).'),
  bannedTerm('discover', /발견/, '발견', '획득 맥락이면 「획득」·「체크인」으로 써 주세요.'),
  bannedTerm('find-and', /찾아서/, '찾아서', '획득 맥락이면 「획득」·「체크인」으로 써 주세요.'),
  bannedTerm('neighbor', /이웃/, '이웃', '화자가 친구라서 이웃 호칭을 쓰지 않아요.'),
]

/**
 * 한 칸의 문구가 카피 규칙에 걸리는 만큼 오류 문장을 돌려준다(걸리는 것이 없으면 빈 배열).
 * 문자열이 아니거나 줄바꿈·제어 문자 검사가 따로 다루는 값은 호출하는 쪽이 건너뛴다.
 *
 * @param prefix 오류 문장 앞 칸 이름의 앞부분(`card.` · `mission.`)
 * @param field 칸 이름(`title` · `subtitle` · `description`)
 */
export function collectCopyErrors(prefix: string, field: CopyField, value: unknown): string[] {
  if (typeof value !== 'string') return []
  const subject: CopySubject = prefix.startsWith('mission') ? 'mission' : 'card'
  const errors: string[] = []
  for (const rule of COPY_RULES) {
    if (rule.fields && !rule.fields.includes(field)) continue
    if (rule.subjects && !rule.subjects.includes(subject)) continue
    if (rule.pattern.test(value)) errors.push(`${prefix}${field}: ${rule.message}`)
  }
  return errors
}
