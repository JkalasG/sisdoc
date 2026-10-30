import {
  ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthCookies, AuthenticateRequestUseCase } from '../../auth/auth.public-api';
import { JoinConversationUseCase } from '../application/join-conversation.use-case';
import { SendMessageUseCase } from '../application/send-message.use-case';

@WebSocketGateway({
  namespace: 'chat',
  cors: { origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()), credentials: true },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  constructor(
    private readonly sendMessage: SendMessageUseCase,
    private readonly joinConversation: JoinConversationUseCase,
    private readonly authenticate: AuthenticateRequestUseCase,
    private readonly cookies: AuthCookies,
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
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('message:send')
  async onSend(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; content?: string; attachments?: Array<{ documentId: string; versionId?: string }> },
  ) {
    if (!client.data?.userId) {
      client.disconnect(true);
      return;
    }
    const message = await this.sendMessage.execute({ ...body, authorId: client.data.userId });
    this.server.to(`conversation:${body.conversationId}`).emit('message:new', message);
    return message; // ack al emisor
  }

  @SubscribeMessage('conversation:join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    if (!client.data?.userId) {
      client.disconnect(true);
      return;
    }
    await this.joinConversation.execute({ conversationId: body.conversationId, userId: client.data.userId });
    client.join(`conversation:${body.conversationId}`);
  }
}
