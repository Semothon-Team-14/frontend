import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MapView, { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { Calendar } from "react-native-calendars";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { useLocale } from "../../locale";
import { createMingle, fetchMingleMinglers, fetchMingles, joinMingle, leaveMingle } from "../../services/mingleService";
import { fetchGooglePlaceDetails, searchGooglePlaces } from "../../services/googlePlacesService";
 
const GROUP_SIZE_FILTER_ALL = "ALL";
const GROUP_SIZE_FILTER_2 = "2";
const GROUP_SIZE_FILTER_3 = "3";
const GROUP_SIZE_FILTER_5PLUS = "5+";
const TARGET_PARTICIPANT_OPTIONS = [2, 3, 4, 5];
const DRAWER_COVERAGE_COLLAPSED = 0.42;
const DRAWER_COVERAGE_EXPANDED = 0.72;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildDefaultMeetDateTime() {
  const now = new Date();
  const date = new Date(now);
  date.setMinutes(0, 0, 0);
  date.setHours(now.getHours() + 1);
  return date;
}

function toLocalDateTimeString(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }

  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}T${pad2(value.getHours())}:${pad2(value.getMinutes())}:00`;
}

function toCalendarDateKey(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return "";
  }
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function toMeetDateTimeLabel(value, locale) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return locale === "ko" ? "언제 만날까요?" : "When to meet?";
  }

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

function toTargetCountLabel(count) {
  return count >= 5 ? "5+" : String(count);
}

function toRelativeTimeLabel(isoString, locale) {
  if (!isoString) {
    return "";
  }

  const diffMs = Date.now() - new Date(isoString).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return locale === "ko" ? "방금 전" : "Just now";
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return locale === "ko" ? "방금 전" : "Just now";
  }

  if (minutes < 60) {
    return locale === "ko" ? `${minutes}분 전` : `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return locale === "ko" ? `${hours}시간 전` : `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return locale === "ko" ? `${days}일 전` : `${days}d ago`;
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

export function Nearby({ route }) {
  const navigation = useNavigation();
  const { token } = useAuth();
  const { tx, locale } = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mingleRows, setMingleRows] = useState([]);
  const [joinedMingleIdSet, setJoinedMingleIdSet] = useState(new Set());
  const [groupSizeFilter, setGroupSizeFilter] = useState(GROUP_SIZE_FILTER_3);
  const [selectedMingleId, setSelectedMingleId] = useState(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(
    route?.params?.hideIdealMinglerPopup ? false : true,
  );
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [dateTimeModalVisible, setDateTimeModalVisible] = useState(false);
  const [dateTimeDraft, setDateTimeDraft] = useState(() => buildDefaultMeetDateTime());
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    placeName: "",
    latitude: null,
    longitude: null,
    meetDateTime: buildDefaultMeetDateTime(),
    targetParticipantCount: 2,
  });
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState(null);
  const [placeDetailLoading, setPlaceDetailLoading] = useState(false);
  const placeSearchSequenceRef = useRef(0);
  const placeSessionTokenRef = useRef(`mingle-${Date.now()}`);
  const skipNextPlaceSearchRef = useRef(false);

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

  const filteredGroupRows = useMemo(() => {
    if (groupSizeFilter === GROUP_SIZE_FILTER_ALL) {
      return mingleRows;
    }

    return mingleRows.filter((row) => {
      const targetCount = Number(row?.mingle?.targetParticipantCount);
      const count = Number.isFinite(targetCount) && targetCount > 0
        ? targetCount
        : (row?.minglers?.length ?? 0);
      if (groupSizeFilter === GROUP_SIZE_FILTER_2) {
        return count === 2;
      }
      if (groupSizeFilter === GROUP_SIZE_FILTER_3) {
        return count === 3;
      }
      return count >= 4;
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
          coordinate: { latitude, longitude },
        };
      })
      .filter(Boolean);
  }, [mingleRows]);

  const mapRegion = useMemo(() => {
    const drawerCoverage = sheetExpanded ? DRAWER_COVERAGE_EXPANDED : DRAWER_COVERAGE_COLLAPSED;
    const withDrawerCompensation = (latitude, latitudeDelta) => ({
      latitude: latitude - latitudeDelta * (drawerCoverage / 2),
      latitudeDelta,
    });

    const selectedMarker = mingleMarkers.find((marker) => Number(marker.id) === Number(selectedMingleId));
    if (selectedMarker) {
      const latitudeDelta = 0.045;
      const compensated = withDrawerCompensation(selectedMarker.coordinate.latitude, latitudeDelta);
      return {
        latitude: compensated.latitude,
        longitude: selectedMarker.coordinate.longitude,
        latitudeDelta: compensated.latitudeDelta,
        longitudeDelta: 0.045,
      };
    }

    if (cityCenter) {
      const latitudeDelta = 0.18;
      const compensated = withDrawerCompensation(cityCenter.latitude, latitudeDelta);
      return {
        latitude: compensated.latitude,
        longitude: cityCenter.longitude,
        latitudeDelta: compensated.latitudeDelta,
        longitudeDelta: 0.18,
      };
    }

    if (mingleMarkers.length === 0) {
      const latitudeDelta = 0.25;
      const compensated = withDrawerCompensation(37.5665, latitudeDelta);
      return {
        latitude: compensated.latitude,
        longitude: 126.978,
        latitudeDelta: compensated.latitudeDelta,
        longitudeDelta: 0.25,
      };
    }

    const latitudeDelta = 0.08;
    const compensated = withDrawerCompensation(mingleMarkers[0].coordinate.latitude, latitudeDelta);
    return {
      latitude: compensated.latitude,
      longitude: mingleMarkers[0].coordinate.longitude,
      latitudeDelta: compensated.latitudeDelta,
      longitudeDelta: 0.08,
    };
  }, [cityCenter, mingleMarkers, selectedMingleId, sheetExpanded]);

  const loadNearby = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const mingleResponse = await fetchMingles(Number.isFinite(cityId) && cityId > 0 ? { cityId } : undefined);

      const mingles = mingleResponse?.mingles ?? [];

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

      setMingleRows(rows);
      setJoinedMingleIdSet(nextJoinedSet);
      if (!selectedMingleId && rows.length > 0) {
        setSelectedMingleId(rows[0]?.mingle?.id ?? null);
      }
    } catch {
      setMingleRows([]);
      setJoinedMingleIdSet(new Set());
      setError(tx("근처 밍글러 정보를 불러오지 못했습니다.", "Failed to load nearby minglers."));
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
      setError(tx("밍글 참여 상태를 변경하지 못했습니다.", "Failed to update mingle participation."));
    }
  }

  function resetCreateForm() {
    setCreateForm({
      title: "",
      description: "",
      placeName: "",
      latitude: null,
      longitude: null,
      meetDateTime: buildDefaultMeetDateTime(),
      targetParticipantCount: 2,
    });
    setDateTimeDraft(buildDefaultMeetDateTime());
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

    if (skipNextPlaceSearchRef.current) {
      skipNextPlaceSearchRef.current = false;
      setPlaceSearchLoading(false);
      setPlaceSearchError(null);
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
            ? tx("Google Places API key가 설정되지 않았습니다.", "Google Places API key is not configured.")
            : tx("장소 검색에 실패했습니다.", "Failed to search places."),
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
      skipNextPlaceSearchRef.current = true;
      setPlaceQuery(displayName);
      setPlaceSuggestions([]);
      setPlaceSearchError(null);
      placeSessionTokenRef.current = `mingle-${Date.now()}`;
    } catch {
      setPlaceSearchError(tx("선택한 장소 정보를 불러오지 못했습니다.", "Failed to load selected place."));
    } finally {
      setPlaceDetailLoading(false);
    }
  }

  function openDateTimeModal() {
    const baseDate =
      createForm.meetDateTime instanceof Date && !Number.isNaN(createForm.meetDateTime.getTime())
        ? createForm.meetDateTime
        : buildDefaultMeetDateTime();
    setDateTimeDraft(new Date(baseDate));
    setDateTimeModalVisible(true);
  }

  function handleDateSelected(day) {
    const [year, month, date] = String(day?.dateString || "")
      .split("-")
      .map((value) => Number(value));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(date)) {
      return;
    }

    setDateTimeDraft((prev) => {
      const next = new Date(prev);
      next.setFullYear(year, month - 1, date);
      return next;
    });
  }

  function adjustDraftHour(delta) {
    setDateTimeDraft((prev) => {
      const next = new Date(prev);
      const hour = (next.getHours() + delta + 24) % 24;
      next.setHours(hour);
      return next;
    });
  }

  function adjustDraftMinute(delta) {
    setDateTimeDraft((prev) => {
      const next = new Date(prev);
      const minute = next.getMinutes() + delta;
      if (minute < 0) {
        next.setHours((next.getHours() + 23) % 24);
        next.setMinutes(30);
        return next;
      }
      if (minute >= 60) {
        next.setHours((next.getHours() + 1) % 24);
        next.setMinutes(0);
        return next;
      }
      next.setMinutes(minute);
      return next;
    });
  }

  function confirmDateTimeSelection() {
    setCreateForm((prev) => ({
      ...prev,
      meetDateTime: new Date(dateTimeDraft),
    }));
    setDateTimeModalVisible(false);
  }

  async function handleCreateMingle() {
    const title = String(createForm.title || "").trim();
    if (!cityId || !title) {
      setError(tx("밍글 제목을 입력해주세요.", "Please enter a mingle title."));
      return;
    }

    const placeName = String(createForm.placeName || "").trim();
    const hasTypedPlaceButNotSelected =
      String(placeQuery || "").trim().length > 0 &&
      (!Number.isFinite(createForm.latitude) || !Number.isFinite(createForm.longitude));
    if (hasTypedPlaceButNotSelected) {
      setError(tx("장소는 검색 결과에서 선택해주세요.", "Please select a place from suggestions."));
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
        meetDateTime: toLocalDateTimeString(createForm.meetDateTime),
        latitude: placeName ? createForm.latitude : null,
        longitude: placeName ? createForm.longitude : null,
        targetParticipantCount: Number(createForm.targetParticipantCount) || null,
      });
      setCreateModalVisible(false);
      resetCreateForm();
      await loadNearby();
      const createdMingleId = response?.mingle?.id;
      if (createdMingleId) {
        setSelectedMingleId(createdMingleId);
      }
    } catch {
      setError(tx("밍글 생성에 실패했습니다.", "Failed to create mingle."));
    } finally {
      setCreateSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <MapView style={styles.fullScreenMap} region={mapRegion}>
        {mingleMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={marker.coordinate}
            onPress={() => setSelectedMingleId(marker.id)}
          >
            <Image
              source={
                Number(selectedMingleId) === Number(marker.id)
                  ? require("../../images/mingle_marker_selected.png")
                  : require("../../images/mingle_marker_unselected.png")
              }
              style={styles.markerImage}
            />
          </Marker>
        ))}
      </MapView>

      <View pointerEvents="box-none" style={styles.overlayLayer}>
        <View style={styles.mapTopBar}>
          <Pressable style={styles.mapBackButton} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={22} color="#1F2937" />
          </Pressable>
        </View>
        <View style={[styles.listSheet, sheetExpanded ? styles.listSheetExpanded : styles.listSheetCollapsed]}>
          <Pressable style={styles.sheetHandleButton} onPress={() => setSheetExpanded((prev) => !prev)}>
            <View style={styles.sheetHandle} />
            <Ionicons
              name={sheetExpanded ? "chevron-down" : "chevron-up"}
              size={14}
              color="#7B8AA6"
              style={styles.sheetHandleIcon}
            />
          </Pressable>
          <View style={styles.sheetTopRow}>
            <View style={styles.groupFilterHeader}>
              <View style={styles.groupFilterRow}>
                {[
                  GROUP_SIZE_FILTER_2,
                  GROUP_SIZE_FILTER_3,
                  GROUP_SIZE_FILTER_5PLUS,
                ].map((filter) => {
                  const active = groupSizeFilter === filter;
                  return (
                    <Pressable
                      key={filter}
                      style={[styles.groupFilterChip, active && styles.groupFilterChipActive]}
                      onPress={() => setGroupSizeFilter(filter)}
                    >
                      <Text style={[styles.groupFilterText, active && styles.groupFilterTextActive]}>
                        {filter === GROUP_SIZE_FILTER_5PLUS ? tx("4인 이상", "4+ people") : `${filter}${tx("인", " people")}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Pressable style={styles.createMingleButton} onPress={() => setCreateModalVisible(true)}>
              <Ionicons name="create-outline" size={16} color="#7B8AA6" />
            </Pressable>
          </View>
          <View style={styles.sheetSummaryRow}>
            <Text style={styles.sheetSummaryText}>{tx(`총 ${filteredGroupRows.length}개의 밍글`, `${filteredGroupRows.length} mingles`)}</Text>
            <View style={styles.sheetSortWrap}>
              <Text style={styles.sheetSortText}>{tx("최신순", "Latest")}</Text>
              <Ionicons name="chevron-down" size={14} color="#8A97AC" />
            </View>
          </View>
          {loading ? <Text style={styles.infoText}>{tx("불러오는 중...", "Loading...")}</Text> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {!loading && !error && mingleMarkers.length === 0 ? (
            <Text style={styles.infoText}>{tx("표시 가능한 밍글 좌표가 없습니다.", "No coordinates to display.")}</Text>
          ) : null}

          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            {!loading && !error ? filteredGroupRows.map((row) => {
              const joined = joinedMingleIdSet.has(row?.mingle?.id);
              const selected = Number(selectedMingleId) === Number(row?.mingle?.id);
              const placeNameText = row?.mingle?.placeName || tx("장소 미정", "Place TBD");
              const targetCount = Number(row?.mingle?.targetParticipantCount);
              const wantedCount = Number.isFinite(targetCount) && targetCount > 0 ? targetCount : null;
              const currentCount = row?.minglers?.length ?? 0;
              const totalCountLabel = wantedCount ? `${toTargetCountLabel(wantedCount)}${tx("명", "")}` : null;

              return (
                <Pressable
                  key={row?.mingle?.id}
                  style={[styles.card, selected && styles.cardSelected]}
                  onPress={() => setSelectedMingleId(row?.mingle?.id)}
                >
                  <View style={styles.cardBody}>
                    <Text style={styles.name}>{row?.mingle?.title || tx("제목 없음", "Untitled")}</Text>
                    <Text style={styles.meta}>
                      {placeNameText} · {currentCount}/{wantedCount ? totalCountLabel : `${Math.max(2, currentCount)}${tx("명", "")}`} · {row?.mingle?.meetDateTime ? toMeetDateTimeLabel(new Date(row.mingle.meetDateTime), locale) : tx("시간 미정", "Time TBD")}
                    </Text>
                    <Text style={styles.description} numberOfLines={1}>
                      {row?.mingle?.description || tx("같이할 밍글러를 기다리고 있어요.", "Looking for minglers to join.")}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.actionButton, joined && styles.actionButtonActive]}
                    onPress={() => handleToggleJoin(row?.mingle?.id)}
                  >
                    <Text style={[styles.actionButtonText, joined && styles.actionButtonTextActive]}>
                      {joined ? tx("참여중", "Joined") : tx("밍글", "Mingle")}
                    </Text>
                  </Pressable>
                </Pressable>
              );
            }) : null}
            {!loading && !error && filteredGroupRows.length === 0 ? (
              <Text style={styles.infoText}>{tx("표시할 항목이 없습니다.", "Nothing to show.")}</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>

      <Modal visible={drawerVisible} transparent animationType="slide" onRequestClose={() => setDrawerVisible(false)}>
        <View style={styles.drawerOverlay}>
          <View style={styles.drawerCard}>
            <Text style={styles.drawerTitle}>{tx("원하는 밍글러를 만나보세요", "Meet your ideal minglers")}</Text>
            <Text style={styles.drawerDescription}>{tx("로컬 밍글러 소모임 지도를 바로 확인할 수 있어요.", "You can check the local mingle map right away.")}</Text>
            <Pressable
              style={styles.drawerPrimaryButton}
              onPress={() => {
                setDrawerVisible(false);
              }}
            >
              <Text style={styles.drawerPrimaryButtonText}>{tx("지도 보기", "View Map")}</Text>
            </Pressable>
            <Pressable style={styles.drawerSecondaryButton} onPress={() => setDrawerVisible(false)}>
              <Text style={styles.drawerSecondaryButtonText}>{tx("닫기", "Close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={createModalVisible} transparent animationType="slide" onRequestClose={() => setCreateModalVisible(false)}>
        <View style={styles.drawerOverlay}>
          <View style={styles.drawerCard}>
            <Text style={styles.drawerTitle}>{tx("새 밍글 만들기", "Create New Mingle")}</Text>
            <TextInput
              style={styles.formInput}
              value={createForm.title}
              onChangeText={(value) => setCreateForm((prev) => ({ ...prev, title: value }))}
              placeholder={tx("제목 (필수)", "Title (Required)")}
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
              placeholder={tx("어디서 만날까요? (선택)", "Where to meet? (Optional)")}
            />
            {placeSearchLoading || placeDetailLoading ? (
              <Text style={styles.placeHelperText}>{tx("장소를 찾는 중...", "Searching places...")}</Text>
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
                {tx("선택된 위치", "Selected")}: {createForm.latitude.toFixed(5)}, {createForm.longitude.toFixed(5)}
              </Text>
            ) : null}
            <Pressable style={styles.dateTimeField} onPress={openDateTimeModal}>
              <View style={styles.dateTimeFieldTextWrap}>
                <Text style={styles.dateTimeFieldLabel}>{tx("언제 만날까요?", "When to meet?")}</Text>
                <Text style={styles.dateTimeFieldValue}>{toMeetDateTimeLabel(createForm.meetDateTime, locale)}</Text>
              </View>
              <Ionicons name="calendar-outline" size={18} color="#1C73F0" />
            </Pressable>
            <View style={styles.targetCountWrap}>
              <Text style={styles.targetCountLabel}>{tx("총 인원", "Total Count")}</Text>
              <View style={styles.targetCountRow}>
                {TARGET_PARTICIPANT_OPTIONS.map((count) => {
                  const selected = Number(createForm.targetParticipantCount) === count;
                  const label = toTargetCountLabel(count);
                  return (
                    <Pressable
                      key={count}
                      style={[styles.targetCountChip, selected && styles.targetCountChipActive]}
                      onPress={() => setCreateForm((prev) => ({ ...prev, targetParticipantCount: count }))}
                    >
                      <Text style={[styles.targetCountChipText, selected && styles.targetCountChipTextActive]}>
                        {label}{tx("명", "")}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <TextInput
              style={[styles.formInput, styles.formInputMultiline]}
              value={createForm.description}
              onChangeText={(value) => setCreateForm((prev) => ({ ...prev, description: value }))}
              placeholder={tx("설명 (선택)", "Description (Optional)")}
              multiline
            />
            <Pressable
              style={[styles.drawerPrimaryButton, createSubmitting && styles.confirmDisabled]}
              onPress={handleCreateMingle}
              disabled={createSubmitting}
            >
              <Text style={styles.drawerPrimaryButtonText}>{createSubmitting ? tx("생성 중...", "Creating...") : tx("밍글 생성", "Create Mingle")}</Text>
            </Pressable>
            <Pressable style={styles.drawerSecondaryButton} onPress={() => setCreateModalVisible(false)} disabled={createSubmitting}>
              <Text style={styles.drawerSecondaryButtonText}>{tx("취소", "Cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={dateTimeModalVisible} transparent animationType="fade" onRequestClose={() => setDateTimeModalVisible(false)}>
        <View style={styles.drawerOverlay}>
          <View style={styles.dateTimeModalCard}>
            <Text style={styles.drawerTitle}>{tx("날짜와 시간 선택", "Pick Date & Time")}</Text>
            <Calendar
              current={toCalendarDateKey(dateTimeDraft)}
              markedDates={{
                [toCalendarDateKey(dateTimeDraft)]: {
                  selected: true,
                  selectedColor: "#1C73F0",
                },
              }}
              onDayPress={handleDateSelected}
              theme={{
                selectedDayBackgroundColor: "#1C73F0",
                todayTextColor: "#1C73F0",
                arrowColor: "#1C73F0",
              }}
            />
            <View style={styles.timeAdjustWrap}>
              <View style={styles.timeAdjustCard}>
                <Text style={styles.timeAdjustLabel}>{tx("시", "Hour")}</Text>
                <View style={styles.timeAdjustRow}>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustDraftHour(-1)}>
                    <Ionicons name="remove" size={16} color="#334155" />
                  </Pressable>
                  <Text style={styles.timeAdjustValue}>{pad2(dateTimeDraft.getHours())}</Text>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustDraftHour(1)}>
                    <Ionicons name="add" size={16} color="#334155" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.timeAdjustCard}>
                <Text style={styles.timeAdjustLabel}>{tx("분", "Minute")}</Text>
                <View style={styles.timeAdjustRow}>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustDraftMinute(-30)}>
                    <Ionicons name="remove" size={16} color="#334155" />
                  </Pressable>
                  <Text style={styles.timeAdjustValue}>{pad2(dateTimeDraft.getMinutes())}</Text>
                  <Pressable style={styles.timeAdjustButton} onPress={() => adjustDraftMinute(30)}>
                    <Ionicons name="add" size={16} color="#334155" />
                  </Pressable>
                </View>
              </View>
            </View>
            <Pressable style={styles.drawerPrimaryButton} onPress={confirmDateTimeSelection}>
              <Text style={styles.drawerPrimaryButtonText}>{tx("적용", "Apply")}</Text>
            </Pressable>
            <Pressable style={styles.drawerSecondaryButton} onPress={() => setDateTimeModalVisible(false)}>
              <Text style={styles.drawerSecondaryButtonText}>{tx("취소", "Cancel")}</Text>
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
    backgroundColor: "#E8EDF5",
  },
  fullScreenMap: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayLayer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  mapTopBar: {
    position: "absolute",
    top: 52,
    left: 14,
    zIndex: 3,
  },
  mapBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  groupFilterHeader: {
    flex: 1,
    marginRight: 8,
  },
  groupFilterRow: {
    flexDirection: "row",
    gap: 8,
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
    minWidth: 56,
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
  listSheet: {
    backgroundColor: "rgba(245,247,251,0.98)",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
  },
  listSheetCollapsed: {
    height: "42%",
  },
  listSheetExpanded: {
    height: "72%",
  },
  sheetHandleButton: {
    alignSelf: "center",
    width: 56,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  sheetTopRow: {
    paddingHorizontal: 16,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#C5CFDC",
  },
  sheetHandleIcon: {
    marginTop: 1,
  },
  sheetContent: {
    paddingHorizontal: 0,
    paddingBottom: 22,
    gap: 0,
  },
  sheetSummaryRow: {
    height: 28,
    paddingHorizontal: 16,
    marginBottom: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetSummaryText: {
    color: "#8B96A8",
    fontSize: 13,
    fontWeight: "600",
  },
  sheetSortWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  sheetSortText: {
    color: "#8B96A8",
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E8ECF3",
  },
  cardSelected: {
    backgroundColor: "#EEF4FF",
  },
  cardBody: {
    flex: 1,
    gap: 5,
  },
  name: {
    color: "#1E66DD",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28,
  },
  meta: {
    color: "#7B879A",
    fontSize: 12,
    fontWeight: "600",
  },
  description: {
    color: "#1D2430",
    fontSize: 14,
    lineHeight: 19,
  },
  actionButton: {
    minWidth: 56,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  actionButtonActive: {
    backgroundColor: "#628FD8",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  actionButtonTextActive: {
    color: "#FFFFFF",
  },
  infoText: {
    color: "#7E889A",
    fontSize: 12,
    textAlign: "center",
    marginTop: 2,
    paddingHorizontal: 16,
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    textAlign: "center",
    marginTop: 2,
    paddingHorizontal: 16,
  },
  markerImage: {
    width: 26,
    height: 34,
    resizeMode: "contain",
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
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#ECF1F8",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE5F1",
  },
  createMingleButtonText: {
    color: "#7B8AA6",
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
  dateTimeField: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D5DEEB",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "space-between",
    flexDirection: "row",
    gap: 10,
  },
  dateTimeFieldTextWrap: {
    flex: 1,
    gap: 2,
  },
  dateTimeFieldLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  dateTimeFieldValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  dateTimeModalCard: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 26,
    gap: 12,
  },
  timeAdjustWrap: {
    flexDirection: "row",
    gap: 10,
  },
  timeAdjustCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D7DFEC",
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: "#F8FAFC",
  },
  timeAdjustLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  timeAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeAdjustButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7DFEC",
    alignItems: "center",
    justifyContent: "center",
  },
  timeAdjustValue: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "800",
    minWidth: 32,
    textAlign: "center",
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
  targetCountWrap: {
    gap: 8,
    marginTop: 2,
  },
  targetCountLabel: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  targetCountRow: {
    flexDirection: "row",
    gap: 8,
  },
  targetCountChip: {
    minWidth: 56,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  targetCountChipActive: {
    borderColor: "#1C73F0",
    backgroundColor: "#EAF2FF",
  },
  targetCountChipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  targetCountChipTextActive: {
    color: "#1C73F0",
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
