/**
 * 템플릿 SVG 검증(크기·정화·자리 읽기·안내 문구)을 한 함수로 모은 순수 모듈 (티켓 20261116_0426).
 * 저장 API와 등록 화면(브라우저)이 함께 쓰므로 서버 전용 모듈을 들여오지 않는다.
 */
import {
  TEMPLATE_SVG_MAX_BYTES,
  readTemplateSlots,
  sanitizeTemplateSvg,
  type TemplateSlots,
} from './templateSvg'

export type ValidateTemplateResult =
  | { ok: true; svg: string; removed: string[]; slots: TemplateSlots }
  | { ok: false; error: string }

const fail = (error: string): ValidateTemplateResult => ({ ok: false, error })

export function validateTemplateSvg(svgText: unknown): ValidateTemplateResult {
  if (typeof svgText !== 'string' || svgText.trim() === '') {
    return fail('SVG 내용이 비어 있어요. 피그마에서 내보낸 SVG를 올려 주세요.')
  }
  if (new TextEncoder().encode(svgText).length > TEMPLATE_SVG_MAX_BYTES) {
    return fail('SVG가 너무 커요. 1MB 이하로 줄여서 다시 올려 주세요.')
  }

  let svg: string
  let removed: string[]
  let slots: TemplateSlots
  try {
    ;({ svg, removed } = sanitizeTemplateSvg(svgText))
    slots = readTemplateSlots(svg)
  } catch {
    // TemplateSvgError 외의 예상 밖 예외도 던지지 않고 같은 안내로 돌려준다.
    return fail('SVG를 읽지 못했어요. 피그마에서 SVG로 다시 내보내 주세요.')
  }

  for (const [slotName, label] of [['name', '이름'], ['value', '값']] as const) {
    const slot = slots[slotName]
    if (!slot.found) {
      return fail(
        `${label} 자리를 찾지 못했어요. 피그마에서 ${label} 글자의 레이어 이름을 ${slotName}으로 바꾸고, 내보내기 설정의 Include "id" attribute를 켠 뒤 다시 내보내 주세요.`
      )
    }
    if (!slot.isText) {
      return fail(
        `${label} 자리가 글자가 아니에요. 피그마 내보내기 설정의 Outline text를 끄고 다시 내보내 주세요.`
      )
    }
  }
  return { ok: true, svg, removed, slots }
}
