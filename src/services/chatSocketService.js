import { Client } from '@stomp/stompjs';
import { getAccessToken } from '../api/authTokenStore';
import { getChatWebSocketUrl } from '../api/config';

function parsePayload(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export function createChatSocketClient({ onConnect, onError } = {}) {
  const token = getAccessToken();
  const client = new Client({
    connectHeaders: {
      accessToken: token || '',
    },
    reconnectDelay: 200,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    webSocketFactory: () => new WebSocket(getChatWebSocketUrl()),
  });

  client.onConnect = () => {
    if (typeof onConnect === 'function') {
      onConnect();
    }
  };

  client.onStompError = (frame) => {
    if (typeof onError === 'function') {
      onError(frame?.headers?.message || 'STOMP error');
    }
  };

  client.onWebSocketError = () => {
    if (typeof onError === 'function') {
      onError('WebSocket connection error');
    }
  };

  client.onWebSocketClose = () => {
    if (typeof onError === 'function') {
      onError('WebSocket disconnected, reconnecting...');
    }
  };

  return client;
}

export function subscribeChatRoom(client, chatRoomId, onMessage) {
  if (!client || !chatRoomId) {
    return null;
  }

  return client.subscribe(`/topic/chatrooms/${chatRoomId}`, (frame) => {
    const payload = parsePayload(frame.body);
    const message = payload?.delivery?.message;
    if (message && typeof onMessage === 'function') {
      onMessage(message);
    }
  });
}

export function sendChatRoomMessage(client, chatRoomId, content) {
  if (!client || !chatRoomId) {
    return;
  }

  client.publish({
    destination: `/app/chatrooms/${chatRoomId}/messages`,
    body: JSON.stringify({ content }),
  });
}
