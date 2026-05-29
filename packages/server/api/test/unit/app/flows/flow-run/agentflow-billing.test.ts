import { ActivepiecesError, ErrorCode } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- mocks (must be before the import under test) ---

const { mockGetBoolean, mockGet, mockProjectGetOne } = vi.hoisted(() => ({
    mockGetBoolean: vi.fn(),
    mockGet: vi.fn(),
    mockProjectGetOne: vi.fn(),
}))

vi.mock('../../../../../src/app/helper/system/system', () => ({
    system: {
        getBoolean: (...args: unknown[]) => mockGetBoolean(...args),
        get: (...args: unknown[]) => mockGet(...args),
    },
}))

vi.mock('../../../../../src/app/project/project-service', () => ({
    projectService: () => ({
        getOne: (...args: unknown[]) => mockProjectGetOne(...args),
    }),
}))

vi.mock('@activepieces/server-utils', () => ({
    safeHttp: { axios: { get: vi.fn(), post: vi.fn() } },
}))

import { AppSystemProp } from '../../../../../src/app/helper/system/system-props'
import { agentflowBilling } from '../../../../../src/app/flows/flow-run/agentflow-billing'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as FastifyBaseLogger

function enableBilling(): void {
    mockGetBoolean.mockImplementation((prop: string) => prop === AppSystemProp.AGENTFLOW_BILLING_ENABLED)
    mockGet.mockImplementation((prop: string) => {
        if (prop === AppSystemProp.AGENTFLOW_AGENTS_URL) return 'http://agents.internal'
        if (prop === AppSystemProp.AGENTFLOW_INTERNAL_SECRET) return 'sekret'
        if (prop === AppSystemProp.AGENTFLOW_RUN_PRICE_FLOW) return '0.05'
        return undefined
    })
}

function disableBilling(): void {
    mockGetBoolean.mockReturnValue(false)
}

function makeHttp(overrides?: { get?: ReturnType<typeof vi.fn>, post?: ReturnType<typeof vi.fn> }) {
    return {
        get: overrides?.get ?? vi.fn(),
        post: overrides?.post ?? vi.fn(),
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    mockProjectGetOne.mockResolvedValue({ id: 'p1', externalId: 'af-42' })
})

describe('ownerUserIdFromExternalId', () => {
    it('parses af-<int>', () => {
        expect(agentflowBilling.ownerUserIdFromExternalId('af-42')).toBe(42)
    })
    it('rejects non-af / non-int / non-positive', () => {
        expect(agentflowBilling.ownerUserIdFromExternalId('xyz')).toBeNull()
        expect(agentflowBilling.ownerUserIdFromExternalId('af-abc')).toBeNull()
        expect(agentflowBilling.ownerUserIdFromExternalId('af-0')).toBeNull()
        expect(agentflowBilling.ownerUserIdFromExternalId('af--3')).toBeNull()
        expect(agentflowBilling.ownerUserIdFromExternalId(null)).toBeNull()
        expect(agentflowBilling.ownerUserIdFromExternalId(undefined)).toBeNull()
    })
})

describe('assertOwnerHasBalance — flag off', () => {
    it('no-ops and makes no HTTP call when billing disabled (upstream-identical)', async () => {
        disableBilling()
        const http = makeHttp()
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http })).resolves.toBeUndefined()
        expect(http.get).not.toHaveBeenCalled()
        expect(mockProjectGetOne).not.toHaveBeenCalled()
    })
})

