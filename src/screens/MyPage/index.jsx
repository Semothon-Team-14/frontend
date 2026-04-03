import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import DirectionBlack from "../../icons/direction_black.svg";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { useLocale } from "../../locale";
import { fetchChatRooms, fetchMingleMinglers, fetchMingles, fetchTrips, fetchUser, fetchUsers } from "../../services";
import { fetchAllCities } from "../../services/placeService";
import { pickCurrentTrip } from "../../utils/trip";

function parseDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateTime(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDaysInclusive(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end) {
    return null;
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
}

function formatDateByLocale(value, isKorean) {
  const parsed = parseDate(value);
  if (!parsed) {
    return "-";
  }

  return new Intl.DateTimeFormat(isKorean ? "ko-KR" : "en-US", {
    year: "numeric",
    month: isKorean ? "long" : "short",
    day: "numeric",
  }).format(parsed);
}

function getCityNameKo(city) {
  return city?.cityNameKorean || city?.name || "-";
}

function getCityNameEn(city) {
  return city?.cityNameEnglish || city?.name || "-";
}

function getTripMetaText(trip, isKorean) {
  const inclusiveDays = diffDaysInclusive(trip?.startDate, trip?.endDate);
  const nights = inclusiveDays ? Math.max(0, inclusiveDays - 1) : null;
  const durationText = nights != null ? (isKorean ? `${nights}박 ${nights + 1}일` : `${nights}N ${nights + 1}D`) : (isKorean ? "일정 미정" : "Schedule TBD");
  return `${durationText} ・ ${formatDateByLocale(trip?.startDate, isKorean)} ~ ${formatDateByLocale(trip?.endDate, isKorean)}`;
}

export function MyPage({ navigation }) {
  const { token } = useAuth();
  const { tx, isKorean } = useLocale();
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [chatRooms, setChatRooms] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [mingleCompanionUserIdsByCity, setMingleCompanionUserIdsByCity] = useState({});
  const [citiesById, setCitiesById] = useState({});
  const [currentCity, setCurrentCity] = useState(null);

  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);

  const recentTripCount = useMemo(() => {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());

    return trips.filter((trip) => {
      const startDate = parseDate(trip?.startDate);
      if (!startDate) {
        return false;
      }
      return startDate >= threeMonthsAgo;
    }).length;
  }, [trips]);

  const mingleDaysInCurrentArea = useMemo(() => {
    const currentTrip = pickCurrentTrip(trips);
    if (!currentTrip?.startDate) {
      return null;
    }

    const start = parseDate(currentTrip.startDate);
    if (!start) {
      return null;
    }

    const today = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.max(1, Math.floor((today.getTime() - start.getTime()) / msPerDay) + 1);
  }, [trips]);

  const displayTrips = useMemo(() => {
    return [...trips]
      .sort((a, b) => String(b?.startDate || "").localeCompare(String(a?.startDate || "")))
      .slice(0, 3);
  }, [trips]);

  const directChatRoomsByRecent = useMemo(() => {
    return [...chatRooms]
      .filter((room) => Boolean(room?.directChat))
      .sort((a, b) => String(b?.updatedDateTime || "").localeCompare(String(a?.updatedDateTime || "")));
  }, [chatRooms]);

  const loadMyPage = useCallback(async () => {
    try {
      const [userResponse, tripsResponse, allCities, chatRoomsResponse, usersResponse] = await Promise.all([
        fetchUser(userId),
        fetchTrips(),
        fetchAllCities(),
        fetchChatRooms(),
        fetchUsers(),
      ]);

      const loadedUser = userResponse?.user ?? null;
      const loadedTrips = (tripsResponse?.trips ?? []).filter((trip) => Number(trip?.userId) === Number(userId));
      const cityMap = (allCities ?? []).reduce((acc, city) => {
        acc[city.id] = city;
        return acc;
      }, {});
      const allChatRooms = (chatRoomsResponse?.chatRooms ?? []).filter((room) =>
        (room?.participantUserIds ?? []).some((participantId) => Number(participantId) === Number(userId)));
      const allUsers = usersResponse?.users ?? [];
      const userMap = allUsers.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});
      const targetCityIds = Array.from(
        new Set(
          loadedTrips
            .map((trip) => Number(trip?.cityId || 0))
            .filter((cityId) => Number.isFinite(cityId) && cityId > 0),
        ),
      );
      const companionMap = {};
      await Promise.all(
        targetCityIds.map(async (cityId) => {
          try {
            const minglesResponse = await fetchMingles({ cityId });
            const mingles = minglesResponse?.mingles ?? [];
            const companionIds = new Set();
            await Promise.all(
              mingles.map(async (mingle) => {
                try {
                  const minglersResponse = await fetchMingleMinglers(mingle?.id);
                  const minglers = minglersResponse?.minglers ?? [];
                  const includesMe = minglers.some((mingler) => Number(mingler?.userId) === Number(userId));
                  if (!includesMe) {
                    return;
                  }

                  minglers.forEach((mingler) => {
                    const nextUserId = Number(mingler?.userId || 0);
                    if (nextUserId > 0 && nextUserId !== Number(userId)) {
                      companionIds.add(nextUserId);
                    }
                  });
                } catch {
                  // Keep partial companion results even if one mingle call fails.
                }
              }),
            );
            companionMap[cityId] = Array.from(companionIds);
          } catch {
            companionMap[cityId] = [];
          }
        }),
      );
      const currentTrip = pickCurrentTrip(loadedTrips);
      const city = cityMap[currentTrip?.cityId] || null;

      setUser(loadedUser);
      setTrips(loadedTrips);
      setChatRooms(allChatRooms);
      setUsersById(userMap);
      setMingleCompanionUserIdsByCity(companionMap);
      setCitiesById(cityMap);
      setCurrentCity(city);
    } catch {
      setUser(null);
      setTrips([]);
      setChatRooms([]);
      setUsersById({});
      setMingleCompanionUserIdsByCity({});
      setCitiesById({});
      setCurrentCity(null);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadMyPage();
    }, [loadMyPage]),
  );

  function openTripEditor(tripId) {
    const safeTripId = Number(tripId || 0);
    if (safeTripId <= 0) {
      return;
    }

    const parentNavigation = navigation.getParent?.();
    if (parentNavigation?.navigate) {
      parentNavigation.navigate("CreateTrip", { tripId: safeTripId });
      return;
    }

    navigation.navigate("CreateTrip", { tripId: safeTripId });
  }

  function openCreateTrip() {
    const parentNavigation = navigation.getParent?.();
    if (parentNavigation?.navigate) {
      parentNavigation.navigate("CreateTrip");
      return;
    }

    navigation.navigate("CreateTrip");
  }

  function getRecentTripChatAvatars(trip) {
    const tripStart = parseDate(trip?.startDate);
    const tripEnd = parseDate(trip?.endDate);
    const tripStartAt = tripStart
      ? new Date(tripStart.getFullYear(), tripStart.getMonth(), tripStart.getDate(), 0, 0, 0, 0)
      : null;
    const tripEndAt = tripEnd
      ? new Date(tripEnd.getFullYear(), tripEnd.getMonth(), tripEnd.getDate(), 23, 59, 59, 999)
      : null;

    const seenOtherUserIds = new Set();
    const orderedUserIds = [];

    function pushUserId(nextUserId) {
      const safeUserId = Number(nextUserId || 0);
      if (safeUserId <= 0 || seenOtherUserIds.has(safeUserId)) {
        return;
      }

      seenOtherUserIds.add(safeUserId);
      orderedUserIds.push(safeUserId);
    }

    for (const room of directChatRoomsByRecent) {
      const createdAt = parseDateTime(room?.createdDateTime);
      const updatedAt = parseDateTime(room?.updatedDateTime) || createdAt;
      if (!createdAt || !updatedAt) {
        continue;
      }

      if (tripStartAt && tripEndAt) {
        const overlapsTripWindow = createdAt <= tripEndAt && updatedAt >= tripStartAt;
        if (!overlapsTripWindow) {
          continue;
        }
      }

      const otherUserId = (room?.participantUserIds ?? []).find((participantId) => Number(participantId) !== Number(userId));
      pushUserId(otherUserId);
      if (orderedUserIds.length >= 3) {
        break;
      }
    }

    const cityCompanionUserIds = mingleCompanionUserIdsByCity[Number(trip?.cityId || 0)] ?? [];
    cityCompanionUserIds.forEach((id) => {
      if (orderedUserIds.length < 3) {
        pushUserId(id);
      }
    });

    if (orderedUserIds.length === 0) {
      for (const room of directChatRoomsByRecent) {
        const otherUserId = (room?.participantUserIds ?? []).find((participantId) => Number(participantId) !== Number(userId));
        pushUserId(otherUserId);
        if (orderedUserIds.length >= 3) {
          break;
        }
      }
    }

    const avatars = [];
    for (const otherUserId of orderedUserIds) {
      const otherUser = usersById[otherUserId];
      avatars.push({
        userId: otherUserId,
        imageUrl: otherUser?.profileImageUrl || null,
        fallbackText: String(otherUser?.name || `U${otherUserId}`).slice(0, 1).toUpperCase(),
      });
      if (avatars.length >= 3) {
        break;
      }
    }

    return avatars;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.blueTop}>
        <View style={styles.topBar}>
          <Pressable style={styles.iconButton} onPress={openCreateTrip}>
            <Ionicons name="ellipsis-vertical" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <Image
          source={
            trips.length > 0
              ? require("../../images/history_mascot_has_trip.png")
              : require("../../images/history_mascot_no_trip.png")
          }
          style={styles.historyMascotImage}
          resizeMode="contain"
        />

        <View style={styles.profileInfoWrap}>
          <Text style={styles.userCode}>USER #{user?.id ?? "-"}</Text>
          <Text style={styles.userName}>{user?.name || "-"}</Text>
          <View style={styles.tagsRow}>
            {(user?.keywords ?? []).slice(0, 2).map((keyword) => (
              <View key={keyword.id} style={styles.tagPill}>
                <Text style={styles.tagText}>#{(!isKorean ? (keyword?.labelEnglish || keyword?.label) : keyword?.label) || keyword?.name || ""}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.sectionTitle}>{tx("나의 지역", "My Area")}</Text>
        <Text style={styles.sectionSubtitle}>{tx(`지금까지 ${trips.length}명의 밍글러와 함께 했어요!`, `${trips.length} minglers so far`)}</Text>

        <View style={styles.locationCard}>
          <View style={styles.locationTopRow}>
            <Text style={styles.locationTitle}>{isKorean ? getCityNameKo(currentCity) : getCityNameEn(currentCity)}</Text>
            <DirectionBlack />
          </View>
          <Text style={styles.locationSub}>{isKorean ? getCityNameEn(currentCity) : getCityNameKo(currentCity)}</Text>
          <View style={styles.locationDivider} />
          <Text style={styles.locationMeta}>
            {mingleDaysInCurrentArea ? tx(`이 동네에서 ${mingleDaysInCurrentArea}일째 밍글 중!`, `Mingling here for ${mingleDaysInCurrentArea} day(s)!`) : tx("현재 여행 지역을 설정해보세요.", "Set your current travel area.")}
          </Text>
        </View>

        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{tx("여행 기록", "Trip History")}</Text>
          <Pressable style={styles.iconButton} onPress={openCreateTrip}>
            <Ionicons name="add" size={20} color="#1C73F0" />
          </Pressable>
        </View>
        <Text style={styles.sectionSubtitle}>{tx(`최근 3개월간 ${recentTripCount}번의 여행을 함께 했어요!`, `${recentTripCount} trips in the last 3 months`)}</Text>

        <View style={styles.tripList}>
          {displayTrips.map((trip) => {
            const tripCity = citiesById[trip?.cityId] || null;
            const safeTripId = Number(trip?.id || 0);
            const recentTripChatAvatars = getRecentTripChatAvatars(trip);
            const cardImageUrl = tripCity?.representativeImageUrl || null;
            const profileImageAvatars = recentTripChatAvatars
              .filter((avatar) => Boolean(avatar?.imageUrl))
              .slice(0, 3);
            return (
              <Pressable
                key={trip.id}
                style={styles.tripCard}
                onPress={() => openTripEditor(safeTripId)}
                disabled={safeTripId <= 0}
              >
                {cardImageUrl ? <Image source={{ uri: cardImageUrl }} style={styles.tripCardBackgroundImage} resizeMode="cover" /> : null}
                <View style={[styles.tripCardOverlay, cardImageUrl && styles.tripCardOverlayWithImage]} />
                <View style={styles.tripCardContent}>
                  <View style={styles.tripHead}>
                    <Pressable
                      style={styles.tripArrowButton}
                      hitSlop={12}
                      onPress={() => openTripEditor(safeTripId)}
                      disabled={safeTripId <= 0}
                    >
                      <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                    </Pressable>
                  </View>
                  {profileImageAvatars.length > 0 ? (
                    <View style={styles.tripAvatarRow}>
                      {profileImageAvatars.map((avatar, index) => (
                        <View
                          key={`${trip.id}-${avatar.userId}`}
                          style={[styles.tripAvatarCircle, index > 0 && styles.tripAvatarOverlap]}
                        >
                          <Image source={{ uri: avatar.imageUrl }} style={styles.tripAvatarImage} />
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Text style={styles.tripTitle}>{isKorean ? getCityNameKo(tripCity) : getCityNameEn(tripCity)}</Text>
                  <Text style={styles.tripMeta}>{getTripMetaText(trip, isKorean)}</Text>
                </View>
              </Pressable>
            );
          })}
          {displayTrips.length === 0 ? <Text style={styles.emptyText}>{tx("아직 생성된 여행이 없습니다.", "No trips yet.")}</Text> : null}
        </View>

        <View style={styles.moreRow}>
          <Text style={styles.moreText}>{tx("더보기", "More")}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1C73F0",
  },
  contentContainer: {
    minHeight: "100%",
  },
  blueTop: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 24,
    minHeight: 260,
    justifyContent: "space-between",
  },
  profileInfoWrap: {
    maxWidth: "62%",
  },
  historyMascotImage: {
    position: "absolute",
    right: 4,
    bottom: -8,
    width: 232,
    height: 188,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  userCode: {
    color: "#BFD6FF",
    fontSize: 11,
    marginBottom: 4,
    fontWeight: "600",
  },
  userName: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tagPill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    paddingHorizontal: 12,
    height: 26,
    justifyContent: "center",
  },
  tagText: {
    color: "#1C73F0",
    fontWeight: "700",
    fontSize: 12,
  },
  sheet: {
    backgroundColor: "#E7E7E9",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 28,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 2,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#8A8A8A",
    marginBottom: 12,
    fontWeight: "500",
  },
  locationCard: {
    backgroundColor: "#F2F2F3",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 26,
  },
  locationTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  locationTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
  },
  locationSub: {
    fontSize: 14,
    color: "#818181",
    marginBottom: 12,
  },
  locationDivider: {
    borderTopWidth: 1,
    borderTopColor: "#DFDFE2",
    marginBottom: 12,
  },
  locationMeta: {
    color: "#1C73F0",
    fontWeight: "700",
    fontSize: 15,
  },
  tripList: {
    gap: 12,
  },
  tripCard: {
    backgroundColor: "#DCE6F8",
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
    borderWidth: 0,
    minHeight: 136,
  },
  tripCardBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  tripCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  tripCardOverlayWithImage: {
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  tripCardContent: {
    position: "relative",
    zIndex: 1,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  tripHead: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
    alignItems: "center",
  },
  tripArrowButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  tripMeta: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "600",
    lineHeight: 20,
  },
  tripAvatarRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  tripAvatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#EAF2FF",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  tripAvatarOverlap: {
    marginLeft: -6,
  },
  tripAvatarImage: {
    width: "100%",
    height: "100%",
  },
  emptyText: {
    color: "#888888",
    fontSize: 14,
  },
  moreRow: {
    alignItems: "center",
    marginTop: 14,
  },
  moreText: {
    color: "#A0A0A0",
    fontSize: 14,
    fontWeight: "700",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
