import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import More from "../../icons/more.svg";
import DirectionBlack from "../../icons/direction_black.svg";
import TravelIcon from "../../icons/travelIcon.svg";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { fetchTrips, fetchUser } from "../../services";
import { fetchAllCities } from "../../services/placeService";
import { pickCurrentTrip } from "../../utils/trip";

function parseDate(value) {
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

function formatKoreanDate(value) {
  const parsed = parseDate(value);
  if (!parsed) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsed);
}

function getCityNameKo(city) {
  return city?.cityNameKorean || city?.name || "-";
}

function getCityNameEn(city) {
  return city?.cityNameEnglish || city?.name || "-";
}

function getTripMetaText(trip) {
  const inclusiveDays = diffDaysInclusive(trip?.startDate, trip?.endDate);
  const nights = inclusiveDays ? Math.max(0, inclusiveDays - 1) : null;
  const durationText = nights != null ? `${nights}박 ${nights + 1}일` : "일정 미정";
  return `${durationText} ・ ${formatKoreanDate(trip?.startDate)} ~ ${formatKoreanDate(trip?.endDate)}`;
}

export function MyPage() {
  const { token, logout } = useAuth();
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
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

  const loadMyPage = useCallback(async () => {
    try {
      const [userResponse, tripsResponse, allCities] = await Promise.all([
        fetchUser(userId),
        fetchTrips(),
        fetchAllCities(),
      ]);

      const loadedUser = userResponse?.user ?? null;
      const loadedTrips = (tripsResponse?.trips ?? []).filter((trip) => Number(trip?.userId) === Number(userId));
      const cityMap = (allCities ?? []).reduce((acc, city) => {
        acc[city.id] = city;
        return acc;
      }, {});
      const currentTrip = pickCurrentTrip(loadedTrips);
      const city = cityMap[currentTrip?.cityId] || null;

      setUser(loadedUser);
      setTrips(loadedTrips);
      setCitiesById(cityMap);
      setCurrentCity(city);
    } catch {
      setUser(null);
      setTrips([]);
      setCitiesById({});
      setCurrentCity(null);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadMyPage();
    }, [loadMyPage]),
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.blueTop}>
        <View style={styles.topBar}>
          <Pressable onPress={logout}>
            <More />
          </Pressable>
        </View>

        <View>
          <Text style={styles.userCode}>USER #{user?.id ?? "-"}</Text>
          <Text style={styles.userName}>{user?.name || "-"}</Text>
          <View style={styles.tagsRow}>
            {(user?.keywords ?? []).slice(0, 2).map((keyword) => (
              <View key={keyword.id} style={styles.tagPill}><Text style={styles.tagText}>#{keyword.name}</Text></View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.sheet}>
        <Text style={styles.sectionTitle}>나의 지역</Text>
        <Text style={styles.sectionSubtitle}>지금까지 {trips.length}명의 밍글러와 함께 했어요!</Text>

        <View style={styles.locationCard}>
          <View style={styles.locationTopRow}>
            <Text style={styles.locationTitle}>{getCityNameKo(currentCity)}</Text>
            <DirectionBlack />
          </View>
          <Text style={styles.locationSub}>{getCityNameEn(currentCity)}</Text>
          <View style={styles.locationDivider} />
          <Text style={styles.locationMeta}>
            {mingleDaysInCurrentArea ? `이 동네에서 ${mingleDaysInCurrentArea}일째 밍글 중!` : "현재 여행 지역을 설정해보세요."}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>여행 기록</Text>
        <Text style={styles.sectionSubtitle}>최근 3개월간 {recentTripCount}번의 여행을 함께 했어요!</Text>

        <View style={styles.tripList}>
          {displayTrips.map((trip) => {
            const tripCity = citiesById[trip?.cityId] || null;
            return (
              <View key={trip.id} style={styles.tripCard}>
                <View style={styles.tripHead}>
                  <TravelIcon />
                  <DirectionBlack />
                </View>
                <Text style={styles.tripTitle}>{getCityNameKo(tripCity)}</Text>
                <Text style={styles.tripMeta}>{getTripMetaText(trip)}</Text>
              </View>
            );
          })}
          {displayTrips.length === 0 ? <Text style={styles.emptyText}>아직 생성된 여행이 없습니다.</Text> : null}
        </View>

        <View style={styles.moreRow}>
          <Text style={styles.moreText}>더보기</Text>
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
    backgroundColor: "#F2F2F3",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  tripHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
    marginBottom: 2,
  },
  tripMeta: {
    fontSize: 14,
    color: "#8A8A8A",
    fontWeight: "600",
    lineHeight: 20,
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
});
