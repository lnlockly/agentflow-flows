import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { agentflowKworkAuth } from './lib/common';
import { scanDialogs } from './lib/actions/scan-dialogs';
import { scanLeads } from './lib/actions/scan-leads';
import { sendReply } from './lib/actions/send-reply';
import { newLead } from './lib/triggers/new-lead';

export const agentflowKwork = createPiece({
  displayName: 'Kwork (AgentFlow)',
  description:
    'Сканирование диалогов и заявок Kwork и автоответы от имени владельца через AgentFlow.',
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://flows.agentflow.website/agentflow-favicon.svg',
  categories: [PieceCategory.SALES_AND_CRM, PieceCategory.COMMUNICATION],
  authors: ['agentflow'],
  auth: agentflowKworkAuth,
  actions: [scanDialogs, scanLeads, sendReply],
  triggers: [newLead],
});
