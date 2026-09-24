import { runBadgeDeactivationSideEffects } from '../badge-deactivate'
import { invalidateUnclaimedDrops } from '../poi-drops'
import { countRecipesReferencingBadge } from '../recipe-references'

vi.mock('../poi-drops', () => ({ invalidateUnclaimedDrops: vi.fn() }))
vi.mock('../recipe-references', () => ({ countRecipesReferencingBadge: vi.fn() }))

const supabase = {} as Parameters<typeof runBadgeDeactivationSideEffects>[0]

describe('runBadgeDeactivationSideEffects', () => {
  beforeEach(() => {
    vi.mocked(invalidateUnclaimedDrops).mockReset()
    vi.mocked(countRecipesReferencingBadge).mockReset()
    vi.mocked(countRecipesReferencingBadge).mockResolvedValue({
      slotRecipeIds: [],
      rewardRecipeIds: [],
      total: 0,
      error: null,
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('단건: 미픽업 드랍 무효화를 그 배지와 caller로 한 번 부른다', async () => {
    await runBadgeDeactivationSideEffects(supabase, ['b1'], 'admin badges PATCH')
    expect(invalidateUnclaimedDrops).toHaveBeenCalledTimes(1)
    expect(invalidateUnclaimedDrops).toHaveBeenCalledWith(supabase, ['b1'], 'admin badges PATCH')
    expect(countRecipesReferencingBadge).toHaveBeenCalledWith(supabase, 'b1')
  })

  it('일괄: 드랍 무효화는 배지 전체로 한 번, 레시피 참조 조회는 배지마다 한 번씩 부른다', async () => {
    await runBadgeDeactivationSideEffects(supabase, ['b1', 'b2', 'b3'], 'admin badges list-bulk deactivate')
    expect(invalidateUnclaimedDrops).toHaveBeenCalledTimes(1)
    expect(invalidateUnclaimedDrops).toHaveBeenCalledWith(supabase, ['b1', 'b2', 'b3'], 'admin badges list-bulk deactivate')
    expect(countRecipesReferencingBadge).toHaveBeenCalledTimes(3)
  })

  it('레시피가 배지를 참조하면 경고 로그만 남기고 던지지 않는다', async () => {
    vi.mocked(countRecipesReferencingBadge).mockResolvedValue({
      slotRecipeIds: ['r1'],
      rewardRecipeIds: ['r2'],
      total: 2,
      error: null,
    })
    await expect(runBadgeDeactivationSideEffects(supabase, ['b1'], 'admin badges PATCH')).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('레시피 참조 조회가 실패해도 에러 로그만 남기고 던지지 않는다', async () => {
    vi.mocked(countRecipesReferencingBadge).mockResolvedValue({
      slotRecipeIds: [],
      rewardRecipeIds: [],
      total: 0,
      error: 'boom',
    })
    await expect(runBadgeDeactivationSideEffects(supabase, ['b1'], 'admin badges PATCH')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.warn).not.toHaveBeenCalled()
  })
})
