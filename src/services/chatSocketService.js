import { Client } from '@stomp/stompjs';
import { getAccessToken } from '../api/authTokenStore';
import { getChatWebSocketUrl } from '../api/config';

function debugLog(...args) {
  console.log("[CHAT SOCKET]", ...args);
}

function parsePayload(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export function createChatSocketClient({ onConnect, onError } = {}) {
  const token = getAccessToken();
  const websocketUrl = getChatWebSocketUrl();
  debugLog("INIT", {
    websocketUrl,
    hasAccessToken: Boolean(token),
    tokenPrefix: token ? token.slice(0, 10) : null,
  });

  const client = new Client({
    connectHeaders: {
      accessToken: token || '',
    },
    reconnectDelay: 200,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    webSocketFactory: () => {
      debugLog("OPEN_WEBSOCKET", websocketUrl);
      return new WebSocket(websocketUrl);
    },
  });

  client.onConnect = () => {
    debugLog("CONNECTED");
    if (typeof onConnect === 'function') {
      onConnect();
    }
  };

  client.onStompError = (frame) => {
    debugLog("STOMP_ERROR", {
      message: frame?.headers?.message || 'STOMP error',
      details: frame?.body || "",
    });
    if (typeof onError === 'function') {
      onError(frame?.headers?.message || 'STOMP error');
    }
  };

  client.onWebSocketError = (event) => {
    debugLog("WS_ERROR", event?.message || "WebSocket connection error");
    if (typeof onError === 'function') {
      onError('WebSocket connection error');
    }
  };

  client.onWebSocketClose = (event) => {
    debugLog("WS_CLOSE", {
      code: event?.code,
      reason: event?.reason,
      wasClean: event?.wasClean,
    });
    if (typeof onError === 'function') {
      onError('WebSocket disconnected, reconnecting...');
    }
  };

  return client;
}

export function subscribeChatRoom(client, chatRoomId, onMessage) {
  if (!client || !chatRoomId) {
    debugLog("SUBSCRIBE_CHATROOM_SKIPPED", { hasClient: Boolean(client), chatRoomId });
    return null;
  }

  const destination = `/topic/chatrooms/${chatRoomId}`;
  debugLog("SUBSCRIBE_CHATROOM", destination);
  return client.subscribe(`/topic/chatrooms/${chatRoomId}`, (frame) => {
    const payload = parsePayload(frame.body);
    const message = payload?.delivery?.message;
    debugLog("CHAT_EVENT_FRAME", message?.id || "-", message?.chatRoomId || "-");
    if (message && typeof onMessage === 'function') {
      onMessage(message);
    }
  });
}

export function sendChatRoomMessage(client, chatRoomId, content) {
  if (!client || !chatRoomId) {
    debugLog("SEND_MESSAGE_SKIPPED", { hasClient: Boolean(client), chatRoomId });
    return;
  }

  debugLog("SEND_MESSAGE", { chatRoomId, contentLength: String(content || "").length });
  client.publish({
    destination: `/app/chatrooms/${chatRoomId}/messages`,
    body: JSON.stringify({ content }),
  });
}
