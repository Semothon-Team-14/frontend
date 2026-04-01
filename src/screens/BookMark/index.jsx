import { useEffect, useMemo, useState } from "react";
import { ImageBackground, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchSavedCafes, fetchSavedRestaurants } from "../../services/savedPlaceService";

export function BookMark() {
  const [savedRestaurants, setSavedRestaurants] = useState([]);
  const [savedCafes, setSavedCafes] = useState([]);

  useEffect(() => {
    async function load() {
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
    }

    load();
  }, []);

  const firstRestaurant = useMemo(() => savedRestaurants[0]?.restaurant ?? null, [savedRestaurants]);
  const firstCafe = useMemo(() => savedCafes[0]?.cafe ?? null, [savedCafes]);
  const primaryPlace = firstRestaurant || firstCafe;

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
});
