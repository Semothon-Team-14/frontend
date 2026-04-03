import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MapView, { Marker } from "react-native-maps";
import Person from "../../icons/person.svg";
import Alarm from "../../icons/alarm.svg";
import Position from "../../icons/position.svg";
import Direction from "../../icons/direction.svg";
import Quick from "../../icons/quick.svg";
import Speech from "../../icons/speech.svg";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { useLocale } from "../../locale";
import {
  createSavedCafe,
  createSavedRestaurant,
  deleteSavedCafe,
  deleteSavedRestaurant,
  fetchCafeImages,
  fetchCafesByCity,
  fetchSavedCafes,
  fetchSavedRestaurants,
  fetchRestaurantImages,
  fetchRestaurantsByCity,
  fetchMingles,
  fetchMingleMinglers,
  fetchLocals,
  fetchTrips,
  fetchUser,
} from "../../services";
import { fetchAllCities } from "../../services/placeService";
import { pickCurrentTrip } from "../../utils/trip";

const CHIPS = [
  { id: "restaurant", labelKo: "#식당", labelEn: "#Food", supported: true },
  { id: "cafe", labelKo: "#카페", labelEn: "#Cafe", supported: true },
  { id: "shopping", labelKo: "#쇼핑", labelEn: "#Shopping", supported: false },
  { id: "fun", labelKo: "#놀거리", labelEn: "#Activities", supported: false },
];
const HOME_MODE_TRAVELER = "TRAVELER";
const HOME_MODE_LOCAL = "LOCAL";

