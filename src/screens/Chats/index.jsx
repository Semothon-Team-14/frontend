import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { fetchChatMessages, fetchChatRooms, fetchUsers } from "../../services";
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

function formatRoomTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
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

export function Chats() {
  const { token } = useAuth();
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const clientRef = useRef(null);
  const subscriptionRef = useRef(null);
  const [rooms, setRooms] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [error, setError] = useState(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId],
  );

  const roomTitle = useMemo(() => {
    if (!selectedRoom) {
      return "채팅";
    }

    if (selectedRoom.name) {
      return selectedRoom.name;
    }

    if (selectedRoom.directChat) {
      const otherUserId = (selectedRoom.participantUserIds || []).find((participantId) => participantId !== userId);
      if (otherUserId) {
        return usersById[otherUserId]?.name || `USER #${otherUserId}`;
      }
    }

    return `그룹 채팅 ${selectedRoom.id}`;
  }, [selectedRoom, userId, usersById]);

  function roomListLabel(room) {
    if (room.name) {
      return room.name;
    }

    if (room.directChat) {
      const otherUserId = (room.participantUserIds || []).find((participantId) => participantId !== userId);
      if (otherUserId) {
        return usersById[otherUserId]?.name || `USER #${otherUserId}`;
      }
    }

    return `채팅방 #${room.id}`;
  }

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    setError(null);
    try {
      const [roomResponse, usersResponse] = await Promise.all([fetchChatRooms(), fetchUsers()]);
      const loadedRooms = roomResponse?.chatRooms ?? [];
      const loadedUsers = usersResponse?.users ?? [];
      const userMap = loadedUsers.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});

      setUsersById(userMap);
      setRooms(loadedRooms);
      setSelectedRoomId((prev) => {
        if (prev && loadedRooms.some((room) => room.id === prev)) {
          return prev;
        }

        return loadedRooms[0]?.id || null;
      });
    } catch (requestError) {
      setRooms([]);
      setUsersById({});
      setSelectedRoomId(null);
      setError(requestError?.message || "채팅방을 불러오지 못했습니다.");
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (chatRoomId) => {
    if (!chatRoomId) {
      setMessages([]);
      return;
    }

    setMessagesLoading(true);
    setError(null);
    try {
      const response = await fetchChatMessages(chatRoomId);
      setMessages(uniqueMessages(response?.messages ?? []));
    } catch (requestError) {
      setMessages([]);
      setError(requestError?.message || "메시지를 불러오지 못했습니다.");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRooms();
    }, [loadRooms]),
  );

  useEffect(() => {
    loadMessages(selectedRoomId);
  }, [selectedRoomId, loadMessages]);

  useEffect(() => {
    const client = createChatSocketClient({
      onConnect: () => setSocketReady(true),
      onError: (message) => setError(message),
    });

    clientRef.current = client;
    client.activate();

    return () => {
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
      client.deactivate();
      clientRef.current = null;
      setSocketReady(false);
    };
  }, []);

  useEffect(() => {
    if (!socketReady || !selectedRoomId || !clientRef.current) {
      return;
    }

    subscriptionRef.current?.unsubscribe();
    subscriptionRef.current = subscribeChatRoom(clientRef.current, selectedRoomId, (message) => {
      setMessages((prev) => uniqueMessages([...prev, message]));
      setRooms((prev) => {
        const nextRooms = prev.map((room) =>
          room.id === selectedRoomId ? { ...room, updatedDateTime: message.createdDateTime || room.updatedDateTime } : room,
        );
        return [...nextRooms].sort((a, b) => String(b.updatedDateTime || "").localeCompare(String(a.updatedDateTime || "")));
      });
    });

    return () => {
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [selectedRoomId, socketReady]);

  async function handleSend() {
    const content = input.trim();
    if (!content || !selectedRoomId) {
      return;
    }

    if (!clientRef.current?.connected) {
      setError("소켓 연결이 아직 준비되지 않았습니다.");
      return;
    }

    setError(null);
    setInput("");
    sendChatRoomMessage(clientRef.current, selectedRoomId, content);
  }

  return (
    <View style={styles.container}>
      <View style={styles.mainSplit}>
        <View style={styles.roomsPane}>
          <View style={styles.roomsHeader}>
            <Text style={styles.roomsTitle}>채팅방</Text>
            <Pressable onPress={loadRooms}>
              <Ionicons name="refresh" size={18} color="#1C73F0" />
            </Pressable>
          </View>
          {roomsLoading ? <Text style={styles.metaText}>불러오는 중...</Text> : null}
          {!roomsLoading && rooms.length === 0 ? <Text style={styles.metaText}>참여 중인 채팅방이 없습니다.</Text> : null}
          <FlatList
            data={rooms}
            keyExtractor={(item) => String(item.id)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.roomList}
            renderItem={({ item }) => {
              const selected = item.id === selectedRoomId;
              return (
                <Pressable style={[styles.roomItem, selected && styles.roomItemActive]} onPress={() => setSelectedRoomId(item.id)}>
                  <Text style={[styles.roomName, selected && styles.roomNameActive]} numberOfLines={1}>{roomListLabel(item)}</Text>
                  <Text style={[styles.roomTime, selected && styles.roomTimeActive]}>{formatRoomTime(item.updatedDateTime)}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        <View style={styles.chatPane}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatTitle} numberOfLines={1}>{roomTitle}</Text>
            <Text style={[styles.socketState, socketReady ? styles.socketReady : styles.socketPending]}>
              {socketReady ? "LIVE" : "OFFLINE"}
            </Text>
          </View>

          {messagesLoading ? <Text style={styles.metaText}>메시지를 불러오는 중...</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <FlatList
            data={messages}
            keyExtractor={(item) => String(item.id)}
            style={styles.messageList}
            contentContainerStyle={styles.messageContent}
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
            ListEmptyComponent={!messagesLoading ? <Text style={styles.metaText}>메시지가 없습니다.</Text> : null}
          />

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder={selectedRoomId ? "메시지를 입력하세요" : "채팅방을 선택하세요"}
              editable={Boolean(selectedRoomId)}
              multiline
            />
            <Pressable style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]} onPress={handleSend} disabled={!input.trim()}>
              <Ionicons name="send" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F2F5",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  mainSplit: {
    flex: 1,
    gap: 10,
  },
  roomsPane: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 12,
    maxHeight: 240,
  },
  roomsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  roomsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  roomList: {
    gap: 8,
  },
  roomItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EBECF0",
    backgroundColor: "#F8F9FC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  roomItemActive: {
    borderColor: "#1C73F0",
    backgroundColor: "#EAF2FF",
  },
  roomName: {
    fontSize: 14,
    color: "#222",
    fontWeight: "700",
  },
  roomNameActive: {
    color: "#1C73F0",
  },
  roomTime: {
    fontSize: 12,
    color: "#7B7B7B",
  },
  roomTimeActive: {
    color: "#1C73F0",
  },
  chatPane: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 12,
  },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  chatTitle: {
    flex: 1,
    marginRight: 8,
    fontSize: 17,
    fontWeight: "700",
    color: "#111",
  },
  socketState: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: "hidden",
  },
  socketReady: {
    color: "#fff",
    backgroundColor: "#1C73F0",
  },
  socketPending: {
    color: "#fff",
    backgroundColor: "#9CA3AF",
  },
  messageList: {
    flex: 1,
  },
  messageContent: {
    gap: 8,
    paddingVertical: 6,
  },
  messageRow: {
    alignItems: "flex-start",
  },
  messageRowMine: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bubbleOther: {
    backgroundColor: "#F1F2F5",
  },
  bubbleMine: {
    backgroundColor: "#1C73F0",
  },
  messageText: {
    color: "#171717",
    fontSize: 14,
    lineHeight: 19,
  },
  messageTextMine: {
    color: "#fff",
  },
  messageTime: {
    fontSize: 11,
    color: "#8A8A8A",
  },
  messageTimeMine: {
    color: "#DDEAFF",
  },
  metaText: {
    color: "#8A8A8A",
    fontSize: 13,
    marginBottom: 8,
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    marginBottom: 8,
  },
  inputRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    backgroundColor: "#F1F2F5",
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1C73F0",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
