import { useCallback, useMemo, useState } from "react";
import { ActionSheetIOS, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useLocale } from "../../locale";
import { fetchChatRooms } from "../../services/chatService";
import { fetchLocals } from "../../services/localService";
import { fetchMingleMinglers, fetchMinglePlacePhotos, fetchMingles, uploadMinglePlacePhoto } from "../../services/mingleService";
import { fetchAllCities } from "../../services/placeService";
import { fetchTrip } from "../../services/tripService";
import { fetchUsers } from "../../services/userService";
import { decodeUserIdFromToken, useAuth } from "../../auth";

function parseDate(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) {
    return null;
  }
  const normalized = safeValue.includes("T") ? safeValue : `${safeValue}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function overlapsTripWindow(targetDateTime, tripStartAt, tripEndAt) {
  const target = parseDate(targetDateTime);
  if (!target || !tripStartAt || !tripEndAt) {
    return false;
  }
  return target >= tripStartAt && target <= tripEndAt;
}

function overlapsTripPeriod(startDateTime, endDateTime, tripStartAt, tripEndAt) {
  const startAt = parseDate(startDateTime);
  const endAt = parseDate(endDateTime) || startAt;
  if (!startAt || !endAt || !tripStartAt || !tripEndAt) {
    return false;
  }
  return startAt <= tripEndAt && endAt >= tripStartAt;
}

function toCityDisplayName(city, isKorean) {
  if (!city) {
    return "-";
  }
  if (isKorean) {
    return city?.cityNameKorean || city?.cityNameEnglish || city?.name || "-";
  }
  return city?.cityNameEnglish || city?.cityNameKorean || city?.name || "-";
}

function toCitySubName(city, isKorean) {
  if (!city) {
    return "";
  }
  if (isKorean) {
    return city?.cityNameEnglish || city?.cityNameKorean || city?.name || "";
  }
  return city?.cityNameKorean || city?.cityNameEnglish || city?.name || "";
}

function toTripRangeText(trip, isKorean) {
  const startRaw = String(trip?.startDate || "").slice(5).replace("-", "/");
  const endRaw = String(trip?.endDate || "").slice(5).replace("-", "/");
  if (!startRaw || !endRaw) {
    return isKorean ? "일정 미정" : "Schedule TBD";
  }
  return `${startRaw}~${endRaw}`;
}

function toDurationText(trip, isKorean) {
  const start = parseDate(trip?.startDate);
  const end = parseDate(trip?.endDate);
  if (!start || !end || end < start) {
    return isKorean ? "일정 미정" : "Schedule TBD";
  }
  const nights = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return isKorean ? `${nights}박 ${nights + 1}일` : `${nights}N ${nights + 1}D`;
}

function toVisitDateText(dateTimeValue) {
  const date = parseDate(dateTimeValue);
  if (!date) {
    return "";
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
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

  const loadDetail = useCallback(async () => {
    if (!tripId || !userId) {
      setTrip(null);
      setCity(null);
      setLocalMinglers([]);
      setTravelerMinglers([]);
      setVisitedPlaces([]);
      return;
    }

    setLoading(true);
    try {
      const [tripResponse, allCities, usersResponse, localsResponse, chatRoomsResponse, minglesResponse] = await Promise.all([
        fetchTrip(tripId),
        fetchAllCities(),
        fetchUsers(),
        fetchLocals(),
        fetchChatRooms(),
        fetchMingles(),
      ]);

      const loadedTrip = tripResponse?.trip ?? null;
      setTrip(loadedTrip);
      const cityMap = Object.fromEntries((allCities ?? []).map((entry) => [Number(entry?.id), entry]));
      const tripCity = cityMap[Number(loadedTrip?.cityId)] || null;
      setCity(tripCity);

      const usersById = Object.fromEntries((usersResponse?.users ?? []).map((entry) => [Number(entry?.id), entry]));
      const tripStartAt = parseDate(`${loadedTrip?.startDate}T00:00:00`);
      const tripEndAt = parseDate(`${loadedTrip?.endDate}T23:59:59`);

      const chatRooms = chatRoomsResponse?.chatRooms ?? [];
      const directRooms = chatRooms.filter((room) => Boolean(room?.directChat));
      const overlappingDirectRooms = directRooms.filter((room) =>
        overlapsTripPeriod(room?.createdDateTime, room?.updatedDateTime, tripStartAt, tripEndAt),
      );
      const selectedDirectRooms = overlappingDirectRooms.length > 0 ? overlappingDirectRooms : directRooms;
      const directCompanions = new Set();
      selectedDirectRooms.forEach((room) => {
        const companionId = (room?.participantUserIds ?? []).find(
          (participantId) => Number(participantId) !== Number(userId),
        );
        if (Number(companionId) > 0) {
          directCompanions.add(Number(companionId));
        }
      });

      const cityMingles = (minglesResponse?.mingles ?? []).filter((entry) => {
        return Number(entry?.city?.id) === Number(loadedTrip?.cityId);
      });

      const mingleRows = await Promise.all(
        cityMingles.map(async (mingle) => {
          try {
            const response = await fetchMingleMinglers(mingle.id);
            return {
              mingle,
              minglers: response?.minglers ?? [],
            };
          } catch {
            return {
              mingle,
              minglers: [],
            };
          }
        }),
      );

      const joinedMingleRows = mingleRows.filter((row) =>
        (row?.minglers ?? []).some((mingler) => Number(mingler?.userId) === Number(userId)),
      );

      const overlapMingleRows = joinedMingleRows.filter((row) => {
        const myMembership = (row?.minglers ?? []).find(
          (mingler) => Number(mingler?.userId) === Number(userId),
        );
        const membershipOverlaps = overlapsTripPeriod(
          myMembership?.createdDateTime,
          myMembership?.updatedDateTime,
          tripStartAt,
          tripEndAt,
        );
        if (membershipOverlaps) {
          return true;
        }
        return overlapsTripWindow(row?.mingle?.meetDateTime, tripStartAt, tripEndAt);
      });
      const relevantMingleRows = overlapMingleRows.length > 0 ? overlapMingleRows : joinedMingleRows;

      const mingleCompanionIds = new Set();
      relevantMingleRows.flatMap((row) => row?.minglers ?? []).forEach((mingler) => {
        const mingleUserId = Number(mingler?.userId || 0);
        if (mingleUserId > 0 && mingleUserId !== Number(userId)) {
          mingleCompanionIds.add(mingleUserId);
        }
      });

      const allCompanionIds = Array.from(new Set([...directCompanions, ...mingleCompanionIds]));
      const locals = localsResponse?.locals ?? [];
      const localUserIdsInTripCity = new Set(
        locals
          .filter((local) => Number(local?.city?.id) === Number(loadedTrip?.cityId))
          .map((local) => Number(local?.userId || 0))
          .filter((id) => id > 0),
      );

      const mappedCompanions = allCompanionIds
        .filter((companionId) => Number(companionId) !== Number(userId))
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

      const mingleVisits = relevantMingleRows
        .filter((row) => String(row?.mingle?.placeName || "").trim().length > 0)
        .map((row) => {
          const myMembership = (row?.minglers ?? []).find(
            (mingler) => Number(mingler?.userId) === Number(userId),
          );
          return {
            id: `m-${row?.mingle?.id}`,
            mingleId: Number(row?.mingle?.id || 0),
            placeName: String(row?.mingle?.placeName || "-"),
          placeAddress: "",
            visitedAt:
              row?.mingle?.meetDateTime ||
              myMembership?.updatedDateTime ||
              myMembership?.createdDateTime ||
              row?.mingle?.updatedDateTime ||
              row?.mingle?.createdDateTime ||
              null,
          imageUrls: [],
          };
        })
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
              imageUrls: (response?.photos ?? []).map((photo) => photo?.imageUrl).filter(Boolean),
            };
          } catch {
            return visit;
          }
        }),
      );
      setVisitedPlaces(visitsWithPhotos);
    } catch {
      setTrip(null);
      setCity(null);
      setLocalMinglers([]);
      setTravelerMinglers([]);
      setVisitedPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [tripId, userId]);

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
      Alert.alert(tx("사진 업로드", "Photo Upload"), tx("사진 접근 권한이 필요합니다.", "Photo permission is required."));
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
      Alert.alert(tx("사진 업로드", "Photo Upload"), tx("사진을 불러올 수 없습니다.", "Unable to open photo picker."));
      return;
    }

    if (pickerResult?.canceled) {
      return;
    }
    const selectedAsset = pickerResult?.assets?.[0];
    if (!selectedAsset?.uri) {
      Alert.alert(tx("사진 업로드", "Photo Upload"), tx("선택된 이미지가 없습니다.", "No selected image."));
      return;
    }

    const optimisticUri = selectedAsset.uri;
    setVisitedPlaces((prev) => prev.map((entry) => {
      if (Number(entry?.mingleId || 0) !== mingleId) {
        return entry;
      }
      const existing = Array.isArray(entry?.imageUrls) ? entry.imageUrls : [];
      return {
        ...entry,
        imageUrls: [...existing, optimisticUri],
      };
    }));

    try {
      setUploadingMingleId(mingleId);
      const uploadResponse = await uploadMinglePlacePhoto(mingleId, selectedAsset.uri);
      const uploadedImageUrl = uploadResponse?.photo?.imageUrl || null;
      setVisitedPlaces((prev) => prev.map((entry) => {
        if (Number(entry?.mingleId || 0) !== mingleId) {
          return entry;
        }
        const existing = Array.isArray(entry?.imageUrls) ? entry.imageUrls : [];
        const withoutOptimistic = existing.filter((url) => url !== optimisticUri);
        if (!uploadedImageUrl) {
          return {
            ...entry,
            imageUrls: withoutOptimistic,
          };
        }
        return {
          ...entry,
          imageUrls: [...withoutOptimistic, uploadedImageUrl],
        };
      }));
    } catch (error) {
      setVisitedPlaces((prev) => prev.map((entry) => {
        if (Number(entry?.mingleId || 0) !== mingleId) {
          return entry;
        }
        const existing = Array.isArray(entry?.imageUrls) ? entry.imageUrls : [];
        return {
          ...entry,
          imageUrls: existing.filter((url) => url !== optimisticUri),
        };
      }));
      Alert.alert(tx("사진 업로드", "Photo Upload"), error?.message || tx("사진 업로드에 실패했습니다.", "Failed to upload photo."));
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#131313" />
        </Pressable>
        <Text style={styles.headerTitle}>{tx("여행 기록", "Trip Record")}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        {city?.representativeImageUrl ? (
          <Image source={{ uri: city.representativeImageUrl }} style={styles.heroImage} resizeMode="cover" />
        ) : (
          <View style={styles.heroFallback} />
        )}
        <View style={styles.heroBody}>
          <View style={styles.tripTopRow}>
            <View style={styles.tripTitleWrap}>
              <Text style={styles.tripTitle}>{trip?.title || toCityDisplayName(city, isKorean)}</Text>
              <Pressable onPress={openTripEdit} hitSlop={12}>
                <Ionicons name="pencil" size={14} color="#AAB0BB" />
              </Pressable>
            </View>
            <Text style={styles.tripDateRange}>{toTripRangeText(trip, isKorean)}</Text>
          </View>
          <View style={styles.tripSubRow}>
            <Text style={styles.tripSubCity}>{toCitySubName(city, isKorean)}</Text>
            <Text style={styles.tripDuration}>{toDurationText(trip, isKorean)}</Text>
          </View>

          <View style={styles.divider} />

          <Text style={styles.sectionBlueTitle}>{tx("함께한 밍글러", "Minglers Together")}</Text>
          <View style={styles.minglerColumns}>
            <View style={styles.minglerColumn}>
              <Text style={styles.columnTitle}>{tx("로컬", "Local")}</Text>
              <View style={styles.minglerRow}>
                {localMinglers.length === 0 ? (
                  <Text style={styles.emptyColumnText}>{tx("없음", "None")}</Text>
                ) : null}
                {localMinglers.slice(0, 3).map((mingler) => (
                  <View key={`local-${mingler.id}`} style={styles.minglerItem}>
                    <View style={styles.minglerAvatar}>
                      {mingler?.profileImageUrl ? <Image source={{ uri: mingler.profileImageUrl }} style={styles.minglerAvatarImage} /> : null}
                    </View>
                    <Text style={styles.minglerName} numberOfLines={1}>{mingler.name}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.verticalDivider} />
            <View style={styles.minglerColumn}>
              <Text style={styles.columnTitle}>{tx("여행자", "Traveler")}</Text>
              <View style={styles.minglerRow}>
                {travelerMinglers.length === 0 ? (
                  <Text style={styles.emptyColumnText}>{tx("없음", "None")}</Text>
                ) : null}
                {travelerMinglers.slice(0, 3).map((mingler) => (
                  <View key={`traveler-${mingler.id}`} style={styles.minglerItem}>
                    <View style={styles.minglerAvatar}>
                      {mingler?.profileImageUrl ? <Image source={{ uri: mingler.profileImageUrl }} style={styles.minglerAvatarImage} /> : null}
                    </View>
                    <Text style={styles.minglerName} numberOfLines={1}>{mingler.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.visitsCard}>
        <Text style={styles.sectionBlueTitle}>{tx("방문한 장소", "Visited Places")}</Text>
        {visitedPlaces.length === 0 && !loading ? (
          <Text style={styles.emptyVisitText}>{tx("여행 기간 내 방문 저장된 장소가 없습니다.", "No saved places in this trip period.")}</Text>
        ) : null}
        {visitedPlaces.map((visit, index) => (
          <View key={visit.id} style={[styles.visitItem, index > 0 && styles.visitItemWithTopBorder]}>
            <Text style={styles.visitDate}>{toVisitDateText(visit.visitedAt)}</Text>
            <Text style={styles.visitName}>{visit.placeName}</Text>
            <Text style={styles.visitSubName}>{visit.placeAddress}</Text>
            <View style={styles.visitThumbRow}>
              {(visit?.imageUrls ?? []).length === 0 ? <View style={[styles.visitThumbImage, styles.visitThumbPlaceholder]} /> : null}
              {(visit?.imageUrls ?? []).map((imageUrl) => (
                <Image key={`${visit.id}-${imageUrl}`} source={{ uri: imageUrl }} style={styles.visitThumbImage} />
              ))}
              <Pressable
                style={[styles.visitPlusTile, Number(uploadingMingleId) === Number(visit?.mingleId) && styles.visitPlusTileUploading]}
                onPress={() => openVisitPhotoPicker(visit)}
                disabled={Number(uploadingMingleId) === Number(visit?.mingleId)}
              >
                <Ionicons name="add" size={18} color="#9CA5B5" />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ECEDEF",
  },
  contentContainer: {
    paddingTop: 52,
    paddingHorizontal: 18,
    paddingBottom: 32,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#171717",
    letterSpacing: -0.4,
  },
  headerSpacer: {
    width: 24,
  },
  heroCard: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#F7F7F8",
  },
  heroImage: {
    width: "100%",
    height: 156,
  },
  heroFallback: {
    width: "100%",
    height: 156,
    backgroundColor: "#CAD7EF",
  },
  heroBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: "#F4F4F6",
  },
  tripTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  tripTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  tripTitle: {
    fontSize: 30,
    fontWeight: "900",
    color: "#151515",
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  tripDateRange: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1D1E21",
  },
  tripSubRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  tripSubCity: {
    fontSize: 12,
    fontWeight: "600",
    color: "#A2A8B3",
  },
  tripDuration: {
    fontSize: 11,
    fontWeight: "700",
    color: "#A2A8B3",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E6EA",
    marginVertical: 14,
  },
  sectionBlueTitle: {
    color: "#1D6FF2",
    fontSize: 27,
    fontWeight: "900",
    marginBottom: 10,
  },
  minglerColumns: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  minglerColumn: {
    flex: 1,
  },
  verticalDivider: {
    width: 1,
    minHeight: 80,
    backgroundColor: "#E1E3E8",
    marginHorizontal: 10,
  },
  columnTitle: {
    fontSize: 12,
    color: "#A0A7B4",
    fontWeight: "700",
    marginBottom: 8,
  },
  minglerRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  minglerItem: {
    alignItems: "center",
    width: 60,
  },
  minglerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
    backgroundColor: "#C7CDDA",
  },
  minglerAvatarImage: {
    width: "100%",
    height: "100%",
  },
  minglerName: {
    marginTop: 4,
    fontSize: 10,
    color: "#222325",
    fontWeight: "700",
  },
  emptyColumnText: {
    fontSize: 11,
    color: "#A0A7B4",
    fontWeight: "700",
  },
  visitsCard: {
    backgroundColor: "#F4F4F6",
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  emptyVisitText: {
    color: "#9AA2B0",
    fontSize: 12,
    fontWeight: "600",
  },
  visitItem: {
    paddingVertical: 12,
  },
  visitItemWithTopBorder: {
    borderTopWidth: 1,
    borderTopColor: "#E6E7EB",
  },
  visitDate: {
    color: "#6F7785",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 2,
  },
  visitName: {
    color: "#17181A",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 2,
  },
  visitSubName: {
    color: "#7E8693",
    fontSize: 10,
    fontWeight: "600",
  },
  visitThumbRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  visitThumbImage: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: "#D5DAE4",
  },
  visitThumbPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  visitPlusTile: {
    width: 70,
    height: 70,
    borderRadius: 14,
    backgroundColor: "#D5DAE4",
    alignItems: "center",
    justifyContent: "center",
  },
  visitPlusTileUploading: {
    opacity: 0.55,
  },
});
