import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { createMingle, fetchMingleMinglers, fetchMingles, joinMingle, leaveMingle } from "../../services/mingleService";
import { fetchGooglePlaceDetails, searchGooglePlaces } from "../../services/googlePlacesService";
import { fetchUsers } from "../../services/userService";

const TAB_LIGHTNING = "LIGHTNING";
const TAB_GROUP = "GROUP";
const GROUP_SIZE_FILTER_ALL = "ALL";
const GROUP_SIZE_FILTER_1 = "1";
const GROUP_SIZE_FILTER_2 = "2";
const GROUP_SIZE_FILTER_3PLUS = "3+";

function toSexLabel(sex) {
  if (sex === "MALE") {
    return "남성";
  }

  if (sex === "FEMALE") {
    return "여성";
  }

  return "-";
}

function toRelativeTimeLabel(isoString) {
  if (!isoString) {
    return "";
  }

  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "방금 전";
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return "방금 전";
  }

  if (minutes < 60) {
    return `${minutes}분 전`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }

  const days = Math.floor(hours / 24);
  return `${days}일 전`;
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

function toMinglePhaseLabel(createdDateTime) {
  if (!createdDateTime) {
    return "기록";
  }

  const diffMs = new Date(createdDateTime).getTime() - Date.now();
  return diffMs > 0 ? "예정" : "기록";
}

