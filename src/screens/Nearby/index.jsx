import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { fetchMingleMinglers, fetchMingles, joinMingle, leaveMingle } from "../../services/mingleService";
import { fetchUsers } from "../../services/userService";

const TAB_LIGHTNING = "LIGHTNING";
const TAB_GROUP = "GROUP";

function toSexLabel(sex) {
  if (sex === "MALE") {
    return "남성";
  }

  if (sex === "FEMALE") {
    return "여성";
  }

  return "-";
}

function toRelativeTimeLabel(isoString) {
  if (!isoString) {
    return "";
  }

  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "방금 전";
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "방금 전";
  }

  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

export function Nearby({ route }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState(TAB_LIGHTNING);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mingleRows, setMingleRows] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [joinedMingleIdSet, setJoinedMingleIdSet] = useState(new Set());

  const cityId = Number(route?.params?.cityId);
  const currentUserId = useMemo(() => decodeUserIdFromToken(token), [token]);

  const nearbyProfiles = useMemo(() => {
    const seen = new Set();
    const result = [];

    mingleRows.forEach((row) => {
      (row.minglers ?? []).forEach((mingler) => {
        if (!mingler?.userId || seen.has(mingler.userId)) {
          return;
        }

        seen.add(mingler.userId);
        result.push({
          userId: mingler.userId,
          mingleId: row.mingle?.id,
        });
      });
    });

    return result;
  }, [mingleRows]);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [mingleResponse, userResponse] = await Promise.all([
        fetchMingles(Number.isFinite(cityId) && cityId > 0 ? { cityId } : undefined),
        fetchUsers(),
      ]);

      const mingles = mingleResponse?.mingles ?? [];
      const users = userResponse?.users ?? [];

      const userMap = users.reduce((acc, user) => {
        if (user?.id) {
          acc[user.id] = user;
        }

        return acc;
      }, {});

      const minglersByMingle = await Promise.all(
        mingles.map(async (mingle) => {
          try {
            const response = await fetchMingleMinglers(mingle.id);
            return response?.minglers ?? [];
          } catch {
            return [];
          }
        }),
      );

      const rows = mingles.map((mingle, index) => ({
        mingle,
        minglers: minglersByMingle[index] ?? [],
      }));

      const nextJoinedSet = new Set(
        rows
          .filter((row) => (row.minglers ?? []).some((mingler) => Number(mingler?.userId) === Number(currentUserId)))
          .map((row) => row?.mingle?.id)
          .filter(Boolean),
      );

      setUsersById(userMap);
      setMingleRows(rows);
      setJoinedMingleIdSet(nextJoinedSet);
    } catch {
      setUsersById({});
      setMingleRows([]);
      setJoinedMingleIdSet(new Set());
      setError("근처 밍글러 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [cityId, currentUserId]);

  useFocusEffect(
    useCallback(() => {
      loadNearby();
    }, [loadNearby]),
  );

  async function handleToggleJoin(mingleId) {
    if (!mingleId) {
      return;
    }

    try {
      if (joinedMingleIdSet.has(mingleId)) {
        await leaveMingle(mingleId);
      } else {
        await joinMingle(mingleId);
      }

      await loadNearby();
    } catch {
      setError("밍글 참여 상태를 변경하지 못했습니다.");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, activeTab === TAB_LIGHTNING && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_LIGHTNING)}
        >
          <Text style={[styles.tabText, activeTab === TAB_LIGHTNING && styles.tabTextActive]}>번개</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === TAB_GROUP && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_GROUP)}
        >
          <Text style={[styles.tabText, activeTab === TAB_GROUP && styles.tabTextActive]}>소모임</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.infoText}>불러오는 중...</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loading && !error && activeTab === TAB_LIGHTNING
          ? nearbyProfiles.map((profile) => {
              const user = usersById[profile.userId];
              if (!user) {
                return null;
              }

              const joined = joinedMingleIdSet.has(profile.mingleId);

              return (
                <View key={`${profile.userId}-${profile.mingleId}`} style={styles.card}>
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{user?.name || `USER#${user?.id}`}</Text>
                    <Text style={styles.meta}>{toSexLabel(user?.sex)}</Text>
                    <Text style={styles.description} numberOfLines={2}>
                      {user?.introduction || "소개가 아직 없어요."}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.actionButton, joined && styles.actionButtonActive]}
                    onPress={() => handleToggleJoin(profile.mingleId)}
                  >
                    <Text style={[styles.actionButtonText, joined && styles.actionButtonTextActive]}>
                      {joined ? "취소" : "밍글"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          : null}

        {!loading && !error && activeTab === TAB_GROUP
          ? mingleRows.map((row) => {
              const joined = joinedMingleIdSet.has(row?.mingle?.id);
              const minglerCount = row?.minglers?.length ?? 0;

              return (
                <View key={row?.mingle?.id} style={styles.card}>
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{row?.mingle?.title || "제목 없음"}</Text>
                    <Text style={styles.meta}>{toRelativeTimeLabel(row?.mingle?.createdDateTime)}</Text>
                    <Text style={styles.description} numberOfLines={2}>
                      {row?.mingle?.description || "같이할 밍글러를 기다리고 있어요."}
                    </Text>
                    <Text style={styles.countText}>참여 중 {minglerCount}명</Text>
                  </View>
                  <Pressable
                    style={[styles.actionButton, joined && styles.actionButtonActive]}
                    onPress={() => handleToggleJoin(row?.mingle?.id)}
                  >
                    <Text style={[styles.actionButtonText, joined && styles.actionButtonTextActive]}>
                      {joined ? "취소" : "밍글"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          : null}

        {!loading && !error && ((activeTab === TAB_LIGHTNING && nearbyProfiles.length === 0) || (activeTab === TAB_GROUP && mingleRows.length === 0)) ? (
          <Text style={styles.infoText}>표시할 항목이 없습니다.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F2F5",
    paddingTop: 18,
  },
  tabRow: {
    marginHorizontal: 20,
    flexDirection: "row",
    backgroundColor: "#E9ECF2",
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    color: "#77819A",
    fontWeight: "700",
    fontSize: 14,
  },
  tabTextActive: {
    color: "#1C73F0",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 10,
  },
  card: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E8EF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: "#101827",
    fontSize: 15,
    fontWeight: "700",
  },
  meta: {
    color: "#5F6980",
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    color: "#25314D",
    fontSize: 13,
    lineHeight: 18,
  },
  countText: {
    color: "#6A7388",
    fontSize: 12,
    marginTop: 2,
  },
  actionButton: {
    minWidth: 64,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonActive: {
    backgroundColor: "#EAF2FF",
  },
  actionButtonText: {
    color: "#1C73F0",
    fontWeight: "700",
    fontSize: 12,
  },
  actionButtonTextActive: {
    color: "#0E55BD",
  },
  infoText: {
    color: "#6F778B",
    fontSize: 13,
    textAlign: "center",
    marginTop: 16,
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
});
