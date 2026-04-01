import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import More from "../../icons/more.svg";
import DirectionBlack from "../../icons/direction_black.svg";
import TravelIcon from "../../icons/travelIcon.svg";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { deleteTrip, fetchTrips, fetchUser, updateTrip } from "../../services";
import { CalendarDateField } from "../../components/CalendarDateField";
import { SearchDropdown } from "../../components/SearchDropdown";
import { fetchAllCities } from "../../services/placeService";
import { pickCurrentTrip } from "../../utils/trip";

function formatTripRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return "-";
  }

  return `${startDate} ~ ${endDate}`;
}

function normalizeLiteral(value) {
  return String(value || "").trim().toLowerCase();
}

function getCityDisplayName(city) {
  return city?.cityNameKorean || city?.cityNameEnglish || city?.name || "";
}

function getCitySearchText(city) {
  return [city?.cityNameKorean, city?.cityNameEnglish, city?.name].filter(Boolean).join(" ");
}

export function MyPage({ navigation }) {
  const { token, logout } = useAuth();
  const [user, setUser] = useState(null);
  const [trips, setTrips] = useState([]);
  const [currentCity, setCurrentCity] = useState(null);
  const [cities, setCities] = useState([]);
  const [editingTrip, setEditingTrip] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editCityQuery, setEditCityQuery] = useState("");
  const [editSelectedCity, setEditSelectedCity] = useState(null);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [actionError, setActionError] = useState(null);

  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);

  const loadMyPage = useCallback(async () => {
    try {
      const [userResponse, tripsResponse, allCities] = await Promise.all([
        fetchUser(userId),
        fetchTrips(),
        fetchAllCities(),
      ]);

      const loadedUser = userResponse?.user ?? null;
      const loadedTrips = (tripsResponse?.trips ?? []).filter((trip) => Number(trip?.userId) === Number(userId));
      const currentTrip = pickCurrentTrip(loadedTrips);
      const city = allCities.find((item) => Number(item?.id) === Number(currentTrip?.cityId)) || null;

      setUser(loadedUser);
      setTrips(loadedTrips);
      setCurrentCity(city);
      setCities(allCities);
    } catch {
      setUser(null);
      setTrips([]);
      setCurrentCity(null);
      setCities([]);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      loadMyPage();
    }, [loadMyPage]),
  );

  function openEditTrip(trip) {
    const matchedCity = cities.find((city) => Number(city?.id) === Number(trip?.cityId)) || null;
    setEditingTrip(trip);
    setEditTitle(trip?.title || "");
    setEditStartDate(trip?.startDate || "");
    setEditEndDate(trip?.endDate || "");
    setEditSelectedCity(matchedCity);
    setEditCityQuery(matchedCity ? getCityDisplayName(matchedCity) : "");
    setActionError(null);
  }

  function closeEditTrip() {
    setEditingTrip(null);
    setEditTitle("");
    setEditStartDate("");
    setEditEndDate("");
    setEditSelectedCity(null);
    setEditCityQuery("");
    setSubmittingEdit(false);
    setActionError(null);
  }

  function handleEditCityQueryChange(nextQuery) {
    setEditCityQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatchedCity = cities.find((city) => {
      const ko = normalizeLiteral(city?.cityNameKorean);
      const en = normalizeLiteral(city?.cityNameEnglish);
      const fallback = normalizeLiteral(city?.name);
      return normalizedQuery === ko || normalizedQuery === en || normalizedQuery === fallback;
    }) || null;
    setEditSelectedCity(exactMatchedCity);
  }

  async function handleSubmitTripEdit() {
    if (!editingTrip?.id) {
      return;
    }

    if (!editTitle.trim() || !editStartDate || !editEndDate || !editSelectedCity?.id) {
      setActionError("제목, 도시, 시작일, 종료일을 모두 입력해주세요.");
      return;
    }

    if (editStartDate > editEndDate) {
      setActionError("종료일은 시작일보다 같거나 이후여야 합니다.");
      return;
    }

    setSubmittingEdit(true);
    setActionError(null);
    try {
      await updateTrip(editingTrip.id, {
        title: editTitle.trim(),
        startDate: editStartDate,
        endDate: editEndDate,
        cityId: editSelectedCity.id,
      });
      await loadMyPage();
      closeEditTrip();
    } catch (requestError) {
      setActionError(requestError?.message || "여행 수정에 실패했습니다.");
      setSubmittingEdit(false);
    }
  }

  function handleDeleteTrip(trip) {
    Alert.alert("여행 삭제", "이 여행 기록을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTrip(trip.id);
            await loadMyPage();
          } catch (requestError) {
            setActionError(requestError?.message || "여행 삭제에 실패했습니다.");
          }
        },
      },
    ]);
  }

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
        <Text style={styles.sectionSubtitle}>현재 여행 기준 지역 정보입니다.</Text>

        <View style={styles.locationCard}>
          <View style={styles.locationTopRow}>
            <Text style={styles.locationTitle}>{currentCity?.name || "등록된 여행 지역 없음"}</Text>
            <DirectionBlack />
          </View>
          <Text style={styles.locationSub}>{currentCity?.name || "-"}</Text>
          <View style={styles.locationDivider} />
          <Text style={styles.locationMeta}>현재 여행의 도시를 메인 홈에서 사용합니다.</Text>
        </View>

        <View style={styles.tripHeaderRow}>
          <Text style={[styles.sectionTitle, styles.travelSectionTitle]}>여행 기록</Text>
          <Pressable style={styles.addTripButton} onPress={() => navigation.navigate("CreateTrip")}>
            <Text style={styles.addTripButtonText}>새 여행 추가</Text>
          </Pressable>
        </View>
        <Text style={styles.sectionSubtitle}>총 {trips.length}개의 여행</Text>

        <View style={styles.tripList}>
          {trips.map((trip) => (
            <View key={trip.id} style={styles.tripCard}>
              <View style={styles.tripHead}>
                <TravelIcon />
                <DirectionBlack />
              </View>
              <Text style={styles.tripTitle}>{trip.title || "여행"}</Text>
              <Text style={styles.tripMeta}>{formatTripRange(trip.startDate, trip.endDate)}</Text>
              <View style={styles.tripActionsRow}>
                <Pressable style={styles.tripActionButton} onPress={() => openEditTrip(trip)}>
                  <Text style={styles.tripActionText}>수정</Text>
                </Pressable>
                <Pressable style={[styles.tripActionButton, styles.tripDeleteButton]} onPress={() => handleDeleteTrip(trip)}>
                  <Text style={[styles.tripActionText, styles.tripDeleteText]}>삭제</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {trips.length === 0 ? <Text style={styles.emptyText}>아직 생성된 여행이 없습니다.</Text> : null}
        </View>

        <View style={styles.moreRow}>
          <Text style={styles.moreText}>더보기</Text>
        </View>
      </View>

      <Modal visible={Boolean(editingTrip)} transparent animationType="fade" onRequestClose={closeEditTrip}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>여행 수정</Text>

            <Text style={styles.modalLabel}>여행 제목</Text>
            <TextInput style={styles.modalInput} value={editTitle} onChangeText={setEditTitle} placeholder="여행 제목" />

            <Text style={styles.modalLabel}>도시 검색</Text>
            <SearchDropdown
              value={editCityQuery}
              onChangeText={handleEditCityQueryChange}
              placeholder="도시명을 입력하세요"
              items={cities}
              selectedItem={editSelectedCity}
              getItemKey={(city) => city.id}
              getItemLabel={getCityDisplayName}
              getItemSearchText={getCitySearchText}
              onSelectItem={(city) => {
                setEditSelectedCity(city);
                setEditCityQuery(getCityDisplayName(city));
                setActionError(null);
              }}
              emptyText="일치하는 도시가 없습니다."
            />

            <CalendarDateField
              label="시작일"
              value={editStartDate}
              onChange={(dateValue) => {
                setEditStartDate(dateValue);
                if (editEndDate && editEndDate < dateValue) {
                  setEditEndDate("");
                }
              }}
              maxDate={editEndDate || undefined}
              placeholder="시작일 선택"
            />

            <CalendarDateField
              label="종료일"
              value={editEndDate}
              onChange={setEditEndDate}
              minDate={editStartDate || undefined}
              placeholder="종료일 선택"
            />

            {actionError ? <Text style={styles.actionErrorText}>{actionError}</Text> : null}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelButton} onPress={closeEditTrip}>
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable style={[styles.modalSaveButton, submittingEdit && styles.modalSaveButtonDisabled]} onPress={handleSubmitTripEdit} disabled={submittingEdit}>
                <Text style={styles.modalSaveText}>{submittingEdit ? "저장 중..." : "저장"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 22 / 2,
    marginBottom: 4,
    fontWeight: "600",
  },
  userName: {
    color: "#fff",
    fontSize: 44 / 2,
    fontWeight: "700",
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tagPill: {
    backgroundColor: "#fff",
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
    fontSize: 36 / 2,
    fontWeight: "700",
    color: "#111",
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 28 / 2,
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
    fontSize: 36 / 2,
    fontWeight: "700",
    color: "#111",
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
    fontSize: 30 / 2,
  },
  tripHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addTripButton: {
    backgroundColor: "#1C73F0",
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 28,
    justifyContent: "center",
  },
  addTripButtonText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  travelSectionTitle: {
    marginTop: 2,
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
    fontSize: 36 / 2,
    fontWeight: "700",
    color: "#111",
    marginBottom: 2,
  },
  tripMeta: {
    fontSize: 14,
    color: "#8A8A8A",
    fontWeight: "600",
  },
  tripActionsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  tripActionButton: {
    height: 30,
    borderRadius: 15,
    backgroundColor: "#EAF2FF",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tripActionText: {
    color: "#1C73F0",
    fontSize: 12,
    fontWeight: "700",
  },
  tripDeleteButton: {
    backgroundColor: "#FDEDED",
  },
  tripDeleteText: {
    color: "#D32F2F",
  },
  emptyText: {
    color: "#888",
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#FFF",
    padding: 14,
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 2,
  },
  modalLabel: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D5D5D5",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
  },
  actionErrorText: {
    color: "#C62828",
    fontSize: 13,
  },
  modalActions: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalCancelButton: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 14,
    backgroundColor: "#F1F2F5",
    justifyContent: "center",
  },
  modalCancelText: {
    color: "#616161",
    fontWeight: "700",
  },
  modalSaveButton: {
    height: 38,
    borderRadius: 19,
    paddingHorizontal: 14,
    backgroundColor: "#1C73F0",
    justifyContent: "center",
  },
  modalSaveButtonDisabled: {
    opacity: 0.6,
  },
  modalSaveText: {
    color: "#FFF",
    fontWeight: "700",
  },
});