export function Nearby({ route }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState(TAB_LIGHTNING);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mingleRows, setMingleRows] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [joinedMingleIdSet, setJoinedMingleIdSet] = useState(new Set());
  const [groupSizeFilter, setGroupSizeFilter] = useState(GROUP_SIZE_FILTER_ALL);
  const [selectedMingleId, setSelectedMingleId] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    placeName: "",
    latitude: null,
    longitude: null,
    meetDateTime: "",
  });
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState(null);
  const [placeDetailLoading, setPlaceDetailLoading] = useState(false);
  const placeSearchSequenceRef = useRef(0);
  const placeSessionTokenRef = useRef(`mingle-${Date.now()}`);

  const cityId = Number(route?.params?.cityId);
  const cityName = String(route?.params?.cityName || "").trim();
  const cityLatitude = toCoordinateValue(route?.params?.cityLatitude);
  const cityLongitude = toCoordinateValue(route?.params?.cityLongitude);
  const cityCenter = useMemo(() => {
    if (!isValidCoordinatePair(cityLatitude, cityLongitude)) {
      return null;
    }

    return {
      latitude: cityLatitude,
      longitude: cityLongitude,
    };
  }, [cityLatitude, cityLongitude]);
  const currentUserId = useMemo(() => decodeUserIdFromToken(token), [token]);

  const nearbyProfiles = useMemo(() => {
    const seen = new Set();
    const result = [];

    mingleRows.forEach((row) => {
      (row.minglers ?? []).forEach((mingler) => {
        if (!mingler?.userId || seen.has(mingler.userId)) {
          return;
        }

        seen.add(mingler.userId);
        result.push({
          userId: mingler.userId,
          mingleId: row.mingle?.id,
        });
      });
    });

    return result;
  }, [mingleRows]);

  const filteredGroupRows = useMemo(() => {
    if (groupSizeFilter === GROUP_SIZE_FILTER_ALL) {
      return mingleRows;
    }

    return mingleRows.filter((row) => {
      const count = row?.minglers?.length ?? 0;
      if (groupSizeFilter === GROUP_SIZE_FILTER_1) {
        return count === 1;
      }
      if (groupSizeFilter === GROUP_SIZE_FILTER_2) {
        return count === 2;
      }
      return count >= 3;
    });
  }, [groupSizeFilter, mingleRows]);

  const mingleMarkers = useMemo(() => {
    return mingleRows
      .map((row) => {
        const latitude = toCoordinateValue(row?.mingle?.latitude);
        const longitude = toCoordinateValue(row?.mingle?.longitude);
        if (!isValidCoordinatePair(latitude, longitude)) {
          return null;
        }

        return {
          id: row?.mingle?.id,
          title: row?.mingle?.title || "제목 없음",
          description: row?.mingle?.description || "",
          phase: toMinglePhaseLabel(row?.mingle?.createdDateTime),
          createdDateTime: row?.mingle?.createdDateTime,
          coordinate: { latitude, longitude },
        };
      })
      .filter(Boolean);
  }, [mingleRows]);

  const mapRegion = useMemo(() => {
    const selectedMarker = mingleMarkers.find((marker) => Number(marker.id) === Number(selectedMingleId));
    if (selectedMarker) {
      return {
        latitude: selectedMarker.coordinate.latitude,
        longitude: selectedMarker.coordinate.longitude,
        latitudeDelta: 0.045,
        longitudeDelta: 0.045,
      };
    }

    if (cityCenter) {
      return {
        latitude: cityCenter.latitude,
        longitude: cityCenter.longitude,
        latitudeDelta: 0.18,
        longitudeDelta: 0.18,
      };
    }

    if (mingleMarkers.length === 0) {
      return {
        latitude: 37.5665,
        longitude: 126.978,
        latitudeDelta: 0.25,
        longitudeDelta: 0.25,
      };
    }

    return {
      latitude: mingleMarkers[0].coordinate.latitude,
      longitude: mingleMarkers[0].coordinate.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [cityCenter, mingleMarkers, selectedMingleId]);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [mingleResponse, userResponse] = await Promise.all([
        fetchMingles(Number.isFinite(cityId) && cityId > 0 ? { cityId } : undefined),
        fetchUsers(),
      ]);

      const mingles = mingleResponse?.mingles ?? [];
      const users = userResponse?.users ?? [];

      const userMap = users.reduce((acc, user) => {
        if (user?.id) {
          acc[user.id] = user;
        }

        return acc;
      }, {});

      const minglersByMingle = await Promise.all(
        mingles.map(async (mingle) => {
          try {
            const response = await fetchMingleMinglers(mingle.id);
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

      const nextJoinedSet = new Set(
        rows
          .filter((row) => (row.minglers ?? []).some((mingler) => Number(mingler?.userId) === Number(currentUserId)))
          .map((row) => row?.mingle?.id)
          .filter(Boolean),
      );

      setUsersById(userMap);
      setMingleRows(rows);
      setJoinedMingleIdSet(nextJoinedSet);
      if (!selectedMingleId && rows.length > 0) {
        setSelectedMingleId(rows[0]?.mingle?.id ?? null);
      }
    } catch {
      setUsersById({});
      setMingleRows([]);
      setJoinedMingleIdSet(new Set());
      setError("근처 밍글러 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [cityId, currentUserId, selectedMingleId]);

  useFocusEffect(
    useCallback(() => {
      loadNearby();
    }, [loadNearby]),
  );

  async function handleToggleJoin(mingleId) {
    if (!mingleId) {
      return;
    }

    try {
      if (joinedMingleIdSet.has(mingleId)) {
        await leaveMingle(mingleId);
      } else {
        await joinMingle(mingleId);
      }

      await loadNearby();
    } catch {
      setError("밍글 참여 상태를 변경하지 못했습니다.");
    }
  }

  function resetCreateForm() {
    setCreateForm({
      title: "",
      description: "",
      placeName: "",
      latitude: null,
      longitude: null,
      meetDateTime: "",
    });
    setPlaceQuery("");
    setPlaceSuggestions([]);
    setPlaceSearchError(null);
    setPlaceSearchLoading(false);
    setPlaceDetailLoading(false);
    placeSessionTokenRef.current = `mingle-${Date.now()}`;
  }

  useEffect(() => {
    if (!createModalVisible) {
      return undefined;
    }

    const query = placeQuery.trim();
    if (query.length < 2) {
      setPlaceSuggestions([]);
      setPlaceSearchLoading(false);
      setPlaceSearchError(null);
      return undefined;
    }

    const currentSequence = ++placeSearchSequenceRef.current;
    const timer = setTimeout(async () => {
      setPlaceSearchLoading(true);
      setPlaceSearchError(null);
      try {
        const suggestions = await searchGooglePlaces({
          input: query,
          cityName,
          sessionToken: placeSessionTokenRef.current,
        });
        if (currentSequence !== placeSearchSequenceRef.current) {
          return;
        }
        setPlaceSuggestions(suggestions.slice(0, 6));
      } catch (e) {
        if (currentSequence !== placeSearchSequenceRef.current) {
          return;
        }
        setPlaceSuggestions([]);
        setPlaceSearchError(
          e?.message === "Google Places API key is not configured."
            ? "Google Places API key가 설정되지 않았습니다."
            : "장소 검색에 실패했습니다.",
        );
      } finally {
        if (currentSequence === placeSearchSequenceRef.current) {
          setPlaceSearchLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [cityName, createModalVisible, placeQuery]);

  async function handleSelectPlaceSuggestion(item) {
    if (!item?.placeId) {
      return;
    }

    setPlaceDetailLoading(true);
    setPlaceSearchError(null);
    try {
      const details = await fetchGooglePlaceDetails({
        placeId: item.placeId,
        sessionToken: placeSessionTokenRef.current,
      });
      const displayName = details?.name || item.primaryText || item.description || "";
      setCreateForm((prev) => ({
        ...prev,
        placeName: displayName,
        latitude: details.latitude,
        longitude: details.longitude,
      }));
      setPlaceQuery(displayName);
      setPlaceSuggestions([]);
      setPlaceSearchError(null);
      placeSessionTokenRef.current = `mingle-${Date.now()}`;
    } catch {
      setPlaceSearchError("선택한 장소 정보를 불러오지 못했습니다.");
    } finally {
      setPlaceDetailLoading(false);
    }
  }

  async function handleCreateMingle() {
    const title = String(createForm.title || "").trim();
    if (!cityId || !title) {
      setError("밍글 제목을 입력해주세요.");
      return;
    }

    const placeName = String(createForm.placeName || "").trim();
    const hasTypedPlaceButNotSelected =
      String(placeQuery || "").trim().length > 0 &&
      (!Number.isFinite(createForm.latitude) || !Number.isFinite(createForm.longitude));
    if (hasTypedPlaceButNotSelected) {
      setError("장소는 검색 결과에서 선택해주세요.");
      return;
    }

    setCreateSubmitting(true);
    setError(null);
    try {
      const response = await createMingle({
        cityId,
        title,
        description: String(createForm.description || "").trim() || null,
        placeName: placeName || null,
        meetDateTime: String(createForm.meetDateTime || "").trim() || null,
        latitude: placeName ? createForm.latitude : null,
        longitude: placeName ? createForm.longitude : null,
      });
      setCreateModalVisible(false);
      resetCreateForm();
      await loadNearby();
      const createdMingleId = response?.mingle?.id;
      if (createdMingleId) {
        setSelectedMingleId(createdMingleId);
      }
    } catch {
      setError("밍글 생성에 실패했습니다.");
    } finally {
      setCreateSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, activeTab === TAB_LIGHTNING && styles.tabButtonActive]}
          onPress={() => setActiveTab(TAB_LIGHTNING)}
        >
          <Text style={[styles.tabText, activeTab === TAB_LIGHTNING && styles.tabTextActive]}>번개</Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, activeTab === TAB_GROUP && styles.tabButtonActive]}
          onPress={() => {
            setActiveTab(TAB_GROUP);
            setGroupSizeFilter(GROUP_SIZE_FILTER_ALL);
          }}
        >
          <Text style={[styles.tabText, activeTab === TAB_GROUP && styles.tabTextActive]}>소모임</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === TAB_GROUP ? (
          <View style={styles.groupFilterHeader}>
            <View style={styles.groupFilterRow}>
              {[
                GROUP_SIZE_FILTER_ALL,
                GROUP_SIZE_FILTER_1,
                GROUP_SIZE_FILTER_2,
                GROUP_SIZE_FILTER_3PLUS,
              ].map((filter) => {
                const active = groupSizeFilter === filter;
                return (
                  <Pressable
                    key={filter}
                    style={[styles.groupFilterChip, active && styles.groupFilterChipActive]}
                    onPress={() => setGroupSizeFilter(filter)}
                  >
                    <Text style={[styles.groupFilterText, active && styles.groupFilterTextActive]}>
                      {filter === GROUP_SIZE_FILTER_ALL ? "전체" : `${filter}인`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.createMingleButton} onPress={() => setCreateModalVisible(true)}>
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.createMingleButtonText}>밍글 만들기</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? <Text style={styles.infoText}>불러오는 중...</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {!loading && !error && activeTab === TAB_LIGHTNING
          ? nearbyProfiles.map((profile) => {
              const user = usersById[profile.userId];
              if (!user) {
                return null;
              }

              const joined = joinedMingleIdSet.has(profile.mingleId);

              return (
                <View key={`${profile.userId}-${profile.mingleId}`} style={styles.card}>
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{user?.name || `USER#${user?.id}`}</Text>
                    <Text style={styles.meta}>{toSexLabel(user?.sex)}</Text>
                    <Text style={styles.description} numberOfLines={2}>
                      {user?.introduction || "소개가 아직 없어요."}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.actionButton, joined && styles.actionButtonActive]}
                    onPress={() => handleToggleJoin(profile.mingleId)}
                  >
                    <Text style={[styles.actionButtonText, joined && styles.actionButtonTextActive]}>
                      {joined ? "취소" : "밍글"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          : null}

        {!loading && !error && activeTab === TAB_GROUP
          ? (
            <>
              <View style={styles.mapCard}>
                <Text style={styles.mapTitle}>밍글 지도</Text>
                <Text style={styles.mapSubtitle}>카드를 선택하면 지도에서 해당 밍글 위치를 강조합니다.</Text>
                <MapView style={styles.map} region={mapRegion}>
                  {mingleMarkers.map((marker) => (
                    <Marker
                      key={marker.id}
                      coordinate={marker.coordinate}
                      onPress={() => setSelectedMingleId(marker.id)}
                    >
                      <View style={[
                        styles.markerDot,
                        Number(selectedMingleId) === Number(marker.id) ? styles.markerDotActive : styles.markerDotInactive,
                      ]} />
                    </Marker>
                  ))}
                </MapView>
                {mingleMarkers.length === 0 ? <Text style={styles.mapEmpty}>표시 가능한 밍글 좌표가 없습니다.</Text> : null}
              </View>

              {filteredGroupRows.map((row) => {
              const joined = joinedMingleIdSet.has(row?.mingle?.id);
              const minglerCount = row?.minglers?.length ?? 0;
              const selected = Number(selectedMingleId) === Number(row?.mingle?.id);
              const meetAtText = row?.mingle?.meetDateTime ? toRelativeTimeLabel(row?.mingle?.meetDateTime) : "시간 미정";
              const placeNameText = row?.mingle?.placeName || "장소 미정";

              return (
                <Pressable
                  key={row?.mingle?.id}
                  style={[styles.card, selected && styles.cardSelected]}
                  onPress={() => setSelectedMingleId(row?.mingle?.id)}
                >
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{row?.mingle?.title || "제목 없음"}</Text>
                    <Text style={styles.meta}>{toRelativeTimeLabel(row?.mingle?.createdDateTime)}</Text>
                    <Text style={styles.description} numberOfLines={2}>
                      {row?.mingle?.description || "같이할 밍글러를 기다리고 있어요."}
                    </Text>
                    <Text style={styles.placeText}>📍 {placeNameText}</Text>
                    <Text style={styles.meetText}>🕒 {meetAtText}</Text>
                    <Text style={styles.countText}>참여 중 {minglerCount}명</Text>
                  </View>
                  <Pressable
                    style={[styles.actionButton, joined && styles.actionButtonActive]}
                    onPress={() => handleToggleJoin(row?.mingle?.id)}
                  >
                    <Text style={[styles.actionButtonText, joined && styles.actionButtonTextActive]}>
                      {joined ? "취소" : "밍글"}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            })}
            </>
          ) : null}

        {!loading && !error && ((activeTab === TAB_LIGHTNING && nearbyProfiles.length === 0) || (activeTab === TAB_GROUP && filteredGroupRows.length === 0)) ? (
          <Text style={styles.infoText}>표시할 항목이 없습니다.</Text>
        ) : null}
      </ScrollView>

      <Modal visible={drawerVisible} transparent animationType="slide" onRequestClose={() => setDrawerVisible(false)}>
        <View style={styles.drawerOverlay}>
          <View style={styles.drawerCard}>
            <Text style={styles.drawerTitle}>원하는 밍글러를 만나보세요</Text>
            <Text style={styles.drawerDescription}>로컬 밍글러 소모임 지도를 바로 확인할 수 있어요.</Text>
            <Pressable
              style={styles.drawerPrimaryButton}
              onPress={() => {
                setActiveTab(TAB_GROUP);
                setDrawerVisible(false);
              }}
            >
              <Text style={styles.drawerPrimaryButtonText}>소모임 지도 보기</Text>
            </Pressable>
            <Pressable style={styles.drawerSecondaryButton} onPress={() => setDrawerVisible(false)}>
              <Text style={styles.drawerSecondaryButtonText}>닫기</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={createModalVisible} transparent animationType="slide" onRequestClose={() => setCreateModalVisible(false)}>
        <View style={styles.drawerOverlay}>
          <View style={styles.drawerCard}>
            <Text style={styles.drawerTitle}>새 밍글 만들기</Text>
            <TextInput
              style={styles.formInput}
              value={createForm.title}
              onChangeText={(value) => setCreateForm((prev) => ({ ...prev, title: value }))}
              placeholder="제목 (필수)"
            />
            <TextInput
              style={styles.formInput}
              value={placeQuery}
              onChangeText={(value) => {
                setPlaceQuery(value);
                setCreateForm((prev) => ({
                  ...prev,
                  placeName: "",
                  latitude: null,
                  longitude: null,
                }));
              }}
              placeholder="어디서 만날까요? (선택)"
            />
            {placeSearchLoading || placeDetailLoading ? (
              <Text style={styles.placeHelperText}>장소를 찾는 중...</Text>
            ) : null}
            {placeSearchError ? <Text style={styles.placeErrorText}>{placeSearchError}</Text> : null}
            {placeSuggestions.length > 0 ? (
              <View style={styles.placeSuggestionList}>
                {placeSuggestions.map((item) => (
                  <Pressable
                    key={item.placeId}
                    style={styles.placeSuggestionItem}
                    onPress={() => handleSelectPlaceSuggestion(item)}
                  >
                    <Text style={styles.placeSuggestionPrimary} numberOfLines={1}>
                      {item.primaryText || item.description}
                    </Text>
                    {item.secondaryText ? (
                      <Text style={styles.placeSuggestionSecondary} numberOfLines={1}>
                        {item.secondaryText}
                      </Text>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
            {Number.isFinite(createForm.latitude) && Number.isFinite(createForm.longitude) ? (
              <Text style={styles.placeHelperText}>
                선택된 위치: {createForm.latitude.toFixed(5)}, {createForm.longitude.toFixed(5)}
              </Text>
            ) : null}
            <TextInput
              style={styles.formInput}
              value={createForm.meetDateTime}
              onChangeText={(value) => setCreateForm((prev) => ({ ...prev, meetDateTime: value }))}
              placeholder="언제 만날까요? 예: 2026-04-05T19:30:00 (선택)"
            />
            <TextInput
              style={[styles.formInput, styles.formInputMultiline]}
              value={createForm.description}
              onChangeText={(value) => setCreateForm((prev) => ({ ...prev, description: value }))}
              placeholder="설명 (선택)"
              multiline
            />
            <Pressable
              style={[styles.drawerPrimaryButton, createSubmitting && styles.confirmDisabled]}
              onPress={handleCreateMingle}
              disabled={createSubmitting}
            >
              <Text style={styles.drawerPrimaryButtonText}>{createSubmitting ? "생성 중..." : "밍글 생성"}</Text>
            </Pressable>
            <Pressable style={styles.drawerSecondaryButton} onPress={() => setCreateModalVisible(false)} disabled={createSubmitting}>
              <Text style={styles.drawerSecondaryButtonText}>취소</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F2F5",
    paddingTop: 18,
  },
  tabRow: {
    marginHorizontal: 20,
    flexDirection: "row",
    backgroundColor: "#E9ECF2",
    borderRadius: 12,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: "#FFFFFF",
  },
  tabText: {
    color: "#77819A",
    fontWeight: "700",
    fontSize: 14,
  },
  tabTextActive: {
    color: "#1C73F0",
  },
  groupFilterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  groupFilterRow: {
    flexDirection: "row",
    gap: 8,
    flex: 1,
    flexWrap: "wrap",
  },
  groupFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D6DDEB",
    backgroundColor: "#F7F9FD",
    paddingHorizontal: 12,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  groupFilterChipActive: {
    borderColor: "#1C73F0",
    backgroundColor: "#EAF2FF",
  },
  groupFilterText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4D5A76",
  },
  groupFilterTextActive: {
    color: "#1C73F0",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 28,
    gap: 10,
  },
  card: {
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E8EF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardSelected: {
    borderColor: "#8DB9FF",
    backgroundColor: "#EAF3FF",
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: "#101827",
    fontSize: 15,
    fontWeight: "700",
  },
  meta: {
    color: "#5F6980",
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    color: "#25314D",
    fontSize: 13,
    lineHeight: 18,
  },
  countText: {
    color: "#6A7388",
    fontSize: 12,
    marginTop: 2,
  },
  placeText: {
    color: "#41506E",
    fontSize: 12,
  },
  meetText: {
    color: "#41506E",
    fontSize: 12,
  },
  actionButton: {
    minWidth: 64,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonActive: {
    backgroundColor: "#EAF2FF",
  },
  actionButtonText: {
    color: "#1C73F0",
    fontWeight: "700",
    fontSize: 12,
  },
  actionButtonTextActive: {
    color: "#0E55BD",
  },
  infoText: {
    color: "#6F778B",
    fontSize: 13,
    textAlign: "center",
    marginTop: 16,
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    textAlign: "center",
    marginTop: 6,
  },
  mapCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E8EF",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 6,
  },
  mapTitle: {
    color: "#101827",
    fontSize: 14,
    fontWeight: "700",
  },
  mapSubtitle: {
    color: "#6A7388",
    fontSize: 12,
  },
  map: {
    marginTop: 4,
    height: 220,
    width: "100%",
    borderRadius: 12,
  },
  mapEmpty: {
    color: "#6F778B",
    fontSize: 12,
  },
  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  markerDotActive: {
    backgroundColor: "#1C73F0",
    borderColor: "#DDEBFF",
  },
  markerDotInactive: {
    backgroundColor: "#A7B1C4",
    borderColor: "#EEF2F8",
  },
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.32)",
  },
  drawerCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 10,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  drawerDescription: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 19,
  },
  drawerPrimaryButton: {
    height: 44,
    borderRadius: 999,
    backgroundColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  drawerPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  drawerSecondaryButton: {
    height: 40,
    borderRadius: 999,
    backgroundColor: "#F3F6FB",
    alignItems: "center",
    justifyContent: "center",
  },
  drawerSecondaryButtonText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
  },
  createMingleButton: {
    height: 32,
    borderRadius: 999,
    backgroundColor: "#1C73F0",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  createMingleButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  formInput: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D5DEEB",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    fontSize: 13,
    color: "#111827",
  },
  placeSuggestionList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D5DEEB",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  placeSuggestionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    gap: 2,
  },
  placeSuggestionPrimary: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  placeSuggestionSecondary: {
    color: "#64748B",
    fontSize: 12,
  },
  placeHelperText: {
    color: "#5B667E",
    fontSize: 12,
  },
  placeErrorText: {
    color: "#C62828",
    fontSize: 12,
  },
  formInputMultiline: {
    minHeight: 90,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  confirmDisabled: {
    opacity: 0.6,
  },
});
