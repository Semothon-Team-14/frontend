import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { useLocale } from "../../locale";
import {
  fetchChatMessages,
  fetchChatRoom,
  fetchUsers,
  markChatRoomAsRead,
} from "../../services";
import {
  createChatSocketClient,
  sendChatRoomMessage,
  subscribeChatRoom,
} from "../../services/chatSocketService";

const PENDING_TIMEOUT_MS = 20000;

function formatClock(value, locale) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function uniqueMessages(messages) {
  return [...messages]
    .filter((message) => message?.id)
    .sort((a, b) => {
      const aMs = Date.parse(String(a?.createdDateTime || ""));
      const bMs = Date.parse(String(b?.createdDateTime || ""));
      const safeAMs = Number.isFinite(aMs) ? aMs : 0;
      const safeBMs = Number.isFinite(bMs) ? bMs : 0;
      if (safeAMs !== safeBMs) {
        return safeAMs - safeBMs;
      }
      return String(a?.id || "").localeCompare(String(b?.id || ""));
    })
    .filter(
      (message, index, array) =>
        array.findIndex((item) => item.id === message.id) === index,
    );
}

export function ChatRoom({ navigation, route }) {
  const { token } = useAuth();
  const { tx, locale } = useLocale();
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
      const aMs = Date.parse(String(a?.createdDateTime || ""));
      const bMs = Date.parse(String(b?.createdDateTime || ""));
      const safeAMs = Number.isFinite(aMs) ? aMs : 0;
      const safeBMs = Number.isFinite(bMs) ? bMs : 0;
      if (safeAMs !== safeBMs) {
        return safeAMs - safeBMs;
      }
      const aOrder = Number(a?.clientOrder || 0);
      const bOrder = Number(b?.clientOrder || 0);
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return String(a?.id || "").localeCompare(String(b?.id || ""));
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
      return tx("채팅", "Chat");
    }

    if (chatRoom.name) {
      return chatRoom.name;
    }

    if (chatRoom.directChat) {
      const otherUserId = (chatRoom.participantUserIds || []).find(
        (participantId) => participantId !== userId,
      );
      if (otherUserId) {
        return usersById[otherUserId]?.name || `USER #${otherUserId}`;
      }
    }

    return tx(`채팅방 #${chatRoom.id}`, `Chat #${chatRoom.id}`);
  }, [chatRoom, tx, userId, usersById]);

  const roomNoticeText = useMemo(() => {
    return tx("반가워요! ", "Welcome! ");
  }, [tx]);

  const scrollToBottom = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const loadChatRoom = useCallback(async () => {
    if (!Number.isFinite(chatRoomId) || chatRoomId <= 0) {
      setError(tx("유효한 채팅방 정보가 없습니다.", "Invalid chat room."));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [chatRoomResponse, chatMessagesResponse, usersResponse] =
        await Promise.all([
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
      setError(requestError?.message || tx("채팅 정보를 불러오지 못했습니다.", "Failed to load chat."));
    } finally {
      setLoading(false);
    }
  }, [chatRoomId, tx]);

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
    subscriptionRef.current = subscribeChatRoom(
      clientRef.current,
      chatRoomId,
      userId,
      (message) => {
        setMessages((prev) => uniqueMessages([...prev, message]));
        if (Number(message?.senderUserId) === Number(userId)) {
          setPendingMessages((previous) => {
            const next = [...previous];
            const matchedIndex = next.findIndex(
              (pending) =>
                pending.status !== "failed" &&
                String(pending.content || "").trim() ===
                  String(message?.content || "").trim(),
            );
            if (matchedIndex >= 0) {
              const matched = next[matchedIndex];
              clearPendingTimeout(matched.localId);
              next.splice(matchedIndex, 1);
            }
            return next;
          });
        }
        if (
          message?.senderUserId &&
          Number(message.senderUserId) !== Number(userId)
        ) {
          markAsReadSilently();
        }
      },
    );

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
      clientOrder: Date.now(),
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
      setSocketError(tx("소켓 연결이 아직 준비되지 않았습니다.", "Socket is not ready yet."));
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
      setSocketError(tx("메시지 전송에 실패했습니다.", "Failed to send message."));
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
    setPendingMessages((previous) =>
      previous.filter((item) => item.localId !== localId),
    );
    sendMessageContent(target.content);
  }

  const hasPendingTranslation = pendingMessages.some(
    (item) => item.status === "pending",
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
    >
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {roomTitle}
        </Text>
      </View>
      <Text style={styles.noticeText}>
        {roomNoticeText}
        <Text style={styles.noticeTextHighlight}>{roomTitle}</Text>
        {tx(" 님이 밍글을 수락했어요!", " accepted your mingle request!")}
      </Text>

      {loading ? <Text style={styles.metaText}>{tx("메시지를 불러오는 중...", "Loading messages...")}</Text> : null}
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
          const hasTranslatedPair =
            Boolean(item.translatedContent) &&
            item.translatedContent !== item.content;

          return (
            <View style={[styles.messageRow, mine && styles.messageRowMine]}>
              {mine ? (
                <Text style={[styles.messageTimeOutside, styles.messageTimeOutsideOther]}>
                  {formatClock(item.createdDateTime, locale)}
                </Text>
              ) : null}
              <View
                style={[
                  styles.bubble,
                  mine ? styles.bubbleMine : styles.bubbleOther,
                ]}
              >
                {!mine && hasTranslatedPair ? (
                  <>
                    <Text style={styles.messageTextOtherOriginal}>{item.content}</Text>
                    <Text style={styles.messageTextOtherTranslated}>{item.translatedContent}</Text>
                  </>
                ) : (
                  <Text
                    style={[
                      styles.messageText,
                      mine ? styles.messageTextMine : styles.messageTextOther,
                    ]}
                  >
                    {mine ? item.content : (item.translatedContent || item.content)}
                  </Text>
                )}
                {mine && isPending ? (
                  <View style={styles.pendingRow}>
                    <Text
                      style={[
                        styles.pendingText,
                        isFailed && styles.pendingTextFailed,
                      ]}
                    >
                      {isFailed ? tx("전송 실패", "Send failed") : tx("번역 및 전송 중...", "Translating and sending...")}
                    </Text>
                    {isFailed ? (
                      <Pressable
                        onPress={() => handleRetryPending(item.localId)}
                      >
                        <Text style={styles.pendingRetryText}>{tx("재시도", "Retry")}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {!mine ? (
                <Text style={[styles.messageTimeOutside, styles.messageTimeOutsideMine]}>
                  {formatClock(item.createdDateTime, locale)}
                </Text>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.metaText}>{tx("메시지가 없습니다.", "No messages yet.")}</Text>
          ) : null
        }
      />

      <View style={styles.inputRow}>
        <Pressable style={styles.plusButton}>
          <Ionicons name="add" size={20} color="#8F9AAF" />
        </Pressable>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={tx("메시지 입력", "Type a message")}
          placeholderTextColor="#9CA3AF"
          editable={Boolean(chatRoomId)}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <Pressable
          style={[
            styles.sendButton,
            !input.trim() && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!input.trim()}
        >
          <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
      {hasPendingTranslation ? (
        <Text style={styles.sendingHintText}>
          {tx("메시지를 번역 중입니다. 잠시만 기다려주세요.", "Translating message. Please wait.")}
        </Text>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F4F8",
    paddingTop: 52,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 4,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  noticeText: {
    textAlign: "center",
    color: "#CFD5DF",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 10,
  },
  noticeTextHighlight: {
    color: "#6AA8FF",
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    paddingTop: 6,
    paddingBottom: 10,
    gap: 8,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
  },
  bubbleOther: {
    backgroundColor: "#D9E0EB",
    borderBottomLeftRadius: 8,
  },
  bubbleMine: {
    backgroundColor: "#0F6BFF",
    borderBottomRightRadius: 8,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 19,
  },
  messageTextOther: {
    color: "#111827",
  },
  messageTextMine: {
    color: "#FFFFFF",
  },
  messageTextOtherOriginal: {
    color: "#111827",
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "600",
  },
  messageTextOtherTranslated: {
    color: "#1D70FF",
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "700",
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
  messageTimeOutside: {
    color: "#98A3B7",
    fontSize: 10,
    marginBottom: 4,
    minWidth: 36,
  },
  messageTimeOutsideOther: {
    marginRight: 6,
    textAlign: "right",
  },
  messageTimeOutsideMine: {
    marginLeft: 6,
    textAlign: "left",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 22,
    backgroundColor: "#C8CFDB",
    borderRadius: 18,
    paddingHorizontal: 6,
    height: 40,
  },
  plusButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCE2EC",
  },
  input: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 0,
    paddingHorizontal: 6,
    backgroundColor: "transparent",
    fontSize: 14,
    color: "#5E687B",
  },
  sendButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F6BFF",
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
