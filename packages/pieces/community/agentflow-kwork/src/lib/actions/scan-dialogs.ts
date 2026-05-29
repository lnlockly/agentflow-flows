import { createAction, Property } from '@activepieces/pieces-framework';
import { agentflowKworkAuth, kworkBridge, KworkBridgeAuth } from '../common';

export const scanDialogs = createAction({
  auth: agentflowKworkAuth,
  name: 'scan_dialogs',
  displayName: 'Сканировать диалоги',
  description:
    'Возвращает список диалогов (чатов) в инбоксе Kwork владельца — с превью последнего сообщения и числом непрочитанных.',
  props: {
    limit: Property.Number({
      displayName: 'Лимит',
      description: 'Сколько диалогов вернуть (по умолчанию 50).',
      required: false,
      defaultValue: 50,
    }),
  },
  async run(context) {
    const auth = context.auth.props as KworkBridgeAuth;
    return kworkBridge.callBridge(auth, '/kwork/scan-dialogs', {
      limit: context.propsValue.limit ?? 50,
    });
  },
});
