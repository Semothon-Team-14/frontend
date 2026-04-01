import { useCallback, useMemo, useState } from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import Person from "../../icons/person.svg";
import Alarm from "../../icons/alarm.svg";
import Position from "../../icons/position.svg";
import Direction from "../../icons/direction.svg";
import Quick from "../../icons/quick.svg";
import Speech from "../../icons/speech.svg";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import {
  createSavedCafe,
  createSavedRestaurant,
  fetchCafeImages,
  fetchCafesByCity,
  fetchRestaurantImages,
  fetchRestaurantsByCity,
  fetchTrips,
} from "../../services";
import { fetchAllCities } from "../../services/placeService";
import { pickCurrentTrip } from "../../utils/trip";

const CHIPS = [
  { id: "restaurant", label: "#식당", supported: true },
  { id: "cafe", label: "#카페", supported: true },
  { id: "shopping", label: "#쇼핑", supported: false },
  { id: "fun", label: "#놀거리", supported: false },
];

function ChipRow({ activeId, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {CHIPS.map((chip) => {
        const active = chip.id === activeId;
        return (
          <Pressable
            key={chip.id}
            disabled={!chip.supported}
            onPress={() => onSelect(chip.id)}
            style={[styles.chip, active && styles.chipActive, !chip.supported && styles.chipDisabled]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
          </Pressable>
        );
      })}
      <View style={styles.plusChip}>
        <Text style={styles.plusChipText}>+</Text>
      </View>
    </ScrollView>
  );
}

export function MainScreen() {
  const navigation = useNavigation();
  const { token } = useAuth();
  const [activeChip, setActiveChip] = useState("restaurant");
  const [currentTrip, setCurrentTrip] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [places, setPlaces] = useState([]);

  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const activePlaceType = useMemo(() => {
    if (activeChip === "restaurant") {
      return "restaurant";
    }

    if (activeChip === "cafe") {
      return "cafe";
    }

    return null;
  }, [activeChip]);

  async function enrichWithImages(items, type) {
    return Promise.all(
      items.map(async (item) => {
        try {
          const response = type === "cafe" ? await fetchCafeImages(item.id) : await fetchRestaurantImages(item.id);
          return {
            ...item,
            imageUrl: response?.images?.[0]?.imageUrl || null,
          };
        } catch {
          return {
            ...item,
            imageUrl: null,
          };
        }
      }),
    );
  }

  async function loadHome() {
    try {
      const [allCities, tripsResponse] = await Promise.all([fetchAllCities(), fetchTrips()]);
      const userTrips = (tripsResponse?.trips ?? []).filter((trip) => trip?.userId === userId);
      const trip = pickCurrentTrip(userTrips);
      const city = allCities.find((item) => item.id === trip?.cityId) || null;

      setCurrentTrip(trip);
      setSelectedCity(city);

      if (!city?.id) {
        setPlaces([]);
        return;
      }

      if (!activePlaceType) {
        setPlaces([]);
        return;
      }

      if (activePlaceType === "cafe") {
        const cafeResponse = await fetchCafesByCity(city.id);
        const cafes = cafeResponse?.cafes ?? [];
        setPlaces(await enrichWithImages(cafes, "cafe"));
        return;
      }

      const restaurantResponse = await fetchRestaurantsByCity(city.id);
      const restaurants = restaurantResponse?.restaurants ?? [];
      setPlaces(await enrichWithImages(restaurants, "restaurant"));
    } catch {
      setCurrentTrip(null);
      setSelectedCity(null);
      setPlaces([]);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadHome();
    }, [activePlaceType, userId]),
  );

  async function handleSave(placeId) {
    if (activePlaceType === "cafe") {
      await createSavedCafe(placeId);
      return;
    }

    await createSavedRestaurant(placeId);
  }

  const visiblePlaces = places.slice(0, 3);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topIcons}>
        <Alarm />
        <Person />
      </View>

      <View style={styles.locationSection}>
        <View style={styles.badge}><Text style={styles.badgeText}>Now</Text></View>
        <View style={styles.locationRow}>
          <Text style={styles.locationKo}>{selectedCity?.name || "어디로 떠나시나요?"}</Text>
          <Position width={18} height={18} />
        </View>
        <Text style={styles.locationEn}>{selectedCity?.name || "Where is next?"}</Text>
      </View>

      <View style={styles.quickRow}>
        <TouchableWithoutFeedback onPress={() => navigation.navigate("Nearby", { cityId: selectedCity?.id })}>
          <View style={styles.nearbyCard}>
            <LinearGradient colors={["rgba(1, 105, 254, 0.5)", "rgb(1, 105, 254)"]} style={StyleSheet.absoluteFill} />
            <View style={styles.quickCardHeader}>
              <Text style={styles.nearbyTitle}>근처 밍글러</Text>
              <Direction width={18} height={18} />
            </View>
            <Text style={styles.nearbyBody}>
              {currentTrip?.title ? `${currentTrip.title} 같이 하실 분` : "여행자를 만나보세요"}
            </Text>
          </View>
        </TouchableWithoutFeedback>

        <View style={styles.rightQuickStack}>
          <TouchableWithoutFeedback onPress={() => navigation.navigate("QuickMatch", { cityId: selectedCity?.id })}>
            <View style={styles.quickButtonCard}>
              <Quick />
              <Text style={styles.quickButtonText}>빠른 매칭</Text>
            </View>
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={() => navigation.navigate("Chats")}>
            <View style={styles.quickButtonCard}>
              <View style={styles.communityIconWrap}>
                <Speech />
                <View style={styles.communityBadge}><Text style={styles.communityBadgeText}>2</Text></View>
              </View>
              <Text style={styles.quickButtonText}>로컬 커뮤니티</Text>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>실시간 인기</Text>
        <Text style={styles.sectionTime}>AM 9:00</Text>
      </View>

      <ChipRow activeId={activeChip} onSelect={setActiveChip} />

      <View style={styles.popularPanel}>
        {visiblePlaces.map((place, idx) => (
          <Pressable key={place.id || idx} style={styles.placeCard}>
            <ImageBackground
              source={place.imageUrl ? { uri: place.imageUrl } : require("../../images/bookmarkBackground.png")}
              style={styles.placeImage}
              imageStyle={styles.placeImageRadius}
            >
              <View style={styles.rankBadge}><Text style={styles.rankText}>{idx + 1}</Text></View>
              <Pressable style={styles.bookmarkBtn} hitSlop={12} onPress={() => handleSave(place.id)}>
                <Ionicons name="bookmark-outline" size={20} color="#ffffff" />
              </Pressable>
              <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.placeGradient} />
              <View style={styles.placeFooter}>
                <View style={styles.placeTextCol}>
                  <Text style={styles.placeNameKo}>{place.name || "-"}</Text>
                  <Text style={styles.placeNameEn}>{place.address || "-"}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ffffff" />
              </View>
            </ImageBackground>
          </Pressable>
        ))}
        {activePlaceType == null ? <Text style={styles.emptyText}>해당 태그는 아직 준비 중입니다.</Text> : null}
        {activePlaceType != null && visiblePlaces.length === 0 ? <Text style={styles.emptyText}>표시할 장소가 없습니다.</Text> : null}

        <Pressable style={styles.floatingPlusButton} onPress={loadHome}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>

        <View style={styles.moreRow}>
          <Text style={styles.moreText}>인기 장소 더보기</Text>
          <Ionicons name="chevron-forward" size={14} color="#818181" />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
    backgroundColor: "#f1f2f5",
    gap: 12,
  },
  topIcons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 14,
  },
  locationSection: {
    gap: 6,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#1C73F0",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locationKo: {
    fontSize: 44 / 2,
    fontWeight: "700",
    color: "#121212",
  },
  locationEn: {
    fontSize: 14,
    color: "#818181",
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  nearbyCard: {
    width: 170,
    height: 170,
    borderRadius: 22,
    overflow: "hidden",
    padding: 14,
    justifyContent: "space-between",
  },
  quickCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nearbyTitle: {
    color: "#fff",
    fontSize: 32 / 2,
    fontWeight: "700",
  },
  nearbyBody: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 22,
  },
  rightQuickStack: {
    width: 170,
    gap: 10,
  },
  quickButtonCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    height: 80,
    paddingHorizontal: 16,
    justifyContent: "center",
    gap: 6,
  },
  quickButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  communityIconWrap: {
    position: "relative",
    width: 28,
  },
  communityBadge: {
    position: "absolute",
    right: -14,
    top: -7,
    backgroundColor: "#1C73F0",
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  communityBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 36 / 2,
    fontWeight: "700",
    color: "#111",
  },
  sectionTime: {
    color: "#8A8A8A",
    fontSize: 14,
    fontWeight: "500",
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  chip: {
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 28,
    backgroundColor: "#ececef",
    justifyContent: "center",
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: "#1C73F0",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8d8d8d",
  },
  chipTextActive: {
    color: "#fff",
  },
  chipDisabled: {
    opacity: 0.45,
  },
  plusChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ececef",
    justifyContent: "center",
    alignItems: "center",
  },
  plusChipText: {
    color: "#8d8d8d",
    fontSize: 16,
  },
  popularPanel: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 10,
    paddingBottom: 8,
    position: "relative",
    gap: 8,
    marginBottom: 6,
  },
  placeCard: {
    borderRadius: 16,
    overflow: "hidden",
    height: 138,
  },
  placeImage: {
    flex: 1,
    justifyContent: "flex-end",
  },
  placeImageRadius: {
    borderRadius: 16,
  },
  rankBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#1C73F0",
    justifyContent: "center",
    alignItems: "center",
  },
  rankText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  bookmarkBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  placeGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 90,
  },
  placeFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingBottom: 11,
  },
  placeTextCol: {
    flex: 1,
    marginRight: 8,
  },
  placeNameKo: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  placeNameEn: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
  },
  floatingPlusButton: {
    position: "absolute",
    right: -12,
    top: 177,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1C73F0",
    justifyContent: "center",
    alignItems: "center",
  },
  moreRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
  },
  moreText: {
    color: "#8A8A8A",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyText: {
    color: "#8A8A8A",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 12,
  },
});
