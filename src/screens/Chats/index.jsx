import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { useLocale } from "../../locale";
import { fetchChatRooms, fetchMingles, fetchUsers } from "../../services";
import {
  getCurrentHomeMode,
  HOME_MODE_LOCAL,
  HOME_MODE_TRAVELER,
  subscribeHomeMode,
} from "../../state/homeMode";

const TAB_LOCAL = "LOCAL";
const TAB_TRAVELER = "TRAVELER";

function formatRelativeRoomTime(value, locale) {
  if (!value) {
    return locale === "ko" ? "방금 전" : "Just now";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return locale === "ko" ? "방금 전" : "Just now";
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60000) {
    return locale === "ko" ? "방금 전" : "Just now";
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    return locale === "ko" ? `${minutes}분 전` : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return locale === "ko" ? `${hours}시간 전` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return locale === "ko" ? `${days}일 전` : `${days}d ago`;
}

function roomSubtitle(room, tx) {
  if (room.directChat) {
    return tx("밍글 수락됨", "Mingle accepted");
  }

  return room.mingleId
    ? tx("여행 밍글 채팅", "Trip chat")
    : tx("그룹 채팅", "Group chat");
}

export function Chats({ navigation, route }) {
  const { token } = useAuth();
  const { tx, locale } = useLocale();
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const [rooms, setRooms] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [mingleTitleById, setMingleTitleById] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_LOCAL);
  const [homeMode, setHomeMode] = useState(getCurrentHomeMode());
  const handledAutoOpenRef = useRef(new Set());

  const roomTabTypeById = useMemo(() => {
    const mapping = {};
    rooms.forEach((room) => {
      const participantCount = Number(room?.participantUserIds?.length || 0);
      if (participantCount > 2) {
        mapping[room.id] = TAB_TRAVELER;
        return;
      }

      if (participantCount === 2) {
        const opponentLocal = room?.otherParticipantLocal === true;
        const opponentTraveler = room?.otherParticipantTraveler === true;
        if (homeMode === HOME_MODE_TRAVELER) {
          mapping[room.id] = opponentLocal ? TAB_LOCAL : TAB_TRAVELER;
          return;
        }

        if (homeMode === HOME_MODE_LOCAL) {
          mapping[room.id] = opponentTraveler ? TAB_TRAVELER : TAB_LOCAL;
          return;
        }

        mapping[room.id] = opponentLocal ? TAB_LOCAL : TAB_TRAVELER;
        return;
      }
      mapping[room.id] = TAB_TRAVELER;
    });
    return mapping;
  }, [homeMode, rooms]);

  const localRooms = useMemo(
    () => rooms.filter((room) => roomTabTypeById[room?.id] === TAB_LOCAL),
    [roomTabTypeById, rooms],
  );
  const travelerRooms = useMemo(
    () => rooms.filter((room) => roomTabTypeById[room?.id] !== TAB_LOCAL),
    [roomTabTypeById, rooms],
  );
  const visibleRooms = activeTab === TAB_LOCAL ? localRooms : travelerRooms;

  const roomListLabel = useCallback(
    (room) => {
      if (room?.name) {
        return room.name;
      }

      if (room?.mingleId) {
        const mingleTitle = mingleTitleById[Number(room.mingleId)];
        if (mingleTitle) {
          return mingleTitle;
        }
      }

      if (room?.directChat) {
        const otherUserId = (room?.participantUserIds || []).find(
          (participantId) => participantId !== userId,
        );
        if (otherUserId) {
          return usersById[otherUserId]?.name || `USER #${otherUserId}`;
        }
      }

      return tx(`채팅방 #${room?.id}`, `Chat #${room?.id}`);
    },
    [mingleTitleById, tx, userId, usersById],
  );

  const roomAvatarData = useCallback(
    (room) => {
      const participantIds = (room?.participantUserIds ?? []).filter(
        (id) => Number(id) !== Number(userId),
      );
      if (participantIds.length > 1) {
        return { type: "group" };
      }

      const otherUserId = participantIds[0];
      const otherUser = otherUserId ? usersById[otherUserId] : null;
      if (otherUser?.profileImageUrl) {
        return { type: "image", imageUrl: otherUser.profileImageUrl };
      }

      return { type: "fallback" };
    },
    [userId, usersById],
  );

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [roomResponse, usersResponse, minglesResponse] = await Promise.all([
        fetchChatRooms(),
        fetchUsers(),
        fetchMingles(),
      ]);
      const loadedRooms = roomResponse?.chatRooms ?? [];
      const loadedUsers = usersResponse?.users ?? [];
      const loadedMingles = minglesResponse?.mingles ?? [];
      const mingleTitleMap = loadedMingles.reduce((acc, mingle) => {
        const mingleId = Number(mingle?.id || 0);
        const title = String(mingle?.title || "").trim();
        if (mingleId > 0 && title.length > 0) {
          acc[mingleId] = title;
        }
        return acc;
      }, {});
      const userMap = loadedUsers.reduce((acc, user) => {
        acc[user.id] = user;
        return acc;
      }, {});

      setUsersById(userMap);
      setMingleTitleById(mingleTitleMap);
      setRooms(loadedRooms);
    } catch (requestError) {
      setRooms([]);
      setUsersById({});
      setMingleTitleById({});
      setError(
        requestError?.message ||
          tx("채팅방을 불러오지 못했습니다.", "Failed to load chat rooms."),
      );
    } finally {
      setLoading(false);
    }
  }, [tx]);

  useFocusEffect(
    useCallback(() => {
      loadRooms();
    }, [loadRooms]),
  );

  useEffect(() => {
    return subscribeHomeMode((nextMode) => {
      setHomeMode(nextMode);
    });
  }, []);

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
        <Text style={styles.headerTitle}>{tx("채팅", "Chats")}</Text>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          style={[
            styles.tabButton,
            activeTab === TAB_LOCAL && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab(TAB_LOCAL)}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === TAB_LOCAL && styles.tabTextActive,
            ]}
          >
            {tx("로컬 밍글러", "Local")}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.tabButton,
            activeTab === TAB_TRAVELER && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab(TAB_TRAVELER)}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === TAB_TRAVELER && styles.tabTextActive,
            ]}
          >
            {tx("여행자 밍글러", "Traveler")}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={styles.metaText}>
          {tx("불러오는 중...", "Loading...")}
        </Text>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={visibleRooms}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const title = roomListLabel(item);
          const avatar = roomAvatarData(item);
          const relativeTime = formatRelativeRoomTime(
            item.updatedDateTime,
            locale,
          );
          const memberCount = Number(item?.participantUserIds?.length || 0);
          const showMemberCount = !item?.directChat && memberCount > 0;
          return (
            <Pressable
              style={styles.roomItem}
              onPress={() =>
                navigation.navigate("ChatRoom", { chatRoomId: item.id })
              }
            >
              <View style={styles.avatarCircle}>
                {avatar.type === "image" ? (
                  <Image
                    source={{ uri: avatar.imageUrl }}
                    style={styles.avatarImage}
                  />
                ) : avatar.type === "group" ? (
                  <Ionicons name="people" size={20} color="#1D4ED8" />
                ) : (
                  <Ionicons name="person" size={20} color="#1D4ED8" />
                )}
              </View>

              <View style={styles.roomMain}>
                <View style={styles.roomNameRow}>
                  <Text style={styles.roomName} numberOfLines={1}>
                    {title}
                  </Text>
                  {showMemberCount ? (
                    <Text style={styles.roomMemberCount}>{memberCount}</Text>
                  ) : null}
                </View>
                <Text style={styles.roomSubtitle} numberOfLines={1}>
                  {roomSubtitle(item, tx)} · {relativeTime}
                </Text>
              </View>

              {Number(item?.unreadMessageCount || 0) > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {Number(item.unreadMessageCount) > 99
                      ? "99+"
                      : String(item.unreadMessageCount)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.metaText}>
              {tx("표시할 채팅방이 없습니다.", "No chat rooms yet.")}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F3F6",
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1A1C21",
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  tabButton: {
    height: 25,
    borderRadius: 12.5,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    paddingHorizontal: 11,
    backgroundColor: "#E9ECF2",
  },
  tabButtonActive: {
    backgroundColor: "#1C73F0",
  },
  tabText: {
    color: "#8A95A8",
    fontSize: 10.5,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    gap: 2,
    paddingBottom: 16,
  },
  roomItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 2,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#CDD5E3",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  roomMain: {
    flex: 1,
    marginRight: 8,
  },
  roomNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  roomName: {
    maxWidth: "86%",
    color: "#171A21",
    fontSize: 13,
    fontWeight: "800",
  },
  roomMemberCount: {
    color: "#1C73F0",
    fontSize: 14,
    fontWeight: "800",
  },
  roomSubtitle: {
    marginTop: 2,
    color: "#A0A8B8",
    fontSize: 11.5,
    fontWeight: "600",
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadgeText: {
    color: "#FFFFFF",
    fontSize: 10.5,
    fontWeight: "700",
  },
  metaText: {
    color: "#7F8798",
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
