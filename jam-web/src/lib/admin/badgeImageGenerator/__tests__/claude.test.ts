import sharp from 'sharp'
import { afterEach, beforeEach, vi } from 'vitest'
import { checkImageHasNoText, describeItem, planImageEdit } from '../claude'

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 200, g: 10, b: 10 } } })
    .png()
    .toBuffer()
}

function mockReply(text: string, ok = true) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => ({ content: [{ type: 'text', text }] }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('checkImageHasNoText', () => {
  it('응답이 NO일 때만 통과한다', async () => {
    mockReply('NO')
    expect(await checkImageHasNoText(await png())).toBe(true)
  })

  it('YES·빈 응답·해석 불가·HTTP 오류는 통과하지 않는다', async () => {
    const img = await png()
    mockReply('YES')
    expect(await checkImageHasNoText(img)).toBe(false)
    mockReply('')
    expect(await checkImageHasNoText(img)).toBe(false)
    mockReply('Maybe')
    expect(await checkImageHasNoText(img)).toBe(false)
    mockReply('NO', false)
    expect(await checkImageHasNoText(img)).toBe(false)
  })

  it('256px 이하로 줄인 이미지를 보낸다', async () => {
    const big = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .png()
      .toBuffer()
    const fetchMock = mockReply('NO')
    await checkImageHasNoText(big)
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    const data = sent.messages[0].content[0].source.data as string
    const meta = await sharp(Buffer.from(data, 'base64')).metadata()
    expect(meta.width).toBe(256)
    expect(sent.max_tokens).toBe(5)
  })
})

describe('describeItem', () => {
  it('응답 문장의 따옴표·줄바꿈을 정리해 돌려준다', async () => {
    mockReply('  "A red cup.\nWith a chip."\n')
    expect(await describeItem('컵', '빨간 컵')).toBe('A red cup. With a chip.')
  })

  it('HTTP 오류면 오류를 던진다', async () => {
    mockReply('x', false)
    await expect(describeItem('컵', '빨간 컵')).rejects.toThrow()
  })
})

describe('planImageEdit', () => {
  const reply = '{"operation":"erase","boxes":[[0.1,0.1,0.3,0.3]],"reason_ko":"지움"}'

  it('JSON 앞뒤에 글이 섞여도 계획을 읽고, 사고 끔과 이미지 블록을 보낸다', async () => {
    const fetchMock = mockReply(`Here: ${reply} bye`)
    const plan = await planImageEdit(await png(), '오른쪽 종이를 지워 줘', 'a red cup')
    expect(plan.operation).toBe('erase')
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(sent.thinking).toEqual({ type: 'disabled' })
    expect(sent.max_tokens).toBe(300)
    expect(sent.messages[0].content.some((b: { type: string }) => b.type === 'image')).toBe(true)
  })

  it('JSON이 아니면 오류를 낸다', async () => {
    mockReply('죄송합니다')
    await expect(planImageEdit(await png(), '지워 줘', 'a cup')).rejects.toThrow()
  })
})

describe('recraftErrorMessage', () => {
  it('크레딧 부족은 충전 안내로, 그 밖에는 코드와 메시지를 붙여 알린다', async () => {
    const { recraftErrorMessage } = await import('../recraft')
    const credits = new Response(JSON.stringify({ code: 'not_enough_credits', message: '' }), { status: 400 })
    expect(await recraftErrorMessage(credits, '생성')).toMatch(/크레딧이 부족/)
    const other = new Response(JSON.stringify({ code: 'invalid_request_parameter', message: 'bad' }), { status: 400 })
    expect(await recraftErrorMessage(other, '생성')).toBe('Recraft 생성 실패 (HTTP 400, invalid_request_parameter: bad)')
    const model = new Response(JSON.stringify({ code: 'invalid_model', message: "The requested model 'recraftv4' isn't compatible with the style's model 'recraftv3'" }), { status: 400 })
    expect(await recraftErrorMessage(model, '생성')).toMatch(/recraftv3로 만든 스타일/)
  })
})
