import { useCallback, useMemo, useState } from "react";
import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import {
  deleteSavedCafe,
  deleteSavedRestaurant,
  fetchSavedCafes,
  fetchSavedRestaurants,
} from "../../services/savedPlaceService";

export function BookMark() {
  const [savedRestaurants, setSavedRestaurants] = useState([]);
  const [savedCafes, setSavedCafes] = useState([]);

  const loadSavedPlaces = useCallback(async () => {
    try {
      const [restaurantResponse, cafeResponse] = await Promise.all([
        fetchSavedRestaurants(),
        fetchSavedCafes(),
      ]);
      setSavedRestaurants(restaurantResponse?.savedRestaurants ?? []);
      setSavedCafes(cafeResponse?.savedCafes ?? []);
    } catch {
      setSavedRestaurants([]);
      setSavedCafes([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSavedPlaces();
    }, [loadSavedPlaces]),
  );

  const firstRestaurant = useMemo(() => savedRestaurants[0]?.restaurant ?? null, [savedRestaurants]);
  const firstCafe = useMemo(() => savedCafes[0]?.cafe ?? null, [savedCafes]);
  const primaryPlace = firstRestaurant || firstCafe;

  async function handleDeleteSavedRestaurant(savedRestaurantId) {
    await deleteSavedRestaurant(savedRestaurantId);
    setSavedRestaurants((prev) => prev.filter((item) => item.id !== savedRestaurantId));
  }

  async function handleDeleteSavedCafe(savedCafeId) {
    await deleteSavedCafe(savedCafeId);
    setSavedCafes((prev) => prev.filter((item) => item.id !== savedCafeId));
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require("../../images/bookmarkBackground.png")}
        resizeMode="cover"
        style={styles.heroImage}
      />

      <ScrollView contentContainerStyle={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={styles.placeTitle}>{primaryPlace?.name || "-"}</Text>
            <Text style={styles.placeType}>{primaryPlace ? (firstRestaurant ? "restaurant" : "cafe") : "-"}</Text>
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
