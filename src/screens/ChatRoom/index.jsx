import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { fetchChatMessages, fetchChatRoom, fetchUsers, markChatRoomAsRead } from "../../services";
import { createChatSocketClient, sendChatRoomMessage, subscribeChatRoom } from "../../services/chatSocketService";

const PENDING_TIMEOUT_MS = 20000;

function formatClock(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function uniqueMessages(messages) {
  return [...messages]
    .filter((message) => message?.id)
    .sort((a, b) => String(a.createdDateTime || "").localeCompare(String(b.createdDateTime || "")))
    .filter((message, index, array) => array.findIndex((item) => item.id === message.id) === index);
}

export function ChatRoom({ navigation, route }) {
  const { token } = useAuth();
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const chatRoomId = Number(route?.params?.chatRoomId);
  const clientRef = useRef(null);
  const subscriptionRef = useRef(null);
  const messageListRef = useRef(null);
  const pendingTimeoutsRef = useRef(new Map());

  const [chatRoom, setChatRoom] = useState(null);
  const [usersById, setUsersById] = useState({});
  const [messages, setMessages] = useState([]);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [error, setError] = useState(null);
  const [socketError, setSocketError] = useState(null);

  const renderedMessages = useMemo(() => {
    return [...messages, ...pendingMessages].sort((a, b) => {
      return String(a.createdDateTime || "").localeCompare(String(b.createdDateTime || ""));
    });
  }, [messages, pendingMessages]);

  function clearPendingTimeout(localId) {
    const timeoutId = pendingTimeoutsRef.current.get(localId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingTimeoutsRef.current.delete(localId);
    }
  }

  function clearAllPendingTimeouts() {
    pendingTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingTimeoutsRef.current.clear();
  }

  const markAsReadSilently = useCallback(async () => {
    if (!Number.isFinite(chatRoomId) || chatRoomId <= 0) {
      return;
    }

    try {
      await markChatRoomAsRead(chatRoomId);
    } catch {
      // Keep the chat UI responsive even if read-sync fails transiently.
    }
  }, [chatRoomId]);

  const roomTitle = useMemo(() => {
    if (!chatRoom) {
      return "채팅";
    }

    if (chatRoom.name) {
      return chatRoom.name;
    }

    if (chatRoom.directChat) {
      const otherUserId = (chatRoom.participantUserIds || []).find((participantId) => participantId !== userId);
      if (otherUserId) {
        return usersById[otherUserId]?.name || `USER #${otherUserId}`;
      }
    }

    return `채팅방 #${chatRoom.id}`;
  }, [chatRoom, userId, usersById]);

  const headerAvatar = useMemo(() => {
    const participantIds = (chatRoom?.participantUserIds ?? []).filter((id) => Number(id) !== Number(userId));
    if (participantIds.length > 1) {
      return { type: "group" };
    }

    const otherUser = participantIds.length === 1 ? usersById[participantIds[0]] : null;
    if (otherUser?.profileImageUrl) {
      return { type: "image", imageUrl: otherUser.profileImageUrl };
    }

    return { type: "fallback" };
  }, [chatRoom?.participantUserIds, userId, usersById]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const loadChatRoom = useCallback(async () => {
    if (!Number.isFinite(chatRoomId) || chatRoomId <= 0) {
      setError("유효한 채팅방 정보가 없습니다.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [chatRoomResponse, chatMessagesResponse, usersResponse] = await Promise.all([
        fetchChatRoom(chatRoomId),
        fetchChatMessages(chatRoomId),
        fetchUsers(),
      ]);

      const loadedUsers = usersResponse?.users ?? [];
      const userMap = loadedUsers.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});

      setUsersById(userMap);
      setChatRoom(chatRoomResponse?.chatRoom || null);
      setMessages(uniqueMessages(chatMessagesResponse?.messages ?? []));
      setPendingMessages([]);
      clearAllPendingTimeouts();
    } catch (requestError) {
      setChatRoom(null);
      setMessages([]);
      setPendingMessages([]);
      setUsersById({});
      clearAllPendingTimeouts();
      setError(requestError?.message || "채팅 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [chatRoomId]);

  useEffect(() => {
    loadChatRoom();
  }, [loadChatRoom]);

  useEffect(() => {
    if (!Number.isFinite(chatRoomId) || chatRoomId <= 0) {
      return;
    }
    markAsReadSilently();
  }, [chatRoomId, markAsReadSilently]);

  useEffect(() => {
    if (!Number.isFinite(chatRoomId) || chatRoomId <= 0) {
      return;
    }

    const client = createChatSocketClient({
      onConnect: () => {
        setSocketReady(true);
        setSocketError(null);
      },
      onError: (message) => {
        setSocketReady(false);
        setSocketError(message || "WebSocket connection error");
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
      client.deactivate();
      clientRef.current = null;
      clearAllPendingTimeouts();
      setSocketReady(false);
      setSocketError(null);
    };
  }, [chatRoomId]);

  useEffect(() => {
    if (!socketReady || !chatRoomId || !clientRef.current) {
      return;
    }

    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = subscribeChatRoom(clientRef.current, chatRoomId, userId, (message) => {
      setMessages((prev) => uniqueMessages([...prev, message]));
      if (Number(message?.senderUserId) === Number(userId)) {
        setPendingMessages((previous) => {
          const next = [...previous];
          const matchedIndex = next.findIndex(
            (pending) =>
              pending.status !== "failed" &&
              String(pending.content || "").trim() === String(message?.content || "").trim(),
          );
          if (matchedIndex >= 0) {
            const matched = next[matchedIndex];
            clearPendingTimeout(matched.localId);
            next.splice(matchedIndex, 1);
          }
          return next;
        });
      }
      if (message?.senderUserId && Number(message.senderUserId) !== Number(userId)) {
        markAsReadSilently();
      }
    });

    return () => {
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [chatRoomId, socketReady, markAsReadSilently, userId]);

  useEffect(() => {
    if (renderedMessages.length === 0) {
      return;
    }

    scrollToBottom();
  }, [renderedMessages, scrollToBottom]);

  useEffect(() => {
    return () => {
      clearAllPendingTimeouts();
    };
  }, []);

  function queuePendingMessage(content) {
    const localId = `pending-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const pendingMessage = {
      id: localId,
      localId,
      content,
      translatedContent: null,
      senderUserId: userId,
      createdDateTime: new Date().toISOString(),
      pending: true,
      status: "pending",
    };

    setPendingMessages((previous) => [...previous, pendingMessage]);
    const timeoutId = setTimeout(() => {
      setPendingMessages((previous) =>
        previous.map((item) =>
          item.localId === localId && item.status === "pending"
            ? { ...item, status: "failed" }
            : item,
        ),
      );
      pendingTimeoutsRef.current.delete(localId);
    }, PENDING_TIMEOUT_MS);
    pendingTimeoutsRef.current.set(localId, timeoutId);
  }

  function sendMessageContent(rawContent) {
    const content = String(rawContent || "").trim();
    if (!content || !chatRoomId) {
      return;
    }

    if (!clientRef.current?.connected) {
      setSocketError("소켓 연결이 아직 준비되지 않았습니다.");
      return;
    }

    setSocketError(null);
    setError(null);
    queuePendingMessage(content);

    try {
      sendChatRoomMessage(clientRef.current, chatRoomId, content);
    } catch {
      setPendingMessages((previous) =>
        previous.map((item) =>
          item.content === content && item.status === "pending"
            ? { ...item, status: "failed" }
            : item,
        ),
      );
      setSocketError("메시지 전송에 실패했습니다.");
    }
  }

  function handleSend() {
    const content = input.trim();
    if (!content) {
      return;
    }

    setInput("");
    sendMessageContent(content);
  }

  function handleRetryPending(localId) {
    const target = pendingMessages.find((item) => item.localId === localId);
    if (!target) {
      return;
    }

    clearPendingTimeout(localId);
    setPendingMessages((previous) => previous.filter((item) => item.localId !== localId));
    sendMessageContent(target.content);
  }

  const hasPendingTranslation = pendingMessages.some((item) => item.status === "pending");

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <View style={styles.headerAvatarCircle}>
          {headerAvatar.type === "image" ? (
            <Image source={{ uri: headerAvatar.imageUrl }} style={styles.headerAvatarImage} />
          ) : headerAvatar.type === "group" ? (
            <Ionicons name="people" size={17} color="#1D4ED8" />
          ) : (
            <Ionicons name="person" size={17} color="#1D4ED8" />
          )}
        </View>
        <Text style={styles.headerTitle} numberOfLines={1}>{roomTitle}</Text>
        <Text style={[styles.socketState, socketReady ? styles.socketReady : styles.socketPending]}>
          {socketReady ? "LIVE" : "OFFLINE"}
        </Text>
      </View>

      {loading ? <Text style={styles.metaText}>메시지를 불러오는 중...</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {socketError ? <Text style={styles.errorText}>{socketError}</Text> : null}

      <FlatList
        ref={messageListRef}
        data={renderedMessages}
        keyExtractor={(item) => String(item.id)}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        onContentSizeChange={() => scrollToBottom(false)}
        renderItem={({ item }) => {
          const mine = item.senderUserId === userId;
          const isPending = Boolean(item.pending);
          const isFailed = item.status === "failed";
          return (
            <View style={[styles.messageRow, mine && styles.messageRowMine]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                <Text style={[styles.messageText, mine && styles.messageTextMine]}>
                  {item.translatedContent || item.content}
                </Text>
                {item.translatedContent && item.translatedContent !== item.content ? (
                  <Text style={[styles.messageOriginalText, mine && styles.messageOriginalTextMine]}>
                    {item.content}
                  </Text>
                ) : null}
                {mine && isPending ? (
                  <View style={styles.pendingRow}>
                    <Text style={[styles.pendingText, isFailed && styles.pendingTextFailed]}>
                      {isFailed ? "전송 실패" : "번역 및 전송 중..."}
                    </Text>
                    {isFailed ? (
                      <Pressable onPress={() => handleRetryPending(item.localId)}>
                        <Text style={styles.pendingRetryText}>재시도</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
                <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>{formatClock(item.createdDateTime)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={styles.metaText}>메시지가 없습니다.</Text> : null}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="메시지 입력"
          editable={Boolean(chatRoomId)}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Pressable style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]} onPress={handleSend} disabled={!input.trim()}>
          <Ionicons name="send" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      {hasPendingTranslation ? (
        <Text style={styles.sendingHintText}>메시지를 번역 중입니다. 잠시만 기다려주세요.</Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    paddingTop: 52,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  headerAvatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EAF2FF",
    borderWidth: 1,
    borderColor: "#CFE0FF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  headerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  headerTitle: {
    flex: 1,
    fontSize: 19,
    fontWeight: "700",
    color: "#111827",
  },
  socketState: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
  },
  socketReady: {
    color: "#FFFFFF",
    backgroundColor: "#1C73F0",
  },
  socketPending: {
    color: "#FFFFFF",
    backgroundColor: "#9CA3AF",
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },
  messageRow: {
    flexDirection: "row",
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "84%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bubbleOther: {
    backgroundColor: "#F1F5F9",
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: "#1D4ED8",
    borderBottomRightRadius: 4,
  },
  messageText: {
    color: "#0F172A",
    fontSize: 14,
    lineHeight: 19,
  },
  messageTextMine: {
    color: "#FFFFFF",
  },
  messageOriginalText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
  },
  messageOriginalTextMine: {
    color: "#DBEAFE",
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pendingText: {
    color: "#DBEAFE",
    fontSize: 11,
    fontWeight: "600",
  },
  pendingTextFailed: {
    color: "#FCA5A5",
  },
  pendingRetryText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  messageTime: {
    color: "#64748B",
    fontSize: 11,
    alignSelf: "flex-end",
  },
  messageTimeMine: {
    color: "#DBEAFE",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  input: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingHorizontal: 14,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1D4ED8",
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendingHintText: {
    marginTop: 6,
    color: "#64748B",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "600",
  },
  metaText: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 8,
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    marginBottom: 4,
  },
});