function ChipRow({ activeId, onSelect, tx }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {CHIPS.map((chip) => {
        const active = chip.id === activeId;
        return (
          <Pressable
            key={chip.id}
            disabled={!chip.supported}
            onPress={() => onSelect(chip.id)}
            style={[
              styles.chip,
              active && styles.chipActive,
              !chip.supported && styles.chipDisabled,
            ]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {tx(chip.labelKo, chip.labelEn)}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.plusChip}>
        <Text style={styles.plusChipText}>+</Text>
      </View>
    </ScrollView>
  );
}

function toCoordinateValue(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function isValidCoordinatePair(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return false;
  }

  if (Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001) {
    return false;
  }

  return true;
}

function resolveCityCenter(city, placesByType) {
  const cityLatitude = toCoordinateValue(
    city?.centerLatitude ?? city?.latitude ?? city?.lat,
  );
  const cityLongitude = toCoordinateValue(
    city?.centerLongitude ?? city?.longitude ?? city?.lng,
  );
  if (isValidCoordinatePair(cityLatitude, cityLongitude)) {
    return { latitude: cityLatitude, longitude: cityLongitude };
  }

  const candidatePlaces = [
    ...(placesByType?.restaurant ?? []),
    ...(placesByType?.cafe ?? []),
  ];
  const placeWithCoordinate = candidatePlaces.find((place) => {
    const latitude = toCoordinateValue(place?.latitude ?? place?.lat);
    const longitude = toCoordinateValue(place?.longitude ?? place?.lng);
    return isValidCoordinatePair(latitude, longitude);
  });

  if (!placeWithCoordinate) {
    return null;
  }

  return {
    latitude: toCoordinateValue(placeWithCoordinate?.latitude ?? placeWithCoordinate?.lat),
    longitude: toCoordinateValue(placeWithCoordinate?.longitude ?? placeWithCoordinate?.lng),
  };
}

export function MainScreen() {
  const navigation = useNavigation();
  const { token, logout } = useAuth();
  const { tx, isKorean } = useLocale();
  const [currentTime, setCurrentTime] = useState("");

  useFocusEffect(
    useCallback(() => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: !isKorean,
        }),
      );
    }, [isKorean]),
  );

  const [homeMode, setHomeMode] = useState(HOME_MODE_TRAVELER);
  const [activeChip, setActiveChip] = useState("restaurant");
  const [currentTrip, setCurrentTrip] = useState(null);
  const [tripCity, setTripCity] = useState(null);
  const [localCity, setLocalCity] = useState(null);
  const [places, setPlaces] = useState([]);
  const [placesByType, setPlacesByType] = useState({
    restaurant: [],
    cafe: [],
  });
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeError, setPlaceError] = useState(null);
  const [homeDataVersion, setHomeDataVersion] = useState(0);
  const [savedRestaurantByPlaceId, setSavedRestaurantByPlaceId] = useState({});
  const [savedCafeByPlaceId, setSavedCafeByPlaceId] = useState({});
  const [localMingleRows, setLocalMingleRows] = useState([]);
  const [localMingleLoading, setLocalMingleLoading] = useState(false);
  const [localMingleError, setLocalMingleError] = useState(null);
  const [localUserProfile, setLocalUserProfile] = useState(null);
  const [localAvailableTimeText, setLocalAvailableTimeText] = useState(null);
  const placeRequestSequenceRef = useRef(0);

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
  const selectedCity = useMemo(() => {
    if (homeMode === HOME_MODE_LOCAL) {
      return localCity || tripCity || null;
    }

    return tripCity || null;
  }, [homeMode, localCity, tripCity]);
  const selectedCityDisplayName = useMemo(() => {
    if (!selectedCity) {
      return "";
    }
    if (isKorean) {
      return selectedCity?.cityNameKorean || selectedCity?.name || selectedCity?.cityNameEnglish || "";
    }
    return selectedCity?.cityNameEnglish || selectedCity?.name || selectedCity?.cityNameKorean || "";
  }, [isKorean, selectedCity]);
  const localCardKeywords = useMemo(() => {
    return [...(localUserProfile?.keywords ?? [])]
      .sort((a, b) => Number(a?.priority ?? 999) - Number(b?.priority ?? 999))
      .slice(0, 2);
  }, [localUserProfile]);
  const localDisplayName = useMemo(() => {
    const name = String(localUserProfile?.name || localUserProfile?.username || "").trim();
    if (name.length > 0) {
      return name;
    }
    return tx("로컬 밍글러", "Local Mingler");
  }, [localUserProfile, tx]);
  const localAvailabilityLabel = useMemo(() => {
    const value = String(localAvailableTimeText || "").trim();
    if (value.length > 0) {
      return value;
    }
    return tx("시간을 설정해보세요", "Set your available time");
  }, [localAvailableTimeText, tx]);

  async function enrichWithImages(items, type) {
    return Promise.all(
      items.map(async (item) => {
        try {
          const response =
            type === "cafe"
              ? await fetchCafeImages(item.id)
              : await fetchRestaurantImages(item.id);
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

  async function loadPlacesForType(cityId, placeType) {
    if (!cityId || !placeType) {
      setPlaces([]);
      setPlaceLoading(false);
      setPlaceError(null);
      return;
    }

    const cachedPlaces = placesByType[placeType] ?? [];
    setPlaces(cachedPlaces);
    setPlaceLoading(true);
    setPlaceError(null);

    const requestSequence = ++placeRequestSequenceRef.current;

    try {
      if (placeType === "cafe") {
        const cafeResponse = await fetchCafesByCity(cityId);
        const cafes = cafeResponse?.cafes ?? [];
        const enriched = await enrichWithImages(cafes, "cafe");
        if (requestSequence !== placeRequestSequenceRef.current) {
          return;
        }
        setPlacesByType((prev) => ({ ...prev, cafe: enriched }));
        setPlaces(enriched);
        return;
      }

      const restaurantResponse = await fetchRestaurantsByCity(cityId);
      const restaurants = restaurantResponse?.restaurants ?? [];
      const enriched = await enrichWithImages(restaurants, "restaurant");
      if (requestSequence !== placeRequestSequenceRef.current) {
        return;
      }
      setPlacesByType((prev) => ({ ...prev, restaurant: enriched }));
      setPlaces(enriched);
    } catch {
      if (requestSequence !== placeRequestSequenceRef.current) {
        return;
      }
      setPlaceError(tx("장소를 불러오는 중입니다. 잠시 후 다시 시도해주세요.", "Failed to load places. Please try again."));
      setPlaces(cachedPlaces);
    } finally {
      if (requestSequence === placeRequestSequenceRef.current) {
        setPlaceLoading(false);
      }
    }
  }

  async function loadHome() {
    try {
      const [
        allCities,
        tripsResponse,
        savedRestaurantsResponse,
        savedCafesResponse,
        localsResponse,
        userResponse,
      ] = await Promise.all([
        fetchAllCities(),
        fetchTrips(),
        fetchSavedRestaurants(),
        fetchSavedCafes(),
        fetchLocals(),
        fetchUser(userId),
      ]);
      const userTrips = (tripsResponse?.trips ?? []).filter(
        (trip) => Number(trip?.userId) === Number(userId),
      );
      const trip = pickCurrentTrip(userTrips);
      const nextTripCity =
        allCities.find((item) => Number(item?.id) === Number(trip?.cityId)) ||
        null;
      const latestLocal = (localsResponse?.locals ?? [])[0] || null;
      const nextLocalCity =
        allCities.find(
          (item) => Number(item?.id) === Number(latestLocal?.city?.id),
        ) ||
        latestLocal?.city ||
        null;
      const savedRestaurantMap = (
        savedRestaurantsResponse?.savedRestaurants ?? []
      ).reduce((acc, saved) => {
        const placeId = saved?.restaurant?.id;
        if (placeId) {
          acc[placeId] = saved.id;
        }

        return acc;
      }, {});
      const savedCafeMap = (savedCafesResponse?.savedCafes ?? []).reduce(
        (acc, saved) => {
          const placeId = saved?.cafe?.id;
          if (placeId) {
            acc[placeId] = saved.id;
          }

          return acc;
        },
        {},
      );

      setCurrentTrip(trip);
      setTripCity(nextTripCity);
      setLocalCity(nextLocalCity);
      setPlacesByType({ restaurant: [], cafe: [] });
      setPlaces([]);
      setPlaceError(null);
      setPlaceLoading(false);
      setLocalMingleRows([]);
      setLocalMingleError(null);
      setLocalMingleLoading(false);
      setSavedRestaurantByPlaceId(savedRestaurantMap);
      setSavedCafeByPlaceId(savedCafeMap);
      setLocalUserProfile(userResponse?.user ?? null);
      setLocalAvailableTimeText(String(latestLocal?.availableTimeText || "").trim() || null);
      setHomeDataVersion((prev) => prev + 1);
    } catch {
      setCurrentTrip(null);
      setTripCity(null);
      setLocalCity(null);
      setPlaces([]);
      setPlacesByType({ restaurant: [], cafe: [] });
      setPlaceLoading(false);
      setPlaceError(null);
      setLocalMingleRows([]);
      setLocalMingleError(null);
      setLocalMingleLoading(false);
      setSavedRestaurantByPlaceId({});
      setSavedCafeByPlaceId({});
      setLocalUserProfile(null);
      setLocalAvailableTimeText(null);
      setHomeDataVersion((prev) => prev + 1);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadHome();
    }, [userId]),
  );

  useEffect(() => {
    if (homeMode !== HOME_MODE_TRAVELER) {
      return;
    }
    loadPlacesForType(selectedCity?.id, activePlaceType);
  }, [homeMode, selectedCity?.id, activePlaceType, homeDataVersion]);

  useEffect(() => {
    if (homeMode !== HOME_MODE_LOCAL) {
      return;
    }

    async function loadLocalMingles() {
      if (!selectedCity?.id) {
        setLocalMingleRows([]);
        setLocalMingleLoading(false);
        setLocalMingleError(null);
        return;
      }

      setLocalMingleLoading(true);
      setLocalMingleError(null);

      try {
        const mingleResponse = await fetchMingles({ cityId: selectedCity.id });
        const mingles = mingleResponse?.mingles ?? [];
        const minglersByMingle = await Promise.all(
          mingles.map(async (mingle) => {
            try {
              const response = await fetchMingleMinglers(mingle?.id);
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
        setLocalMingleRows(rows);
      } catch {
        setLocalMingleRows([]);
        setLocalMingleError(tx("밍글 지도를 불러오지 못했습니다.", "Failed to load mingle map."));
      } finally {
        setLocalMingleLoading(false);
      }
    }

    loadLocalMingles();
  }, [homeMode, selectedCity?.id, homeDataVersion, tx]);

  async function handleSave(placeId) {
    if (activePlaceType === "cafe") {
      const savedCafeId = savedCafeByPlaceId[placeId];
      if (savedCafeId) {
        await deleteSavedCafe(savedCafeId);
        setSavedCafeByPlaceId((prev) => {
          const next = { ...prev };
          delete next[placeId];
          return next;
        });
        return;
      }

      const response = await createSavedCafe(placeId);
      const saved = response?.savedCafe;
      if (saved?.cafe?.id && saved?.id) {
        setSavedCafeByPlaceId((prev) => ({
          ...prev,
          [saved.cafe.id]: saved.id,
        }));
      }
      return;
    }

    const savedRestaurantId = savedRestaurantByPlaceId[placeId];
    if (savedRestaurantId) {
      await deleteSavedRestaurant(savedRestaurantId);
      setSavedRestaurantByPlaceId((prev) => {
        const next = { ...prev };
        delete next[placeId];
        return next;
      });
      return;
    }

    const response = await createSavedRestaurant(placeId);
    const saved = response?.savedRestaurant;
    if (saved?.restaurant?.id && saved?.id) {
      setSavedRestaurantByPlaceId((prev) => ({
        ...prev,
        [saved.restaurant.id]: saved.id,
      }));
    }
  }

  const visiblePlaces = places.slice(0, 3);
  const quickMatchEnabled = Boolean(selectedCity?.id);
  const nearbyCityCenter = useMemo(
    () => resolveCityCenter(selectedCity, placesByType),
    [placesByType, selectedCity],
  );
  const selectedCityCenter = useMemo(
    () => resolveCityCenter(selectedCity, { restaurant: [], cafe: [] }),
    [selectedCity],
  );
  const localMarkers = useMemo(() => {
    return localMingleRows
      .map((row) => {
        const latitude = toCoordinateValue(row?.mingle?.latitude);
        const longitude = toCoordinateValue(row?.mingle?.longitude);
        if (!isValidCoordinatePair(latitude, longitude)) {
          return null;
        }

        return {
          id: row?.mingle?.id,
          title: row?.mingle?.title || tx("밍글", "Mingle"),
          coordinate: { latitude, longitude },
          minglerCount: row?.minglers?.length ?? 0,
        };
      })
      .filter(Boolean);
  }, [localMingleRows, tx]);
  const localMapRegion = useMemo(() => {
    if (selectedCityCenter) {
      return {
        latitude: selectedCityCenter.latitude,
        longitude: selectedCityCenter.longitude,
        latitudeDelta: 0.035,
        longitudeDelta: 0.035,
      };
    }

    if (localMarkers.length > 0) {
      return {
        latitude: localMarkers[0].coordinate.latitude,
        longitude: localMarkers[0].coordinate.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }

    return {
      latitude: 37.5665,
      longitude: 126.978,
      latitudeDelta: 0.25,
      longitudeDelta: 0.25,
    };
  }, [localMarkers, selectedCityCenter]);

  return (
    <View style={styles.mainContainer}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topIcons}>
          <Alarm />
          <Pressable onPress={() => navigation.navigate("ProfileEdit")}>
            <Person />
          </Pressable>
          <Pressable style={styles.logoutMiniButton} onPress={logout}>
            <Text style={styles.logoutMiniButtonText}>{tx("로그아웃", "Logout")}</Text>
          </Pressable>
        </View>

        <View style={styles.modeToggleRow}>
          <Pressable
            style={[
              styles.modeToggleButton,
              homeMode === HOME_MODE_LOCAL && styles.modeToggleButtonActive,
            ]}
            onPress={() => setHomeMode(HOME_MODE_LOCAL)}
          >
            <Text
              style={[
                styles.modeToggleText,
                homeMode === HOME_MODE_LOCAL && styles.modeToggleTextActive,
              ]}
            >
              {tx("홈", "Home")}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.modeToggleButton,
              homeMode === HOME_MODE_TRAVELER && styles.modeToggleButtonActive,
            ]}
            onPress={() => setHomeMode(HOME_MODE_TRAVELER)}
          >
            <Text
              style={[
                styles.modeToggleText,
                homeMode === HOME_MODE_TRAVELER && styles.modeToggleTextActive,
              ]}
            >
              {tx("여행", "Trip")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.locationSection}>
          <View style={styles.locationRow}>
          <Text style={styles.locationKo}>
              {selectedCityDisplayName || tx("어디로 떠나시나요?", "Where to next?")}
            </Text>
            <Position width={18} height={18} />
          </View>
          <Text style={styles.locationEn}>
            {selectedCityDisplayName || tx("어디로 떠나시나요?", "Where to next?")}
          </Text>
        </View>

        {homeMode === HOME_MODE_TRAVELER ? (
          <View style={styles.quickRow}>
            <TouchableWithoutFeedback
              onPress={() =>
                navigation.navigate("Nearby", {
                  cityId: selectedCity?.id,
                  cityName:
                    selectedCityDisplayName ||
                    "",
                  cityLatitude: nearbyCityCenter?.latitude ?? null,
                  cityLongitude: nearbyCityCenter?.longitude ?? null,
                })
              }
            >
              <View style={styles.nearbyCard}>
                <ImageBackground
                  source={require("../../images/nearbyCardImage.jpg")}
                  style={StyleSheet.absoluteFill}
                  imageStyle={{ borderRadius: 22 }}
                />
                <LinearGradient
                  colors={["rgba(1, 105, 254, 0.5)", "rgb(1, 105, 254)"]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.quickCardHeader}>
                <Text style={styles.nearbyTitle}>{tx("근처 밍글러", "Nearby Minglers")}</Text>
                  <Direction width={18} height={18} />
                </View>
                <Text style={styles.nearbyBody}>
                  {currentTrip?.title
                    ? tx(`${currentTrip.title} 같이 하실 분`, `${currentTrip.title} companions`)
                    : tx("여행자를 만나보세요", "Meet travelers")}
                </Text>
              </View>
            </TouchableWithoutFeedback>

            <View style={styles.rightQuickStack}>
              <TouchableWithoutFeedback
                onPress={() =>
                  quickMatchEnabled &&
                  navigation.navigate("QuickMatch", {
                    cityId: selectedCity?.id,
                  })
                }
              >
                <View
                  style={[
                    styles.quickButtonCard,
                    !quickMatchEnabled && styles.quickButtonCardDisabled,
                  ]}
                >
                  <Quick />
                  <Text
                    style={[
                      styles.quickButtonText,
                      !quickMatchEnabled && styles.quickButtonTextDisabled,
                    ]}
                  >
                    {quickMatchEnabled
                      ? tx("빠른 매칭", "Quick Match")
                      : tx("지금은 사용할 수 없어요.", "Not available now.")}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
              <TouchableWithoutFeedback
                onPress={() => navigation.navigate("Chats")}
              >
                <View style={styles.quickButtonCard}>
                <View style={styles.communityIconWrap}>
                  <Speech />
                </View>
                <Text style={styles.quickButtonText}>{tx("로컬 커뮤니티", "Local Community")}</Text>
              </View>
              </TouchableWithoutFeedback>
            </View>
          </View>
        ) : null}

        {homeMode === HOME_MODE_LOCAL ? (
          <Pressable
            style={styles.localProfileCard}
            onPress={() => navigation.navigate("ProfileEdit")}
          >
            <View style={styles.quickCardHeader}>
              <Text style={styles.nearbyTitle}>{tx(`${localDisplayName} 밍글러`, `${localDisplayName} Mingler`)}</Text>
              <Direction width={18} height={18} />
            </View>
            <Text style={styles.nearbyMetaText}>{localAvailabilityLabel}</Text>
            <View style={styles.localHeroChipRow}>
              {localCardKeywords.map((keyword) => (
                <View key={keyword?.id} style={styles.localHeroChip}>
                  <Text style={styles.localHeroChipText}>
                    #
                    {isKorean
                      ? (keyword?.label || "")
                      : (keyword?.labelEnglish || keyword?.label || "")}
                  </Text>
                </View>
              ))}
              <View style={styles.localHeroPlusChip}>
                <Text style={styles.localHeroPlusChipText}>+</Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {homeMode === HOME_MODE_LOCAL ? (
          <View style={styles.localActionRow}>
            <TouchableWithoutFeedback
              onPress={() =>
                quickMatchEnabled &&
                navigation.navigate("QuickMatch", {
                  cityId: selectedCity?.id,
                })
              }
            >
              <View
                style={[
                  styles.localActionButtonCard,
                  !quickMatchEnabled && styles.quickButtonCardDisabled,
                ]}
              >
                <Quick />
                <Text
                  style={[
                    styles.quickButtonText,
                    !quickMatchEnabled && styles.quickButtonTextDisabled,
                  ]}
                >
                  {quickMatchEnabled
                    ? tx("빠른 매칭", "Quick Match")
                    : tx("지금은 사용할 수 없어요.", "Not available now.")}
                </Text>
              </View>
            </TouchableWithoutFeedback>
            <TouchableWithoutFeedback
              onPress={() => navigation.navigate("Chats")}
            >
              <View style={styles.localActionButtonCard}>
                <View style={styles.communityIconWrap}>
                  <Speech />
                </View>
                <Text style={styles.quickButtonText}>{tx("로컬 커뮤니티", "Local Community")}</Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        ) : null}

        {homeMode === HOME_MODE_TRAVELER ? (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{tx("실시간 인기", "Trending Now")}</Text>
            <Text style={styles.sectionTime}>{currentTime}</Text>
          </View>
        ) : null}

        {homeMode === HOME_MODE_TRAVELER ? (
          <ChipRow activeId={activeChip} onSelect={setActiveChip} tx={tx} />
        ) : null}

        {homeMode === HOME_MODE_TRAVELER ? (
          <View style={styles.popularPanel}>
            {visiblePlaces.map((place, idx) => (
              <Pressable key={place.id || idx} style={styles.placeCard}>
                <ImageBackground
                  source={
                    place.imageUrl
                      ? { uri: place.imageUrl }
                      : require("../../images/bookmarkBackground.png")
                  }
                  style={styles.placeImage}
                  imageStyle={styles.placeImageRadius}
                >
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{idx + 1}</Text>
                  </View>
                  <Pressable
                    style={styles.bookmarkBtn}
                    hitSlop={12}
                    onPress={() => handleSave(place.id)}
                  >
                    <Ionicons
                      name={
                        activePlaceType === "cafe"
                          ? savedCafeByPlaceId[place.id]
                            ? "bookmark"
                            : "bookmark-outline"
                          : savedRestaurantByPlaceId[place.id]
                            ? "bookmark"
                            : "bookmark-outline"
                      }
                      size={20}
                      color="#ffffff"
                    />
                  </Pressable>
                  <LinearGradient
                    colors={["transparent", "rgba(0,0,0,0.75)"]}
                    style={styles.placeGradient}
                  />
                  <View style={styles.placeFooter}>
                    <View style={styles.placeTextCol}>
                      <Text style={styles.placeNameKo}>
                        {place.name || "-"}
                      </Text>
                      <Text style={styles.placeNameEn}>
                        {place.address || "-"}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color="#ffffff"
                    />
                  </View>
                </ImageBackground>
              </Pressable>
            ))}
            {activePlaceType == null ? (
              <Text style={styles.emptyText}>
                {tx("해당 태그는 아직 준비 중입니다.", "This tag is coming soon.")}
              </Text>
            ) : null}
            {activePlaceType != null && placeLoading ? (
              <View style={styles.pendingWrap}>
                <ActivityIndicator size="small" color="#1C73F0" />
                <Text style={styles.pendingText}>
                  {activePlaceType === "cafe"
                    ? tx("카페를 불러오는 중...", "Loading cafes...")
                    : tx("식당을 불러오는 중...", "Loading restaurants...")}
                </Text>
              </View>
            ) : null}
            {activePlaceType != null && !placeLoading && placeError ? (
              <Text style={styles.emptyText}>{placeError}</Text>
            ) : null}
            {activePlaceType != null &&
            !placeLoading &&
            !placeError &&
            visiblePlaces.length === 0 ? (
              <Text style={styles.emptyText}>{tx("표시할 장소가 없습니다.", "No places to show.")}</Text>
            ) : null}

            <View style={styles.moreRow}>
              <Text style={styles.moreText}>{tx("더보기", "More")}</Text>
              <Ionicons name="chevron-forward" size={14} color="#818181" />
            </View>
          </View>
        ) : null}

        {homeMode === HOME_MODE_LOCAL ? (
          <View style={styles.sectionHeaderLocal}>
            <Text style={styles.sectionTitle}>{tx("나의 밍글", "My Mingles")}</Text>
          </View>
        ) : null}

        {homeMode === HOME_MODE_LOCAL ? (
          <View style={styles.localMapPanel}>
            {localMingleLoading ? (
              <View style={styles.pendingWrap}>
                <ActivityIndicator size="small" color="#1C73F0" />
                <Text style={styles.pendingText}>{tx("밍글을 불러오는 중...", "Loading mingles...")}</Text>
              </View>
            ) : null}
            {localMingleError ? (
              <Text style={styles.emptyText}>{localMingleError}</Text>
            ) : null}
            {!localMingleLoading && !localMingleError ? (
              <MapView
                key={`local-map-${selectedCity?.id || "default"}`}
                style={styles.localMap}
                region={localMapRegion}
              >
                {localMarkers.map((marker) => (
                  <Marker
                    key={marker.id}
                    coordinate={marker.coordinate}
                    title={marker.title}
                    description={tx(`참여 ${marker.minglerCount}명`, `${marker.minglerCount} joined`)}
                  >
                    <Image source={require("../../images/mingle_marker_selected.png")} style={styles.localMarkerImage} />
                  </Marker>
                ))}
              </MapView>
            ) : null}
            {!localMingleLoading &&
            !localMingleError &&
            localMarkers.length === 0 ? (
              <Text style={styles.localMapEmptyText}>
                {tx("표시할 밍글 좌표가 없습니다.", "No mingle coordinates to show.")}
              </Text>
            ) : null}
            <Pressable
              style={styles.localMapFloatingPlus}
              onPress={() =>
                navigation.navigate("Nearby", {
                  cityId: selectedCity?.id,
                  cityName: selectedCityDisplayName || "",
                  cityLatitude: nearbyCityCenter?.latitude ?? null,
                  cityLongitude: nearbyCityCenter?.longitude ?? null,
                })
              }
            >
              <Ionicons name="add" size={30} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
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
    alignItems: "center",
    gap: 14,
  },
  modeToggleRow: {
    flexDirection: "row",
    backgroundColor: "#E8ECF3",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeToggleButton: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modeToggleButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  modeToggleText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "700",
  },
  modeToggleTextActive: {
    color: "#1C73F0",
  },
  logoutMiniButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    backgroundColor: "#FFF",
    paddingHorizontal: 10,
    height: 24,
    justifyContent: "center",
  },
  logoutMiniButtonText: {
    color: "#616161",
    fontSize: 11,
    fontWeight: "700",
  },
  locationSection: {
    gap: 6,
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
  localProfileCard: {
    borderRadius: 22,
    backgroundColor: "#1C73F0",
    minHeight: 154,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: "space-between",
  },
  localActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  localActionButtonCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 16,
    height: 66,
    paddingHorizontal: 16,
    justifyContent: "center",
    gap: 6,
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
  nearbyMetaText: {
    color: "#DDEBFF",
    fontSize: 15,
    fontWeight: "700",
  },
  localHeroChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  localHeroChip: {
    backgroundColor: "#F3F8FF",
    borderRadius: 12,
    paddingHorizontal: 9,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  localHeroChipText: {
    color: "#1C73F0",
    fontSize: 12,
    fontWeight: "700",
  },
  localHeroPlusChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F3F8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  localHeroPlusChipText: {
    color: "#1C73F0",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 14,
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
  quickButtonCardDisabled: {
    backgroundColor: "#EFF2F7",
  },
  quickButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  quickButtonTextDisabled: {
    fontSize: 13,
    color: "#6A7388",
  },
  communityIconWrap: {
    position: "relative",
    width: 28,
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
  pendingWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  pendingText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
  },
  sectionHeaderLocal: {
    marginTop: 2,
  },
  localMapPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 10,
    gap: 8,
    overflow: "hidden",
    position: "relative",
  },
  localMap: {
    width: "100%",
    height: 300,
    borderRadius: 18,
  },
  localMapEmptyText: {
    color: "#8A8A8A",
    fontSize: 13,
    textAlign: "center",
    paddingBottom: 4,
  },
  localMapFloatingPlus: {
    position: "absolute",
    right: 16,
    bottom: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C73F0",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  localMarkerImage: {
    width: 26,
    height: 26,
    resizeMode: "contain",
  },
});
