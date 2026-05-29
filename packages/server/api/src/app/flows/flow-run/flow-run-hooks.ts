import { ApEdition, FlowRun, FlowTriggerType, isFailedState, isFlowRunStateTerminal, isManualPieceTrigger, isNil, RunEnvironment, UpdateRunProgressRequest, WebsocketClientEvent } from '@activepieces/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { websocketService } from '../../core/websockets.service'
import { alertsService } from '../../ee/alerts/alerts-service'
import { system } from '../../helper/system/system'
import { flowVersionService } from '../flow-version/flow-version.service'
import { agentflowBilling } from './agentflow-billing'

const paidEditions = [ApEdition.CLOUD, ApEdition.ENTERPRISE].includes(system.getEdition())
export const flowRunHooks = (log: FastifyBaseLogger) => ({
    async onFinish(flowRun: FlowRun): Promise<void> {
        if (!isFlowRunStateTerminal({
            status: flowRun.status,
            ignoreInternalError: true,
        })) {
            return
        }
        // [AgentFlow fork] Per-run debit for terminal PRODUCTION runs. No-op
        // when AGENTFLOW_BILLING_ENABLED is off (upstream-identical) or the
        // project is not AgentFlow-managed. Idempotent on flowRun.id (a
        // retry/resume reuses the same key → no double-charge). Fail-soft.
        // Doc: agentflow-code-docs/subsystems/activepieces-fork-billing.mdx
        if (flowRun.environment === RunEnvironment.PRODUCTION) {
            await agentflowBilling.debitOwnerForRun({ projectId: flowRun.projectId, flowRunId: flowRun.id, log })
        }
        const flowVersion = await flowVersionService(log).getOne(flowRun.flowVersionId)
        const isPieceTrigger = !isNil(flowVersion) && flowVersion.trigger.type === FlowTriggerType.PIECE && !isNil(flowVersion.trigger.settings.triggerName) 
        const isManualTrigger = isPieceTrigger && isManualPieceTrigger({ pieceName: flowVersion.trigger.settings.pieceName, triggerName: flowVersion.trigger.settings.triggerName })
        if (flowRun.environment === RunEnvironment.TESTING || isManualTrigger) {
            websocketService.to(flowRun.projectId).emit(WebsocketClientEvent.UPDATE_RUN_PROGRESS, {
                flowRun,
            } satisfies UpdateRunProgressRequest)
        }
        if (isFailedState(flowRun.status) && flowRun.environment === RunEnvironment.PRODUCTION && !isNil(flowRun.failedStep)) {
            const date = dayjs(flowRun.created).toISOString()
            const issueToAlert = {
                projectId: flowRun.projectId,
                flowVersionId: flowRun.flowVersionId,
                flowId: flowRun.flowId,
                created: date,
            }

            if (paidEditions) {
                await alertsService(log).sendAlertOnRunFinish({
                    issueToAlert,
                    flowRunId: flowRun.id,
                    failedStep: flowRun.failedStep,
                })
            }
        }
        if (!paidEditions) {
            return
        }
    },
})
