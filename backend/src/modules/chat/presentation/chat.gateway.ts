import {
  ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { AuthCookies, AuthenticateRequestUseCase } from '../../auth/auth.public-api';
import { JoinConversationUseCase } from '../application/join-conversation.use-case';
import { RecordDeliveryUseCase } from '../application/record-delivery.use-case';
import { QueryChatUseCase } from '../application/query-chat.use-case';
import { SendMessageUseCase } from '../application/send-message.use-case';
import { Message, MessageView } from '../domain/ports';
import { ReceiptUpdate } from '../domain/receipt';
import { groupReceiptUpdates, messageDto } from './message.dto';

const MESSAGE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 20; // 20 mensajes cada 10 s por conexión

@WebSocketGateway({
  namespace: 'chat',
  cors: { origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()), credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly sendMessage: SendMessageUseCase,
    private readonly joinConversation: JoinConversationUseCase,
    private readonly query: QueryChatUseCase,
    private readonly authenticate: AuthenticateRequestUseCase,
    private readonly cookies: AuthCookies,
    private readonly delivery: RecordDeliveryUseCase,
  ) {}

  /** La conexión se autentica con la MISMA cookie de sesión que la API REST. */
  async handleConnection(client: Socket) {
    try {
      const token = this.cookies.readAccessFromHeader(client.handshake.headers.cookie);
      if (!token) throw new Error('sin sesión');
      const auth = await this.authenticate.execute({ accessToken: token });
      if (auth.mustChangePassword) throw new Error('cambio de contraseña obligatorio');
      client.data.userId = auth.userId;
      client.data.sessionId = auth.sessionId;
      client.join(`user:${auth.userId}`);
      // Sin esto el servidor difundiría a salas a las que el navegador nunca entró y no llegaría nada en vivo.
      for (const id of await this.query.conversationIdsOf(auth.userId)) client.join(`conversation:${id}`);
      // Lo que llegó mientras estaba desconectada se entrega ahora (con la hora real). Un fallo aquí no tumba la conexión.
      this.delivery.onConnect(auth.userId).catch(() => undefined);
    } catch {
      client.disconnect(true);
    }
  }

  /**
   * La sesión se revalida en CADA evento: si se cerró, se revocó, el usuario se deshabilitó o el
   * dispositivo se bloqueó después de conectar, el socket se corta en lugar de seguir operando.
   */
  private async stillAuthenticated(client: Socket): Promise<boolean> {
    const { userId, sessionId } = client.data ?? {};
    if (userId && sessionId) {
      try {
        const auth = await this.authenticate.verifySession(sessionId, userId);
        if (!auth.mustChangePassword) return true;
      } catch { /* sesión perdida: se desconecta abajo */ }
    }
    client.disconnect(true);
    return false;
  }

  /** Ventana deslizante por conexión: frena a un cliente (o un script) que inunda el chat. */
  private readonly sent = new WeakMap<Socket, number[]>();
  private overLimit(client: Socket): boolean {
    const now = Date.now();
    const recent = (this.sent.get(client) ?? []).filter((t) => now - t < MESSAGE_WINDOW_MS);
    recent.push(now);
    this.sent.set(client, recent);
    return recent.length > MAX_MESSAGES_PER_WINDOW;
  }

  @SubscribeMessage('message:send')
  async onSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; content?: string; attachments?: Array<{ documentId: string; versionId?: string }> },
  ) {
    if (!(await this.stillAuthenticated(client))) return;
    if (this.overLimit(client)) throw new WsException('Estás enviando mensajes demasiado rápido');
    // La difusión a la sala la hace onMessageSent, así también cubre el envío por REST.
    return this.sendMessage.execute({ ...body, authorId: client.data.userId }); // ack al emisor
  }

  @OnEvent('chat.message.sent')
  async onMessageSent(message: Message) {
    const room = `conversation:${message.conversationId}`;
    // Sin acuses: este mensaje lo recibe toda la sala y los acuses son solo de quien lo envió.
    this.server.to(room).emit('message:new', messageDto(await this.query.messageView(message.id)));
    // «Entregado»: lo reciben, en este instante, los miembros que tienen una conexión abierta en la sala.
    try {
      const online = new Set((await this.server.in(room).fetchSockets()).map((s) => s.data?.userId as string | undefined));
      const members = await this.query.memberIdsOf(message.conversationId);
      const userIds = members.filter((m) => m !== message.authorId && online.has(m));
      if (userIds.length) await this.delivery.forMessage({ messageId: message.id, userIds });
    } catch { /* el mensaje ya se guardó y difundió; los acuses pendientes se registran al conectarse */ }
  }

  /** Avisa a QUIEN ENVIÓ cada mensaje de que fue entregado o leído (y cuándo). Nadie más recibe esto. */
  @OnEvent('chat.receipts.updated')
  onReceiptsUpdated(updates: ReceiptUpdate[]) {
    for (const g of groupReceiptUpdates(updates)) this.server.to(`user:${g.authorId}`).emit('receipt:update', g.payload);
  }

  @OnEvent('chat.message.edited')
  onMessageEdited(view: MessageView) {
    this.server.to(`conversation:${view.conversationId}`).emit('message:edited', messageDto(view));
  }

  /** Una conversación nueva: sus miembros (con sesión abierta) entran a la sala y reciben el aviso para refrescar la lista. */
  @OnEvent('chat.conversation.created')
  onConversationCreated(e: { conversationId: string; memberIds: string[] }) {
    for (const userId of e.memberIds) {
      this.server.in(`user:${userId}`).socketsJoin(`conversation:${e.conversationId}`);
      this.server.to(`user:${userId}`).emit('conversation:new', { id: e.conversationId });
    }
  }

  @SubscribeMessage('conversation:join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    if (!(await this.stillAuthenticated(client))) return;
    await this.joinConversation.execute({ conversationId: body.conversationId, userId: client.data.userId });
    client.join(`conversation:${body.conversationId}`);
  }
}
