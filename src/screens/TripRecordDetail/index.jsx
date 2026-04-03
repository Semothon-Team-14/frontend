import { useCallback, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useLocale } from "../../locale";
import { fetchChatRooms } from "../../services/chatService";
import { fetchLocals } from "../../services/localService";
import {
  fetchMingleMinglers,
  fetchMinglePlacePhotos,
  fetchMingles,
  uploadMinglePlacePhoto,
} from "../../services/mingleService";
import { fetchAllCities } from "../../services/placeService";
import { fetchTrip } from "../../services/tripService";
import { fetchUsers } from "../../services/userService";
import { decodeUserIdFromToken, useAuth } from "../../auth";

const AVATAR_PALETTES = [
  { background: "#DCEEFF", text: "#24578B" },
  { background: "#E8ECF4", text: "#4A5568" },
  { background: "#DEFFD8", text: "#267639" },
  { background: "#FFE5C6", text: "#8D5816" },
  { background: "#F3DFFF", text: "#7A43A5" },
];

function parseDate(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return null;
  }

  const normalized = safeValue.includes("T") ? safeValue : `${safeValue}T00:00:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function overlapsTripWindow(targetDateTime, tripStartAt, tripEndAt) {
  const target = parseDate(targetDateTime);
  if (!target || !tripStartAt || !tripEndAt) {
    return false;
  }

  return target >= tripStartAt && target <= tripEndAt;
}

function formatMonthDay(date) {
  if (!date) {
    return "";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function toCityDisplayName(city, isKorean) {
  if (!city) {
    return "-";
  }

  return isKorean
    ? city?.cityNameKorean || city?.cityNameEnglish || city?.name || "-"
    : city?.cityNameEnglish || city?.cityNameKorean || city?.name || "-";
}

function toCitySubName(city, isKorean) {
  if (!city) {
    return "";
  }

  const primary = toCityDisplayName(city, isKorean);
  const secondary = isKorean
    ? city?.cityNameEnglish || city?.cityNameKorean || city?.name || ""
    : city?.cityNameKorean || city?.cityNameEnglish || city?.name || "";

  return primary === secondary ? "" : secondary;
}

function toTripRangeText(trip, isKorean) {
  const start = parseDate(trip?.startDate);
  const end = parseDate(trip?.endDate);
  if (!start || !end) {
    return isKorean ? "일정 미정" : "Schedule TBD";
  }

  return `${formatMonthDay(start)}~${formatMonthDay(end)}`;
}

function toDurationText(trip, isKorean) {
  const start = parseDate(trip?.startDate);
  const end = parseDate(trip?.endDate);
  if (!start || !end || end < start) {
    return isKorean ? "일정 미정" : "Schedule TBD";
  }

  const oneDayMs = 1000 * 60 * 60 * 24;
  const nights = Math.max(0, Math.round((end.getTime() - start.getTime()) / oneDayMs));
  return isKorean ? `${nights}박 ${nights + 1}일` : `${nights}N ${nights + 1}D`;
}

function toVisitDateText(dateTimeValue) {
  return formatMonthDay(parseDate(dateTimeValue));
}

function getAvatarPalette(id) {
  const safeId = Math.abs(Number(id || 0));
  return AVATAR_PALETTES[safeId % AVATAR_PALETTES.length];
}

function toInitial(name) {
  const safeName = String(name || "").trim();
  return safeName ? safeName.slice(0, 1).toUpperCase() : "?";
}

function mapPhotoUrls(response) {
  return (response?.photos ?? [])
    .map((photo) => String(photo?.imageUrl || "").trim())
    .filter(Boolean);
}

function MinglerAvatar({ mingler }) {
  const palette = getAvatarPalette(mingler?.id);

  return (
    <View style={styles.minglerItem}>
      <View style={[styles.minglerAvatar, { backgroundColor: palette.background }]}>
        {mingler?.profileImageUrl ? (
          <Image source={{ uri: mingler.profileImageUrl }} style={styles.minglerAvatarImage} />
        ) : (
          <Text style={[styles.minglerAvatarFallback, { color: palette.text }]}>{toInitial(mingler?.name)}</Text>
        )}
      </View>
      <Text style={styles.minglerName} numberOfLines={1}>
        {mingler?.name || "-"}
      </Text>
    </View>
  );
}

export function TripRecordDetail({ navigation, route }) {
  const { token } = useAuth();
  const { tx, isKorean } = useLocale();
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const tripId = Number(route?.params?.tripId || 0);
  const [trip, setTrip] = useState(null);
  const [city, setCity] = useState(null);
  const [localMinglers, setLocalMinglers] = useState([]);
  const [travelerMinglers, setTravelerMinglers] = useState([]);
  const [visitedPlaces, setVisitedPlaces] = useState([]);
  const [uploadingMingleId, setUploadingMingleId] = useState(null);
  const [loading, setLoading] = useState(false);

  const resetDetail = useCallback(() => {
    setTrip(null);
    setCity(null);
    setLocalMinglers([]);
    setTravelerMinglers([]);
    setVisitedPlaces([]);
  }, []);

  const loadDetail = useCallback(async () => {
    if (!tripId || !userId) {
      resetDetail();
      return;
    }

    setLoading(true);
    try {
      const [tripResponse, allCities, usersResponse, localsResponse, chatRoomsResponse] = await Promise.all([
        fetchTrip(tripId),
        fetchAllCities(),
        fetchUsers(),
        fetchLocals(),
        fetchChatRooms(),
      ]);

      const loadedTrip = tripResponse?.trip ?? null;
      if (!loadedTrip) {
        resetDetail();
        return;
      }

      const cityId = Number(loadedTrip?.cityId || 0);
      const minglesResponse = cityId > 0 ? await fetchMingles({ cityId }) : { mingles: [] };

      setTrip(loadedTrip);

      const cityMap = Object.fromEntries((allCities ?? []).map((entry) => [Number(entry?.id), entry]));
      const tripCity = cityMap[cityId] || null;
      setCity(tripCity);

      const usersById = Object.fromEntries((usersResponse?.users ?? []).map((entry) => [Number(entry?.id), entry]));
      const tripStartAt = parseDate(`${loadedTrip?.startDate}T00:00:00`);
      const tripEndAt = parseDate(`${loadedTrip?.endDate}T23:59:59`);

      const directCompanions = new Set();
      const chatRooms = chatRoomsResponse?.chatRooms ?? [];
      chatRooms.forEach((room) => {
        if (!room?.directChat) {
          return;
        }

        if (!overlapsTripWindow(room?.updatedDateTime || room?.createdDateTime, tripStartAt, tripEndAt)) {
          return;
        }

        const companionId = (room?.participantUserIds ?? []).find((participantId) => Number(participantId) !== Number(userId));
        if (Number(companionId) > 0) {
          directCompanions.add(Number(companionId));
        }
      });

      const cityMingles = (minglesResponse?.mingles ?? []).filter((entry) => (
        Number(entry?.city?.id) === cityId
        && overlapsTripWindow(entry?.meetDateTime || entry?.updatedDateTime || entry?.createdDateTime, tripStartAt, tripEndAt)
      ));

      const mingleMinglerResponses = await Promise.all(
        cityMingles.map(async (mingle) => {
          try {
            const response = await fetchMingleMinglers(mingle.id);
            return response?.minglers ?? [];
          } catch {
            return [];
          }
        }),
      );

      const mingleCompanionIds = new Set();
      mingleMinglerResponses.flat().forEach((mingler) => {
        const mingleUserId = Number(mingler?.userId || 0);
        if (mingleUserId > 0 && mingleUserId !== Number(userId)) {
          mingleCompanionIds.add(mingleUserId);
        }
      });

      const locals = localsResponse?.locals ?? [];
      const localUserIdsInTripCity = new Set(
        locals
          .filter((local) => Number(local?.city?.id) === cityId)
          .map((local) => Number(local?.userId || 0))
          .filter((id) => id > 0),
      );

      const allCompanionIds = Array.from(new Set([...directCompanions, ...mingleCompanionIds]));
      const mappedCompanions = allCompanionIds
        .map((companionId) => {
          const companion = usersById[companionId];
          return {
            id: companionId,
            name: companion?.name || `USER #${companionId}`,
            profileImageUrl: companion?.profileImageUrl || null,
            local: localUserIdsInTripCity.has(companionId),
          };
        })
        .slice(0, 12);

      setLocalMinglers(mappedCompanions.filter((entry) => entry.local));
      setTravelerMinglers(mappedCompanions.filter((entry) => !entry.local));

      const mingleVisits = cityMingles
        .filter((mingle) => String(mingle?.placeName || "").trim().length > 0)
        .map((mingle) => ({
          id: `m-${mingle?.id}`,
          mingleId: Number(mingle?.id || 0),
          placeName: String(mingle?.placeName || "-"),
          placeAddress: "",
          visitedAt: mingle?.meetDateTime || mingle?.updatedDateTime || mingle?.createdDateTime || null,
          photoUrls: [],
        }))
        .sort((a, b) => String(a?.visitedAt || "").localeCompare(String(b?.visitedAt || "")));

      const uniqueByPlaceName = [];
      const seenNames = new Set();
      mingleVisits.forEach((visit) => {
        const key = String(visit?.placeName || "").trim().toLowerCase();
        if (!key || seenNames.has(key)) {
          return;
        }

        seenNames.add(key);
        uniqueByPlaceName.push(visit);
      });

      const visitsWithPhotos = await Promise.all(
        uniqueByPlaceName.slice(0, 10).map(async (visit) => {
          if (!visit.mingleId) {
            return visit;
          }

          try {
            const response = await fetchMinglePlacePhotos(visit.mingleId);
            return {
              ...visit,
              photoUrls: mapPhotoUrls(response),
            };
          } catch {
            return visit;
          }
        }),
      );

      setVisitedPlaces(visitsWithPhotos);
    } catch {
      resetDetail();
    } finally {
      setLoading(false);
    }
  }, [resetDetail, tripId, userId]);

  useFocusEffect(
    useCallback(() => {
      loadDetail();
    }, [loadDetail]),
  );

  function openTripEdit() {
    if (!tripId) {
      return;
    }

    navigation.navigate("CreateTrip", { tripId });
  }

  async function pickAndUploadVisitPhoto(visit, source) {
    const mingleId = Number(visit?.mingleId || 0);
    if (mingleId <= 0) {
      return;
    }

    const permissionResult = source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult?.granted) {
      Alert.alert(
        tx("사진 업로드", "Photo Upload"),
        tx("사진 접근 권한이 필요합니다.", "Photo permission is required."),
      );
      return;
    }

    let pickerResult;
    try {
      pickerResult = source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.55,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.55,
          });
    } catch {
      Alert.alert(
        tx("사진 업로드", "Photo Upload"),
        tx("사진 선택기를 열 수 없습니다.", "Unable to open photo picker."),
      );
      return;
    }

    if (pickerResult?.canceled) {
      return;
    }

    const selectedAsset = pickerResult?.assets?.[0];
    if (!selectedAsset?.uri) {
      Alert.alert(
        tx("사진 업로드", "Photo Upload"),
        tx("선택된 이미지가 없습니다.", "No selected image."),
      );
      return;
    }

    try {
      setUploadingMingleId(mingleId);
      await uploadMinglePlacePhoto(mingleId, selectedAsset.uri);
      const photoResponse = await fetchMinglePlacePhotos(mingleId);
      const nextPhotoUrls = mapPhotoUrls(photoResponse);
      setVisitedPlaces((prev) => prev.map((entry) => {
        if (Number(entry?.mingleId || 0) !== mingleId) {
          return entry;
        }

        return {
          ...entry,
          photoUrls: nextPhotoUrls,
        };
      }));
    } catch (error) {
      Alert.alert(
        tx("사진 업로드", "Photo Upload"),
        error?.message || tx("사진 업로드에 실패했습니다.", "Failed to upload photo."),
      );
    } finally {
      setUploadingMingleId(null);
    }
  }

  function openVisitPhotoPicker(visit) {
    const title = tx("사진 업로드", "Upload Photo");
    const cameraText = tx("카메라", "Camera");
    const galleryText = tx("갤러리", "Gallery");
    const cancelText = tx("취소", "Cancel");

    if (Platform.OS === "ios" && ActionSheetIOS?.showActionSheetWithOptions) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options: [cameraText, galleryText, cancelText],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            pickAndUploadVisitPhoto(visit, "camera");
          }
          if (buttonIndex === 1) {
            pickAndUploadVisitPhoto(visit, "gallery");
          }
        },
      );
      return;
    }

    Alert.alert(title, undefined, [
      { text: cameraText, onPress: () => pickAndUploadVisitPhoto(visit, "camera") },
      { text: galleryText, onPress: () => pickAndUploadVisitPhoto(visit, "gallery") },
      { text: cancelText, style: "cancel" },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#141414" />
          </Pressable>
          <Text style={styles.headerTitle}>{tx("여행 기록", "Trip Record")}</Text>
        </View>

        <View style={styles.heroCard}>
          {city?.representativeImageUrl ? (
            <Image source={{ uri: city.representativeImageUrl }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <View style={styles.heroFallback}>
              <Ionicons name="image-outline" size={28} color="#B3BCC9" />
            </View>
          )}

          <View style={styles.heroBody}>
            <View style={styles.tripTopRow}>
              <View style={styles.tripTitleWrap}>
                <Text style={styles.tripTitle} numberOfLines={1}>
                  {trip?.title || toCityDisplayName(city, isKorean)}
                </Text>
                <Pressable onPress={openTripEdit} hitSlop={12} style={styles.editButton}>
                  <Ionicons name="pencil" size={13} color="#B0B6C2" />
                </Pressable>
              </View>
              <Text style={styles.tripDateRange}>{toTripRangeText(trip, isKorean)}</Text>
            </View>

            <View style={styles.tripSubRow}>
              <Text style={styles.tripSubCity} numberOfLines={1}>
                {toCitySubName(city, isKorean)}
              </Text>
              <Text style={styles.tripDuration}>{toDurationText(trip, isKorean)}</Text>
            </View>

            <View style={styles.heroDivider} />

            <Text style={styles.sectionTitleBlue}>{tx("함께한 밍글러", "Minglers Together")}</Text>

            <View style={styles.minglerColumns}>
              <View style={styles.minglerColumn}>
                <Text style={styles.columnTitle}>{tx("로컬", "Local")}</Text>
                <View style={styles.minglerRow}>
                  {localMinglers.length === 0 ? (
                    <Text style={styles.emptyColumnText}>{tx("아직 없어요", "None yet")}</Text>
                  ) : (
                    localMinglers.slice(0, 3).map((mingler) => (
                      <MinglerAvatar key={`local-${mingler.id}`} mingler={mingler} />
                    ))
                  )}
                </View>
              </View>

              <View style={styles.verticalDivider} />

              <View style={styles.minglerColumn}>
                <Text style={styles.columnTitle}>{tx("여행자", "Traveler")}</Text>
                <View style={styles.minglerRow}>
                  {travelerMinglers.length === 0 ? (
                    <Text style={styles.emptyColumnText}>{tx("아직 없어요", "None yet")}</Text>
                  ) : (
                    travelerMinglers.slice(0, 3).map((mingler) => (
                      <MinglerAvatar key={`traveler-${mingler.id}`} mingler={mingler} />
                    ))
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitleBlue}>{tx("방문한 장소", "Visited Places")}</Text>

          {loading && visitedPlaces.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#1D6FF2" />
            </View>
          ) : null}

          {!loading && visitedPlaces.length === 0 ? (
            <Text style={styles.emptyVisitText}>
              {tx("여행 기간 중 저장된 방문 장소가 없어요.", "No saved places during this trip.")}
            </Text>
          ) : null}

          {visitedPlaces.map((visit, index) => {
            const isUploading = Number(uploadingMingleId) === Number(visit?.mingleId);
            return (
              <View key={visit.id} style={[styles.visitItem, index > 0 && styles.visitItemWithTopBorder]}>
                <Text style={styles.visitDate}>{toVisitDateText(visit.visitedAt)}</Text>
                <Text style={styles.visitName}>{visit.placeName}</Text>
                {visit.placeAddress ? <Text style={styles.visitSubName}>{visit.placeAddress}</Text> : null}

                <View style={styles.visitThumbRow}>
                  {(visit.photoUrls ?? []).slice(0, 2).map((photoUrl, photoIndex) => (
                    <Image key={`${visit.id}-photo-${photoIndex}`} source={{ uri: photoUrl }} style={styles.visitThumbImage} />
                  ))}

                  <Pressable
                    style={[styles.visitPlusTile, isUploading && styles.visitPlusTileUploading]}
                    onPress={() => openVisitPhotoPicker(visit)}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <ActivityIndicator size="small" color="#8F97A6" />
                    ) : (
                      <View style={styles.visitPlusIconCircle}>
                        <Ionicons name="add" size={18} color="#8F97A6" />
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  contentContainer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 36,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent:"flex-start",
    gap: 8,
    marginBottom: 2,
  },
  backButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000000",
  },
  heroCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EDF2",
  },
  heroImage: {
    width: "100%",
    height: 158,
  },
  heroFallback: {
    width: "100%",
    height: 158,
    backgroundColor: "#D7E1EF",
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: "#FFFFFF",
  },
  tripTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  tripTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    paddingRight: 6,
  },
  tripTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "800",
    color: "#1A1B1E",
    letterSpacing: -0.2,
  },
  editButton: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tripDateRange: {
    fontSize: 14,
    fontWeight: "800",
    color: "#22242A",
    letterSpacing: -0.2,
  },
  tripSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 4,
  },
  tripSubCity: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#9FA7B4",
  },
  tripDuration: {
    fontSize: 11,
    fontWeight: "700",
    color: "#A5ADBA",
  },
  heroDivider: {
    height: 1,
    backgroundColor: "#EDF0F4",
    marginVertical: 16,
  },
  sectionTitleBlue: {
    color: "#0169FE",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -2,
  },
  minglerColumns: {
    flexDirection: "row",
    alignItems: "stretch",
    marginTop: 12,
  },
  minglerColumn: {
    flex: 1,
  },
  verticalDivider: {
    width: 1,
    backgroundColor: "#EEF1F5",
    marginHorizontal: 14,
  },
  columnTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#A2A9B6",
    marginBottom: 10,
  },
  minglerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flexWrap: "wrap",
  },
  minglerItem: {
    width: 58,
    alignItems: "center",
  },
  minglerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  minglerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  minglerAvatarFallback: {
    fontSize: 20,
    fontWeight: "800",
  },
  minglerName: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: "700",
    color: "#2A2C31",
    textAlign: "center",
  },
  emptyColumnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A5ADBA",
  },
  sectionCard: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E9EDF2",
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
  },
  loadingRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },
  emptyVisitText: {
    color: "#9AA2B0",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
  },
  visitItem: {
    paddingTop: 14,
    paddingBottom: 8,
  },
  visitItemWithTopBorder: {
    borderTopWidth: 1,
    borderTopColor: "#EDF0F4",
  },
  visitDate: {
    color: "#737C8C",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  visitName: {
    color: "#17191D",
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  visitSubName: {
    color: "#8B93A2",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  visitThumbRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  visitThumbImage: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: "#D5DAE4",
  },
  visitPlusTile: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: "#D7DDE8",
    alignItems: "center",
    justifyContent: "center",
  },
  visitPlusTileUploading: {
    opacity: 0.7,
  },
  visitPlusIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#C8D0DC",
    alignItems: "center",
    justifyContent: "center",
  },
});
