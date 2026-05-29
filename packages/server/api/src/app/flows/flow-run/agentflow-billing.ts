/**
 * [AgentFlow fork] Engine-level billing/quota hook.
 *
 * This is the reason AgentFlow forked Activepieces (a webhook-meter wrapper
 * can't hard-block spend at zero). Two seams, both flag-gated behind
 * AGENTFLOW_BILLING_ENABLED (default off → upstream behaviour is byte-identical):
 *
 *   1. Pre-run gate  (assertOwnerHasBalance) — called at the top of
 *      flowRunService.start(); blocks dispatch with a 402 when the owner's
 *      AgentFlow balance is <= 0. Fail-CLOSED: an unverifiable balance blocks.
 *   2. Per-run debit (debitOwnerForRun) — called from flowRunHooks.onFinish()
 *      for terminal PRODUCTION runs; debits the owner. Idempotent on the run id
 *      (a retry/resume reuses the same key → no double-charge). Fail-SOFT: a
 *      debit transport error is logged, never corrupts a completed run.
 *
 * The fork is a CLIENT of agentflow-agents' internal billing API (no new public
 * AP route, no agentflow-agents edit). Owner identity comes from the AP project
 * externalId minted by the auth patch (externalId = 'af-<agentflowUserId>').
 *
 * Doc: agentflow-code-docs/subsystems/activepieces-fork-billing.mdx
 */
import { safeHttp } from '@activepieces/server-utils'
import { ActivepiecesError, ErrorCode, isNil, PlatformUsageMetric } from '@activepieces/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { projectService } from '../../project/project-service'

const EXTERNAL_ID_PREFIX = 'af-'
const INTERNAL_SECRET_HEADER = 'x-agentflow-secret'

type AgentflowHttp = {
    get: (url: string, config: { headers: Record<string, string>, timeout: number }) => Promise<{ data: unknown }>
    post: (url: string, body: unknown, config: { headers: Record<string, string>, timeout: number }) => Promise<{ data: unknown }>
}

function defaultHttp(): AgentflowHttp {
    return safeHttp.axios as unknown as AgentflowHttp
}

function billingConfig(): { baseUrl: string, secret: string } | null {
    const baseUrl = system.get<string>(AppSystemProp.AGENTFLOW_AGENTS_URL)
    const secret = system.get<string>(AppSystemProp.AGENTFLOW_INTERNAL_SECRET)
    if (isNil(baseUrl) || baseUrl.trim() === '' || isNil(secret) || secret.trim() === '') {
        return null
    }
    return { baseUrl: baseUrl.replace(/\/+$/, ''), secret }
}

function ownerUserIdFromExternalId(externalId: string | null | undefined): number | null {
    if (isNil(externalId) || !externalId.startsWith(EXTERNAL_ID_PREFIX)) {
        return null
    }
    const raw = externalId.slice(EXTERNAL_ID_PREFIX.length)
    const parsed = Number(raw)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null
    }
    return parsed
}

async function resolveAgentflowOwner(projectId: string, log: FastifyBaseLogger): Promise<{ userId: number, externalId: string } | null> {
    const project = await projectService(log).getOne(projectId)
    if (isNil(project)) {
        return null
    }
    const userId = ownerUserIdFromExternalId(project.externalId)
    if (isNil(userId)) {
        return null
    }
    return { userId, externalId: project.externalId as string }
}

function isBillingEnabled(): boolean {
    return system.getBoolean(AppSystemProp.AGENTFLOW_BILLING_ENABLED) === true
}

function quotaExceeded(): ActivepiecesError {
    return new ActivepiecesError({
        code: ErrorCode.QUOTA_EXCEEDED,
        params: { metric: PlatformUsageMetric.AI_CREDITS },
    })
}

/**
 * Pre-run hard gate. Throws QUOTA_EXCEEDED (HTTP 402) when the owner's balance
 * is <= 0 or cannot be confirmed. No-op when the flag is off or the project is
 * not an AgentFlow-managed project. Inject `http` in tests.
 */
async function assertOwnerHasBalance(
    params: { projectId: string, log: FastifyBaseLogger, http?: AgentflowHttp },
): Promise<void> {
    if (!isBillingEnabled()) {
        return
    }
    const { projectId, log } = params
    const config = billingConfig()
    if (isNil(config)) {
        log.error({ projectId }, '[agentflow-billing] enabled but AGENTFLOW_AGENTS_URL / AGENTFLOW_INTERNAL_SECRET unset — blocking (fail-closed)')
        throw quotaExceeded()
    }
    const owner = await resolveAgentflowOwner(projectId, log)
    if (isNil(owner)) {
        return
    }
    const http = params.http ?? defaultHttp()
    let balance: number
    try {
        const res = await http.get(`${config.baseUrl}/internal/flow-balance/${owner.userId}`, {
            headers: { [INTERNAL_SECRET_HEADER]: config.secret },
            timeout: 5000,
        })
        const body = res.data as { ok?: boolean, balance?: string | number }
        if (body?.ok !== true || isNil(body.balance)) {
            log.warn({ projectId, userId: owner.userId }, '[agentflow-billing] balance check returned non-ok — blocking (fail-closed)')
            throw quotaExceeded()
        }
        if (body.balance === 'Infinity') {
            return
        }
        balance = Number(body.balance)
    }
    catch (e) {
        if (e instanceof ActivepiecesError) {
            throw e
        }
        log.warn({ projectId, userId: owner.userId, err: (e as Error).message }, '[agentflow-billing] balance check failed — blocking (fail-closed)')
        throw quotaExceeded()
    }
    if (!Number.isFinite(balance) || balance <= 0) {
        log.info({ projectId, userId: owner.userId, balance }, '[agentflow-billing] insufficient balance — run blocked')
        throw quotaExceeded()
    }
}

/**
 * Per-run debit. Idempotent on flowRunId (a retry reuses the same key). No-op
 * when the flag is off / non-AgentFlow project. Fail-SOFT: logs and swallows
 * transport errors (the run already completed). Inject `http` in tests.
 */
async function debitOwnerForRun(
    params: { projectId: string, flowRunId: string, log: FastifyBaseLogger, http?: AgentflowHttp },
): Promise<void> {
    if (!isBillingEnabled()) {
        return
    }
    const { projectId, flowRunId, log } = params
    const config = billingConfig()
    if (isNil(config)) {
        log.error({ projectId, flowRunId }, '[agentflow-billing] enabled but config unset — skipping debit')
        return
    }
    const owner = await resolveAgentflowOwner(projectId, log)
    if (isNil(owner)) {
        return
    }
    const amountFlow = system.get<string>(AppSystemProp.AGENTFLOW_RUN_PRICE_FLOW) ?? '0.01'
    const http = params.http ?? defaultHttp()
    try {
        await http.post(`${config.baseUrl}/internal/flow-run-charge`, {
            user_id: owner.userId,
            amount_flow: amountFlow,
            idempotency_key: `ap_run_${flowRunId}`,
            project_external_id: owner.externalId,
            flow_run_id: flowRunId,
        }, {
            headers: { [INTERNAL_SECRET_HEADER]: config.secret },
            timeout: 5000,
        })
    }
    catch (e) {
        log.warn({ projectId, flowRunId, userId: owner.userId, err: (e as Error).message }, '[agentflow-billing] debit failed (fail-soft, run already completed)')
    }
}

export const agentflowBilling = {
    assertOwnerHasBalance,
    debitOwnerForRun,
    ownerUserIdFromExternalId,
    isBillingEnabled,
}
