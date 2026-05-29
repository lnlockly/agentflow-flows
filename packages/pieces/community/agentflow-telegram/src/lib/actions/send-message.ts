import { createAction, Property } from '@activepieces/pieces-framework';
import {
  agentflowTelegramAuth,
  telegramBridge,
  TelegramBridgeAuth,
} from '../common';

export const sendMessage = createAction({
  auth: agentflowTelegramAuth,
  name: 'send_message',
  displayName: 'Отправить сообщение',
  description:
    'Отправляет сообщение в Telegram через MTProto-аккаунт владельца (от своего имени, не от бота).',
  props: {
    peer: Property.ShortText({
      displayName: 'Получатель',
      description:
        'Кому отправить: @username, номер телефона, ID чата, либо `me` для отправки самому себе.',
      required: true,
    }),
    text: Property.LongText({
      displayName: 'Текст',
      description: 'Текст сообщения.',
      required: true,
    }),
    reply_to_msg_id: Property.Number({
      displayName: 'Ответ на сообщение (ID)',
      description: 'ID сообщения, на которое отвечаем (необязательно).',
      required: false,
    }),
  },
  async run(context) {
    const auth = context.auth.props as TelegramBridgeAuth;
    const { peer, text, reply_to_msg_id } = context.propsValue;
    const body: Record<string, unknown> = { peer, text };
    if (reply_to_msg_id != null) body['reply_to_msg_id'] = reply_to_msg_id;
    return telegramBridge.sendMessage(auth, body);
  },
});
