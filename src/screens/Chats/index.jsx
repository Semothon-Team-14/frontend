import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { fetchChatRooms, fetchUsers } from "../../services";

const TAB_LOCAL = "LOCAL";
const TAB_TRAVELER = "TRAVELER";

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

function roomSubtitle(room) {
  if (room.directChat) {
    return "1:1 밍글 채팅";
  }

  return room.mingleId ? "여행 밍글 채팅" : "그룹 채팅";
}

export function Chats({ navigation, route }) {
  const { token } = useAuth();
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const [rooms, setRooms] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_LOCAL);
  const handledAutoOpenRef = useRef(new Set());

  const localRooms = useMemo(() => rooms.filter((room) => room?.directChat), [rooms]);
  const travelerRooms = useMemo(() => rooms.filter((room) => !room?.directChat), [rooms]);
  const visibleRooms = activeTab === TAB_LOCAL ? localRooms : travelerRooms;

  const roomListLabel = useCallback((room) => {
    if (room?.name) {
      return room.name;
    }

    if (room?.directChat) {
      const otherUserId = (room?.participantUserIds || []).find((participantId) => participantId !== userId);
      if (otherUserId) {
        return usersById[otherUserId]?.name || `USER #${otherUserId}`;
      }
    }

    return `채팅방 #${room?.id}`;
  }, [userId, usersById]);

  const roomAvatarData = useCallback((room) => {
    const participantIds = (room?.participantUserIds ?? []).filter((id) => Number(id) !== Number(userId));
    if (participantIds.length > 1) {
      return { type: "group" };
    }

    const otherUserId = participantIds[0];
    const otherUser = otherUserId ? usersById[otherUserId] : null;
    if (otherUser?.profileImageUrl) {
      return { type: "image", imageUrl: otherUser.profileImageUrl };
    }

    return { type: "fallback" };
  }, [userId, usersById]);

  const loadRooms = useCallback(async () => {
    setLoading(true);
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
    } catch (requestError) {
      setRooms([]);
      setUsersById({});
      setError(requestError?.message || "채팅방을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRooms();
    }, [loadRooms]),
  );

  useEffect(() => {
    const requestedChatRoomId = Number(route?.params?.chatRoomId);
    if (!Number.isFinite(requestedChatRoomId) || requestedChatRoomId <= 0) {
      return;
    }

    if (handledAutoOpenRef.current.has(requestedChatRoomId)) {
      return;
    }

    if (!rooms.some((room) => room.id === requestedChatRoomId)) {
      return;
    }

    handledAutoOpenRef.current.add(requestedChatRoomId);
    navigation.navigate("ChatRoom", { chatRoomId: requestedChatRoomId });
  }, [navigation, rooms, route?.params?.chatRoomId]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>채팅</Text>
        <Pressable onPress={loadRooms} style={styles.refreshButton}>
          <Ionicons name="refresh" size={18} color="#1C73F0" />
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, activeTab === TAB_LOCAL && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_LOCAL)}
        >
          <Text style={[styles.tabText, activeTab === TAB_LOCAL && styles.tabTextActive]}>로컬 밍글러</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === TAB_TRAVELER && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_TRAVELER)}
        >
          <Text style={[styles.tabText, activeTab === TAB_TRAVELER && styles.tabTextActive]}>여행자 밍글러</Text>
        </Pressable>
      </View>

      {loading ? <Text style={styles.metaText}>불러오는 중...</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={visibleRooms}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const title = roomListLabel(item);
          const avatar = roomAvatarData(item);
          return (
            <Pressable
              style={styles.roomItem}
              onPress={() => navigation.navigate("ChatRoom", { chatRoomId: item.id })}
            >
              <View style={styles.avatarCircle}>
                {avatar.type === "image" ? (
                  <Image source={{ uri: avatar.imageUrl }} style={styles.avatarImage} />
                ) : avatar.type === "group" ? (
                  <Ionicons name="people" size={18} color="#1D4ED8" />
                ) : (
                  <Ionicons name="person" size={18} color="#1D4ED8" />
                )}
              </View>

              <View style={styles.roomMain}>
                <View style={styles.roomTopRow}>
                  <Text style={styles.roomName} numberOfLines={1}>{title}</Text>
                  <View style={styles.roomMetaWrap}>
                    <Text style={styles.roomTime}>{formatRoomTime(item.updatedDateTime)}</Text>
                    {Number(item?.unreadMessageCount || 0) > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {Number(item.unreadMessageCount) > 99 ? "99+" : String(item.unreadMessageCount)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.roomSubtitle} numberOfLines={1}>{roomSubtitle(item)}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={styles.metaText}>표시할 채팅방이 없습니다.</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  refreshButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tabRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tabButton: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: "#1D4ED8",
  },
  tabText: {
    color: "#4B5563",
    fontSize: 14,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    gap: 10,
    paddingBottom: 16,
  },
  roomItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EAF2FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CFE0FF",
  },
  avatarText: {
    color: "#1D4ED8",
    fontSize: 16,
    fontWeight: "700",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  roomMain: {
    flex: 1,
  },
  roomTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  roomName: {
    flex: 1,
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  roomTime: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "500",
  },
  roomMetaWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  roomSubtitle: {
    marginTop: 3,
    color: "#6B7280",
    fontSize: 12,
  },
  metaText: {
    color: "#6B7280",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    marginBottom: 8,
  },
});