describe('assertOwnerHasBalance — flag on', () => {
    beforeEach(enableBilling)

    it('blocks (QUOTA_EXCEEDED/402) at zero balance', async () => {
        const http = makeHttp({ get: vi.fn().mockResolvedValue({ data: { ok: true, balance: '0' } }) })
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http }))
            .rejects.toMatchObject({ error: { code: ErrorCode.QUOTA_EXCEEDED } })
    })

    it('blocks at negative balance', async () => {
        const http = makeHttp({ get: vi.fn().mockResolvedValue({ data: { ok: true, balance: '-1.5' } }) })
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http }))
            .rejects.toBeInstanceOf(ActivepiecesError)
    })

    it('allows a positive balance + calls the right endpoint with the secret header', async () => {
        const get = vi.fn().mockResolvedValue({ data: { ok: true, balance: '12.34' } })
        const http = makeHttp({ get })
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http })).resolves.toBeUndefined()
        expect(get).toHaveBeenCalledWith(
            'http://agents.internal/internal/flow-balance/42',
            expect.objectContaining({ headers: { 'x-agentflow-secret': 'sekret' } }),
        )
    })

    it('allows when balance is Infinity (flow schema not migrated)', async () => {
        const http = makeHttp({ get: vi.fn().mockResolvedValue({ data: { ok: true, balance: 'Infinity' } }) })
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http })).resolves.toBeUndefined()
    })

    it('no-ops for a non-AgentFlow project (no af- externalId)', async () => {
        mockProjectGetOne.mockResolvedValue({ id: 'p1', externalId: null })
        const http = makeHttp({ get: vi.fn() })
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http })).resolves.toBeUndefined()
        expect(http.get).not.toHaveBeenCalled()
    })

    it('fail-CLOSED: blocks when the balance call errors', async () => {
        const http = makeHttp({ get: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) })
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http }))
            .rejects.toMatchObject({ error: { code: ErrorCode.QUOTA_EXCEEDED } })
    })

    it('fail-CLOSED: blocks when ok !== true', async () => {
        const http = makeHttp({ get: vi.fn().mockResolvedValue({ data: { ok: false } }) })
        await expect(agentflowBilling.assertOwnerHasBalance({ projectId: 'p1', log, http }))
            .rejects.toMatchObject({ error: { code: ErrorCode.QUOTA_EXCEEDED } })
    })
})

describe('debitOwnerForRun', () => {
    it('flag off → no-op, no HTTP call (upstream-identical)', async () => {
        disableBilling()
        const http = makeHttp()
        await agentflowBilling.debitOwnerForRun({ projectId: 'p1', flowRunId: 'run-1', log, http })
        expect(http.post).not.toHaveBeenCalled()
    })

    it('flag on → debits with a stable idempotency key derived from the run id', async () => {
        enableBilling()
        const post = vi.fn().mockResolvedValue({ data: { ok: true, applied: true, charged: '0.05', balance: '12.29' } })
        const http = makeHttp({ post })
        await agentflowBilling.debitOwnerForRun({ projectId: 'p1', flowRunId: 'run-1', log, http })
        expect(post).toHaveBeenCalledWith(
            'http://agents.internal/internal/flow-run-charge',
            expect.objectContaining({
                user_id: 42,
                amount_flow: '0.05',
                idempotency_key: 'ap_run_run-1',
                flow_run_id: 'run-1',
            }),
            expect.objectContaining({ headers: { 'x-agentflow-secret': 'sekret' } }),
        )
    })

    it('retry uses the SAME idempotency key (no double-charge by key)', async () => {
        enableBilling()
        const post = vi.fn().mockResolvedValue({ data: { ok: true, applied: false } })
        const http = makeHttp({ post })
        await agentflowBilling.debitOwnerForRun({ projectId: 'p1', flowRunId: 'run-1', log, http })
        await agentflowBilling.debitOwnerForRun({ projectId: 'p1', flowRunId: 'run-1', log, http })
        const keys = post.mock.calls.map((c) => (c[1] as { idempotency_key: string }).idempotency_key)
        expect(keys).toEqual(['ap_run_run-1', 'ap_run_run-1'])
    })

    it('fail-SOFT: swallows a debit transport error (run already completed)', async () => {
        enableBilling()
        const post = vi.fn().mockRejectedValue(new Error('500'))
        const http = makeHttp({ post })
        await expect(agentflowBilling.debitOwnerForRun({ projectId: 'p1', flowRunId: 'run-1', log, http })).resolves.toBeUndefined()
    })

    it('non-AgentFlow project → no debit', async () => {
        enableBilling()
        mockProjectGetOne.mockResolvedValue({ id: 'p1', externalId: 'tenant-x' })
        const http = makeHttp({ post: vi.fn() })
        await agentflowBilling.debitOwnerForRun({ projectId: 'p1', flowRunId: 'run-1', log, http })
        expect(http.post).not.toHaveBeenCalled()
    })
})
