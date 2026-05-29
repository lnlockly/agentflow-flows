import { createAction, Property } from '@activepieces/pieces-framework';
import { ExecutionType } from '@activepieces/shared';
import {
  agentflowTelegramAuth,
  telegramBridge,
  TelegramBridgeAuth,
} from '../common';

export const sendCard = createAction({
  auth: agentflowTelegramAuth,
  name: 'send_card',
  displayName: 'Карточка согласования',
  description:
    'Отправляет в Telegram сообщение с ссылками «Одобрить»/«Отклонить», ставит выполнение на паузу и продолжает после выбора владельца.',
  props: {
    peer: Property.ShortText({
      displayName: 'Получатель',
      description: 'Кому отправить карточку: @username, ID чата или `me`.',
      required: true,
    }),
    message: Property.LongText({
      displayName: 'Текст карточки',
      description: 'Что нужно согласовать.',
      required: true,
    }),
    approve_button_text: Property.ShortText({
      displayName: 'Текст «Одобрить»',
      required: false,
      defaultValue: 'Одобрить',
    }),
    disapprove_button_text: Property.ShortText({
      displayName: 'Текст «Отклонить»',
      required: false,
      defaultValue: 'Отклонить',
    }),
  },
  async run(context) {
    if (context.executionType === ExecutionType.BEGIN) {
      const auth = context.auth.props as TelegramBridgeAuth;
      const { peer, message, approve_button_text, disapprove_button_text } =
        context.propsValue;

      const waitpoint = await context.run.createWaitpoint({ type: 'WEBHOOK' });
      const approveUrl = waitpoint.buildResumeUrl({
        queryParams: { action: 'approve' },
      });
      const disapproveUrl = waitpoint.buildResumeUrl({
        queryParams: { action: 'disapprove' },
      });

      const approveLabel = approve_button_text || 'Одобрить';
      const disapproveLabel = disapprove_button_text || 'Отклонить';
      const text = [
        message,
        '',
        `✅ ${approveLabel}: ${approveUrl}`,
        `❌ ${disapproveLabel}: ${disapproveUrl}`,
      ].join('\n');

      const sent = await telegramBridge.sendMessage<{
        ok: boolean;
        message_id?: number;
        account_id?: number;
      }>(auth, { peer, text });

      context.run.waitForWaitpoint(waitpoint.id);

      return {
        approved: false,
        messageId: sent.message_id ?? null,
        accountId: sent.account_id ?? null,
        peer,
      };
    }
    return {
      approved: context.resumePayload.queryParams['action'] === 'approve',
      peer: context.propsValue.peer,
    };
  },
});
