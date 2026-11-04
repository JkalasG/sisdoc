import { UnauthenticatedError } from '../../auth/domain/auth-errors';
import { ChatGateway } from './chat.gateway';

function build(verify: jest.Mock) {
  const send = { execute: jest.fn().mockResolvedValue({ id: 'm1' }) };
  const join = { execute: jest.fn().mockResolvedValue(undefined) };
  const authenticate = {
    execute: jest.fn().mockResolvedValue({ userId: 'u1', sessionId: 's1', mustChangePassword: false }),
    verifySession: verify,
  };
  const cookies = { readAccessFromHeader: jest.fn().mockReturnValue('token') };
  const query = { conversationIdsOf: jest.fn().mockResolvedValue(['c1', 'c2']) };
  const delivery = { onConnect: jest.fn().mockResolvedValue(undefined), forMessage: jest.fn().mockResolvedValue(undefined) };
  const gateway = new ChatGateway(send as never, join as never, query as never, authenticate as never, cookies as never, delivery as never);
  const client = () => ({
    data: { userId: 'u1', sessionId: 's1' }, disconnect: jest.fn(), join: jest.fn(), handshake: { headers: { cookie: 'x' } },
  });
  return { gateway, send, join, authenticate, cookies, query, client, delivery };
}

describe('ChatGateway: la sesión se revalida en cada evento', () => {
  it('con sesión viva envía el mensaje y deja el socket abierto', async () => {
    const { gateway, send, client } = build(jest.fn().mockResolvedValue({ mustChangePassword: false }));
    const c = client();
    await gateway.onSend(c as never, { conversationId: 'c1', content: 'hola' });
    expect(send.execute).toHaveBeenCalledWith({ conversationId: 'c1', content: 'hola', authorId: 'u1' });
    expect(c.disconnect).not.toHaveBeenCalled();
  });

  it('si la sesión se revocó tras conectar, NO envía y corta el socket', async () => {
    const { gateway, send, client } = build(jest.fn().mockRejectedValue(new UnauthenticatedError()));
    const c = client();
    await gateway.onSend(c as never, { conversationId: 'c1', content: 'hola' });
    expect(send.execute).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalledWith(true);
  });

  it('si la sesión se revocó tras conectar, NO deja unirse a conversaciones', async () => {
    const { gateway, join, client } = build(jest.fn().mockRejectedValue(new UnauthenticatedError()));
    const c = client();
    await gateway.onJoin(c as never, { conversationId: 'c1' });
    expect(join.execute).not.toHaveBeenCalled();
    expect(c.join).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalledWith(true);
  });

  it('si ahora debe cambiar la contraseña, se corta', async () => {
    const { gateway, send, client } = build(jest.fn().mockResolvedValue({ mustChangePassword: true }));
    const c = client();
    await gateway.onSend(c as never, { conversationId: 'c1', content: 'hola' });
    expect(send.execute).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalledWith(true);
  });

  it('frena a una conexión que inunda el chat (más de 20 mensajes en 10 s) sin cortarla', async () => {
    const { gateway, send, client } = build(jest.fn().mockResolvedValue({ mustChangePassword: false }));
    const c = client();
    for (let i = 0; i < 20; i++) await gateway.onSend(c as never, { conversationId: 'c1', content: `m${i}` });
    await expect(gateway.onSend(c as never, { conversationId: 'c1', content: 'de más' })).rejects.toThrow(/demasiado rápido/);
    expect(send.execute).toHaveBeenCalledTimes(20);
    expect(c.disconnect).not.toHaveBeenCalled();
    // otra conexión no se ve afectada
    await gateway.onSend(client() as never, { conversationId: 'c1', content: 'hola' });
    expect(send.execute).toHaveBeenCalledTimes(21);
  });

  it('un socket sin identificar nunca consulta ni envía', async () => {
    const verify = jest.fn();
    const { gateway, send } = build(verify);
    const c = { data: {}, disconnect: jest.fn(), join: jest.fn() };
    await gateway.onSend(c as never, { conversationId: 'c1', content: 'hola' });
    expect(verify).not.toHaveBeenCalled();
    expect(send.execute).not.toHaveBeenCalled();
    expect(c.disconnect).toHaveBeenCalledWith(true);
  });

  it('al conectar entra solo a las salas de SUS conversaciones (sin esto no llegaría nada en vivo)', async () => {
    const { gateway, query, client } = build(jest.fn());
    const c = client(); c.data = {} as never;
    await gateway.handleConnection(c as never);
    expect(query.conversationIdsOf).toHaveBeenCalledWith('u1');
    expect(c.join.mock.calls.map((x: string[]) => x[0])).toEqual(['user:u1', 'conversation:c1', 'conversation:c2']);
  });

  it('una conversación nueva mete a sus miembros a la sala y les avisa para refrescar la lista', () => {
    const { gateway } = build(jest.fn());
    const socketsJoin = jest.fn(); const emit = jest.fn();
    (gateway as unknown as { server: unknown }).server = { in: jest.fn(() => ({ socketsJoin })), to: jest.fn(() => ({ emit })) };
    gateway.onConversationCreated({ conversationId: 'nueva', memberIds: ['ana', 'luis'] });
    expect(socketsJoin).toHaveBeenCalledTimes(2);
    expect(socketsJoin).toHaveBeenCalledWith('conversation:nueva');
    expect(emit).toHaveBeenCalledWith('conversation:new', { id: 'nueva' });
  });

  it('al conectar sin cookie desconecta; con cookie válida guarda usuario y sesión', async () => {
    const { gateway, cookies, client } = build(jest.fn());
    const ok = client(); ok.data = {} as never;
    await gateway.handleConnection(ok as never);
    expect(ok.data).toMatchObject({ userId: 'u1', sessionId: 's1' });
    cookies.readAccessFromHeader.mockReturnValue(undefined);
    const anon = client(); anon.data = {} as never;
    await gateway.handleConnection(anon as never);
    expect(anon.disconnect).toHaveBeenCalledWith(true);
  });
});
