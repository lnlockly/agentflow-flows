import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { agentflowTelegramAuth } from './lib/common';
import { sendMessage } from './lib/actions/send-message';
import { sendCard } from './lib/actions/send-card';

export const agentflowTelegram = createPiece({
  displayName: 'Telegram (AgentFlow)',
  description:
    'Отправка сообщений и карточек согласования в Telegram через MTProto-аккаунт владельца, привязанный в AgentFlow.',
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://flows.agentflow.website/agentflow-favicon.svg',
  categories: [PieceCategory.COMMUNICATION],
  authors: ['agentflow'],
  auth: agentflowTelegramAuth,
  actions: [sendMessage, sendCard],
  triggers: [],
});
