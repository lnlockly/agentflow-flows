import { createAction, Property } from '@activepieces/pieces-framework';
import { agentflowKworkAuth, kworkBridge, KworkBridgeAuth } from '../common';

export const sendReply = createAction({
  auth: agentflowKworkAuth,
  name: 'send_reply',
  displayName: 'Отправить ответ',
  description:
    'Отправляет сообщение в диалог Kwork или отклик на проект (лид) от имени владельца.',
  props: {
    target: Property.StaticDropdown({
      displayName: 'Куда отправить',
      description: 'Ответ в существующий диалог или отклик на проект.',
      required: true,
      defaultValue: 'dialog',
      options: {
        options: [
          { label: 'В диалог', value: 'dialog' },
          { label: 'Отклик на проект', value: 'project' },
        ],
      },
    }),
    target_id: Property.ShortText({
      displayName: 'ID диалога или проекта',
      description:
        'ID диалога (`dialog_id` из «Сканировать диалоги») либо ID проекта (`want_id` из «Сканировать заявки»).',
      required: true,
    }),
    text: Property.LongText({
      displayName: 'Текст',
      description: 'Текст сообщения или отклика.',
      required: true,
    }),
    price: Property.Number({
      displayName: 'Цена (только для отклика)',
      description: 'Предлагаемая цена в откликe на проект (необязательно).',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props as KworkBridgeAuth;
    const { target, target_id, text, price } = context.propsValue;
    if (target === 'project') {
      const body: Record<string, unknown> = { want_id: target_id, text };
      if (price != null) body['price'] = price;
      return kworkBridge.callBridge(auth, '/kwork/respond-to-project', body);
    }
    return kworkBridge.callBridge(auth, '/kwork/send-message', {
      dialog_id: target_id,
      text,
    });
  },
});
