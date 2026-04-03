import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import {
  deleteSavedCafe,
  deleteSavedRestaurant,
  fetchSavedCafes,
  fetchSavedRestaurants,
} from "../../services/savedPlaceService";
import { fetchTrips } from "../../services/tripService";
import { fetchAllCities, fetchCafeImages, fetchRestaurantImages } from "../../services/placeService";
import { pickCurrentTrip } from "../../utils/trip";

const DEFAULT_HERO_IMAGE = require("../../images/bookmarkBackground.png");
const HERO_IMAGE_ROTATE_MS = 5600;

function shuffleItems(items) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[index]];
  }

  return nextItems;
}

export function BookMark() {
  const { token } = useAuth();
  const isFocused = useIsFocused();
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const [savedRestaurants, setSavedRestaurants] = useState([]);
  const [savedCafes, setSavedCafes] = useState([]);
  const [heroImageEntries, setHeroImageEntries] = useState([]);
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [defaultHeroImageUrl, setDefaultHeroImageUrl] = useState(null);

  const loadHeroImages = useCallback(async (restaurantItems, cafeItems) => {
    if (!restaurantItems.length && !cafeItems.length) {
      setHeroImageEntries([]);
      setHeroImageIndex(0);
      return;
    }

    const restaurantImageGroups = await Promise.all(
      restaurantItems.map(async (savedRestaurant) => {
        const restaurantId = savedRestaurant?.restaurant?.id;
        const placeName = savedRestaurant?.restaurant?.name || "";
        if (!restaurantId) {
          return [];
        }

        try {
          const response = await fetchRestaurantImages(restaurantId);
          return (response?.images ?? [])
            .map((image) => image?.imageUrl)
            .filter(Boolean)
            .map((imageUrl) => ({
              imageUrl,
              placeName,
            }));
        } catch {
          return [];
        }
      }),
    );

    const cafeImageGroups = await Promise.all(
      cafeItems.map(async (savedCafe) => {
        const cafeId = savedCafe?.cafe?.id;
        const placeName = savedCafe?.cafe?.name || "";
        if (!cafeId) {
          return [];
        }

        try {
          const response = await fetchCafeImages(cafeId);
          return (response?.images ?? [])
            .map((image) => image?.imageUrl)
            .filter(Boolean)
            .map((imageUrl) => ({
              imageUrl,
              placeName,
            }));
        } catch {
          return [];
        }
      }),
    );

    const shuffledEntries = shuffleItems([
      ...restaurantImageGroups.flat(),
      ...cafeImageGroups.flat(),
    ]);
    setHeroImageEntries(shuffledEntries);
    setHeroImageIndex(0);
  }, []);

  const loadSavedPlaces = useCallback(async () => {
    const [restaurantResult, cafeResult, tripsResult, citiesResult] = await Promise.allSettled([
      fetchSavedRestaurants(),
      fetchSavedCafes(),
      fetchTrips(),
      fetchAllCities(),
    ]);

    try {
      const nextSavedRestaurants = restaurantResult.status === "fulfilled"
        ? (restaurantResult.value?.savedRestaurants ?? [])
        : [];
      const nextSavedCafes = cafeResult.status === "fulfilled"
        ? (cafeResult.value?.savedCafes ?? [])
        : [];
      const trips = tripsResult.status === "fulfilled"
        ? (tripsResult.value?.trips ?? [])
        : [];
      const cities = citiesResult.status === "fulfilled"
        ? (citiesResult.value ?? [])
        : [];
      const userTrips = trips.filter((trip) => Number(trip?.userId) === Number(userId));
      const currentTrip = pickCurrentTrip(userTrips);
      const currentTripCity = cities.find((city) => Number(city?.id) === Number(currentTrip?.cityId)) || null;

      setSavedRestaurants(nextSavedRestaurants);
      setSavedCafes(nextSavedCafes);
      setDefaultHeroImageUrl(currentTripCity?.representativeImageUrl || null);
      await loadHeroImages(nextSavedRestaurants, nextSavedCafes);
    } catch {
      setSavedRestaurants([]);
      setSavedCafes([]);
      setHeroImageEntries([]);
      setHeroImageIndex(0);
      setDefaultHeroImageUrl(null);
    }
  }, [loadHeroImages, userId]);

  useFocusEffect(
    useCallback(() => {
      loadSavedPlaces();
    }, [loadSavedPlaces]),
  );

  useEffect(() => {
    if (!isFocused || heroImageEntries.length === 0) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setHeroImageIndex((prev) => (prev + 1) % heroImageEntries.length);
    }, HERO_IMAGE_ROTATE_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [heroImageEntries, isFocused]);

  const activeHeroImage = heroImageEntries[heroImageIndex] ?? null;
  const defaultHeroImageSource = defaultHeroImageUrl ? { uri: defaultHeroImageUrl } : DEFAULT_HERO_IMAGE;
  const heroImageSource = activeHeroImage?.imageUrl
    ? { uri: activeHeroImage.imageUrl }
    : defaultHeroImageSource;

  async function handleDeleteSavedRestaurant(savedRestaurantId) {
    await deleteSavedRestaurant(savedRestaurantId);
    const nextSavedRestaurants = savedRestaurants.filter((item) => item.id !== savedRestaurantId);
    setSavedRestaurants(nextSavedRestaurants);
    await loadHeroImages(nextSavedRestaurants, savedCafes);
  }

  async function handleDeleteSavedCafe(savedCafeId) {
    await deleteSavedCafe(savedCafeId);
    const nextSavedCafes = savedCafes.filter((item) => item.id !== savedCafeId);
    setSavedCafes(nextSavedCafes);
    await loadHeroImages(savedRestaurants, nextSavedCafes);
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={heroImageSource}
        resizeMode="cover"
        style={styles.heroImage}
      >
        {activeHeroImage?.placeName ? (
          <>
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.45)"]}
              style={styles.heroImageGradient}
            />
            <View style={styles.heroImageLabelWrap}>
              <Text style={styles.heroImageLabel}>{activeHeroImage.placeName}</Text>
            </View>
          </>
        ) : null}
      </ImageBackground>

      <ScrollView contentContainerStyle={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={styles.placeTitle}>나만의 장소</Text>
          </View>

          <Text style={styles.sectionTitle}>저장한 식당</Text>
          {savedRestaurants.length === 0 ? <Text style={styles.emptyText}>저장한 식당이 없습니다.</Text> : null}
          <View style={styles.listWrap}>
            {savedRestaurants.map((saved) => (
              <View key={saved.id} style={styles.placeItem}>
                <View style={styles.placeTextWrap}>
                  <Text style={styles.itemTitle}>{saved.restaurant?.name || "-"}</Text>
                  <Text style={styles.itemSubtitle}>{saved.restaurant?.address || "-"}</Text>
                </View>
                <Pressable onPress={() => handleDeleteSavedRestaurant(saved.id)} hitSlop={12}>
                  <Ionicons name="bookmark" size={20} color="#1C73F0" />
                </Pressable>
              </View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>저장한 카페</Text>
          {savedCafes.length === 0 ? <Text style={styles.emptyText}>저장한 카페가 없습니다.</Text> : null}
          <View style={styles.listWrap}>
            {savedCafes.map((saved) => (
              <View key={saved.id} style={styles.placeItem}>
                <View style={styles.placeTextWrap}>
                  <Text style={styles.itemTitle}>{saved.cafe?.name || "-"}</Text>
                  <Text style={styles.itemSubtitle}>{saved.cafe?.address || "-"}</Text>
                </View>
                <Pressable onPress={() => handleDeleteSavedCafe(saved.id)} hitSlop={12}>
                  <Ionicons name="bookmark" size={20} color="#1C73F0" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F2F5",
  },
  heroImage: {
    width: "100%",
    height: 400,
    position: "absolute",
    top: 0,
  },
  heroImageGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
  },
  heroImageLabelWrap: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 72,
  },
  heroImageLabel: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 22,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  sheetWrap: {
    paddingTop: 350,
    minHeight: "100%",
  },
  sheet: {
    backgroundColor: "#F1F2F5",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    minHeight: 480,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 28,
    gap: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  placeTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  placeType: {
    fontSize: 14,
    color: "#86A6D5",
    fontWeight: "600",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    marginTop: 4,
  },
  listWrap: {
    gap: 8,
  },
  placeItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  placeTextWrap: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    color: "#111",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 2,
  },
  itemSubtitle: {
    color: "#7B7B7B",
    fontSize: 12,
  },
  emptyText: {
    color: "#8A8A8A",
    fontSize: 13,
  },
});
