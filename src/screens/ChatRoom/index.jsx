import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { fetchChatMessages, fetchChatRoom, fetchUsers, markChatRoomAsRead } from "../../services";
import { createChatSocketClient, sendChatRoomMessage, subscribeChatRoom } from "../../services/chatSocketService";

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

  const [chatRoom, setChatRoom] = useState(null);
  const [usersById, setUsersById] = useState({});
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [error, setError] = useState(null);
  const [socketError, setSocketError] = useState(null);

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
    } catch (requestError) {
      setChatRoom(null);
      setMessages([]);
      setUsersById({});
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
      setSocketReady(false);
      setSocketError(null);
    };
  }, [chatRoomId]);

  useEffect(() => {
    if (!socketReady || !chatRoomId || !clientRef.current) {
      return;
    }

    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = subscribeChatRoom(clientRef.current, chatRoomId, (message) => {
      setMessages((prev) => uniqueMessages([...prev, message]));
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
    if (messages.length === 0) {
      return;
    }

    scrollToBottom();
  }, [messages, scrollToBottom]);

  function handleSend() {
    const content = input.trim();
    if (!content || !chatRoomId) {
      return;
    }

    if (!clientRef.current?.connected) {
      setSocketError("소켓 연결이 아직 준비되지 않았습니다.");
      return;
    }

    setSocketError(null);
    setError(null);
    setInput("");
    sendChatRoomMessage(clientRef.current, chatRoomId, content);
  }

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
        data={messages}
        keyExtractor={(item) => String(item.id)}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        onContentSizeChange={() => scrollToBottom(false)}
        renderItem={({ item }) => {
          const mine = item.senderUserId === userId;
          return (
            <View style={[styles.messageRow, mine && styles.messageRowMine]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                <Text style={[styles.messageText, mine && styles.messageTextMine]}>{item.content}</Text>
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
