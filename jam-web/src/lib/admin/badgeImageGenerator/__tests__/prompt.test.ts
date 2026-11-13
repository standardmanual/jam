import { FRAMING_LEAD, RECRAFT_PROMPT_MAX, buildRecraftPrompt, buildRecraftRequest, cleanClaudeSentence, hexToRgb, type PromptPreset } from '../prompt'

const preset: PromptPreset = {
  style_id: 'style-1',
  model: 'recraftv3',
  composition_text: 'COMPOSITION.',
  forbid_text: 'FORBID.',
  negative_prompt: 'face, text',
  background_color: '#ffffff',
}

describe('buildRecraftRequest', () => {
  it('recraftv3일 때만 negative_prompt와 no_text를 넣는다', () => {
    const v3 = buildRecraftRequest('A red cup.', preset)
    expect(v3.negative_prompt).toBe('face, text')
    expect(v3.controls.no_text).toBe(true)

    const other = buildRecraftRequest('A red cup.', { ...preset, model: 'recraftv2' })
    expect(other).not.toHaveProperty('negative_prompt')
    expect(other.controls).not.toHaveProperty('no_text')
    expect(other.controls.background_color.rgb).toEqual([255, 255, 255])
  })

  it('프롬프트는 고정 구도 머리말 + 묘사 + 구도 문장 + 금지 문장 순서로 조립한다', () => {
    expect(buildRecraftPrompt('A red cup.', preset)).toBe(`${FRAMING_LEAD} A red cup. COMPOSITION. FORBID.`)
    expect(buildRecraftRequest('A red cup.', preset)).toMatchObject({ n: 2, size: '1024x1024', response_format: 'url' })
  })
})

describe('hexToRgb', () => {
  it('6자리·3자리 hex를 변환하고 잘못된 값은 오류를 낸다', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0])
    expect(hexToRgb('fff')).toEqual([255, 255, 255])
    expect(() => hexToRgb('zzz')).toThrow()
  })
})

describe('cleanClaudeSentence', () => {
  it('앞뒤 공백·따옴표를 지우고 줄바꿈을 공백으로 바꾼다', () => {
    expect(cleanClaudeSentence('  "A cup.\nWith a chip."  ')).toBe('A cup. With a chip.')
  })
  it('프롬프트가 Recraft 한도를 넘으면 원인을 알리는 오류를 낸다', () => {
    const long = 'x'.repeat(RECRAFT_PROMPT_MAX)
    expect(() => buildRecraftRequest(long, preset)).toThrow(/한도/)
  })
})
