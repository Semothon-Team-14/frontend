import { Client } from "@stomp/stompjs";
import { getAccessToken } from "../api/authTokenStore";
import { getChatWebSocketUrl } from "../api/config";

function debugLog(...args) {
  console.log("[QM SOCKET]", ...args);
}

function parsePayload(rawBody) {
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

export function createQuickMatchSocketClient({ onConnect, onError, accessToken } = {}) {
  const token = accessToken || getAccessToken();
  const websocketUrl = getChatWebSocketUrl();
  debugLog("INIT", {
    websocketUrl,
    hasAccessToken: Boolean(token),
    tokenPrefix: token ? token.slice(0, 10) : null,
  });

  const client = new Client({
    connectHeaders: {
      accessToken: token || "",
      Authorization: token ? `Bearer ${token}` : "",
    },
    reconnectDelay: 1500,
    connectionTimeout: 6000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    debug: (message) => {
      debugLog("STOMP_DEBUG", message);
    },
    webSocketFactory: () => {
      debugLog("OPEN_WEBSOCKET", websocketUrl);
      return new WebSocket(websocketUrl, ["v12.stomp", "v11.stomp", "v10.stomp"]);
    },
  });
  // React Native WebSocket can mishandle STOMP text frame NULL terminators.
  // Force binary frames to keep STOMP frame boundaries intact.
  client.forceBinaryWSFrames = true;
  client.appendMissingNULLonIncoming = true;

  client.onConnect = () => {
    debugLog("CONNECTED");
    if (typeof onConnect === "function") {
      onConnect();
    }
  };

  client.onStompError = (frame) => {
    debugLog("STOMP_ERROR", {
      message: frame?.headers?.message || "STOMP error",
      details: frame?.body || "",
    });
    if (typeof onError === "function") {
      onError(frame?.headers?.message || "STOMP error");
    }
  };

  client.onWebSocketError = (event) => {
    debugLog("WS_ERROR", event?.message || "WebSocket connection error");
    if (typeof onError === "function") {
      onError("WebSocket connection error");
    }
  };

  client.onWebSocketClose = (event) => {
    debugLog("WS_CLOSE", {
      code: event?.code,
      reason: event?.reason,
      wasClean: event?.wasClean,
    });
    if (typeof onError === "function") {
      onError("WebSocket disconnected, reconnecting...");
    }
  };

  client.onUnhandledFrame = (frame) => {
    debugLog("UNHANDLED_FRAME", frame?.headers || {}, frame?.body || "");
  };

  client.onUnhandledMessage = (message) => {
    debugLog("UNHANDLED_MESSAGE", message?.headers || {}, message?.body || "");
  };

  client.onUnhandledReceipt = (receipt) => {
    debugLog("UNHANDLED_RECEIPT", receipt);
  };

  client.onChangeState = (state) => {
    debugLog("STATE", state);
  };

  return client;
}

export function subscribeCityQuickMatches(client, cityId, onEvent) {
  if (!client || !cityId) {
    debugLog("SUBSCRIBE_CITY_SKIPPED", { hasClient: Boolean(client), cityId });
    return null;
  }

  const destination = `/topic/cities/${cityId}/quick-matches`;
  debugLog("SUBSCRIBE_CITY", destination);
  return client.subscribe(`/topic/cities/${cityId}/quick-matches`, (frame) => {
    const payload = parsePayload(frame.body);
    debugLog("CITY_EVENT_FRAME", payload?.eventType || "-", payload?.quickMatch?.id || "-");
    if (payload && typeof onEvent === "function") {
      onEvent(payload);
    }
  });
}

export function subscribeUserQuickMatches(client, userId, onEvent) {
  if (!client || !userId) {
    debugLog("SUBSCRIBE_USER_SKIPPED", { hasClient: Boolean(client), userId });
    return null;
  }

  const destination = `/topic/users/${userId}/quick-matches`;
  debugLog("SUBSCRIBE_USER", destination);
  return client.subscribe(`/topic/users/${userId}/quick-matches`, (frame) => {
    const payload = parsePayload(frame.body);
    debugLog("USER_EVENT_FRAME", payload?.eventType || "-", payload?.quickMatch?.id || "-");
    if (payload && typeof onEvent === "function") {
      onEvent(payload);
    }
  });
}

function publishWithReceipt(client, destination, body) {
  return new Promise((resolve, reject) => {
    if (!client?.connected) {
      reject(new Error("WebSocket is not connected"));
      return;
    }

    const receipt = `rcpt-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    const timeoutId = setTimeout(() => {
      reject(new Error("WebSocket receipt timeout"));
    }, 6000);

    client.watchForReceipt(receipt, () => {
      clearTimeout(timeoutId);
      resolve();
    });

    try {
      client.publish({
        destination,
        headers: { receipt },
        body: JSON.stringify(body || {}),
      });
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

export function publishCreateQuickMatch(client, payload) {
  debugLog("PUBLISH_CREATE", payload?.cityId);
  return publishWithReceipt(client, "/app/quick-matches", payload);
}

export function publishAcceptQuickMatch(client, quickMatchId) {
  debugLog("PUBLISH_ACCEPT", quickMatchId);
  return publishWithReceipt(client, `/app/quick-matches/${quickMatchId}/accept`, {});
}

export function publishDeclineQuickMatch(client, quickMatchId) {
  debugLog("PUBLISH_DECLINE", quickMatchId);
  return publishWithReceipt(client, `/app/quick-matches/${quickMatchId}/decline`, {});
}
