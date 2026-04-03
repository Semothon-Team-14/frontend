import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CalendarDateField } from "../../components/CalendarDateField";
import { SearchDropdown } from "../../components/SearchDropdown";
import { useLocale } from "../../locale";
import { fetchLocals } from "../../services/localService";
import { fetchAllCities } from "../../services/placeService";
import { recognizeBoardingPass } from "../../services/ticketValidationService";
import { createTrip, fetchTrip, updateTrip } from "../../services/tripService";

const EMPTY_FIELD = "-";

const AIRPORT_LABELS = {
  ICN: { ko: "인천", en: "Incheon" },
  GMP: { ko: "김포", en: "Gimpo" },
  NRT: { ko: "도쿄", en: "Tokyo" },
  HND: { ko: "도쿄", en: "Tokyo" },
  KIX: { ko: "오사카", en: "Osaka" },
  ITM: { ko: "오사카", en: "Osaka" },
  SHA: { ko: "상하이", en: "Shanghai" },
  PVG: { ko: "상하이", en: "Shanghai" },
  JFK: { ko: "뉴욕", en: "New York" },
  LAX: { ko: "로스앤젤레스", en: "Los Angeles" },
};

function normalizeLiteral(value) {
  return String(value || "").trim().toLowerCase();
}

function getCityDisplayName(city, isKorean) {
  if (!city) {
    return "";
  }
  return isKorean
    ? city?.cityNameKorean || city?.cityNameEnglish || city?.name || ""
    : city?.cityNameEnglish || city?.cityNameKorean || city?.name || "";
}

function getCitySubName(city, isKorean) {
  if (!city) {
    return "";
  }
  return isKorean
    ? city?.cityNameEnglish || city?.cityNameKorean || city?.name || ""
    : city?.cityNameKorean || city?.cityNameEnglish || city?.name || "";
}

function getCitySearchText(city) {
  return [city?.cityNameKorean, city?.cityNameEnglish, city?.name].filter(Boolean).join(" ");
}

function toDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  return raw.includes("T") ? raw.slice(0, 10) : raw;
}

function formatTime(value, locale) {
  if (!value) {
    return EMPTY_FIELD;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return EMPTY_FIELD;
  }

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale !== "ko",
  }).format(parsed);
}

function formatDateMeta(value, locale) {
  if (!value) {
    return EMPTY_FIELD;
  }

  const date = new Date(`${toDateOnly(value)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return EMPTY_FIELD;
  }

  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
    .format(date)
    .toUpperCase();
}

function getNights(startDate, endDate) {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getAirportLabel(code, locale) {
  if (!code) {
    return EMPTY_FIELD;
  }
  const safeCode = String(code).toUpperCase();
  const mapped = AIRPORT_LABELS[safeCode];
  if (!mapped) {
    return safeCode;
  }
  return locale === "ko" ? mapped.ko : mapped.en;
}

export function CreateTrip({ navigation, route }) {
  const { tx, locale, isKorean } = useLocale();
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [departureDateTime, setDepartureDateTime] = useState("");
  const [departureLandingDateTime, setDepartureLandingDateTime] = useState("");
  const [fromAirportCode, setFromAirportCode] = useState("");
  const [toAirportCode, setToAirportCode] = useState("");
  const [fromCity, setFromCity] = useState(null);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [cityPickerTarget, setCityPickerTarget] = useState(null);
  const [cityPickerQuery, setCityPickerQuery] = useState("");
  const [cityPickerSelection, setCityPickerSelection] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingInitialData, setLoadingInitialData] = useState(false);
  const [scanningTicket, setScanningTicket] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [error, setError] = useState(null);

  const tripId = Number(route?.params?.tripId || 0);
  const isEditMode = tripId > 0;

  useEffect(() => {
    let mounted = true;

    async function loadInitialData() {
      setLoadingInitialData(true);
      try {
        const [loadedCities, tripResponse, localsResponse] = await Promise.all([
          fetchAllCities(),
          isEditMode ? fetchTrip(tripId) : Promise.resolve(null),
          fetchLocals(),
        ]);

        if (!mounted) {
          return;
        }

        const dedupedCities = Array.from(new Map((loadedCities ?? []).map((city) => [city?.id, city])).values());
        dedupedCities.sort((a, b) => String(getCityDisplayName(a, isKorean)).localeCompare(String(getCityDisplayName(b, isKorean))));
        setCities(dedupedCities);

        if (isEditMode) {
          const trip = tripResponse?.trip ?? null;
          if (trip) {
            const matchedCity = dedupedCities.find((city) => Number(city?.id) === Number(trip?.cityId)) || null;
            const latestLocal = [...(localsResponse?.locals ?? [])]
              .sort((a, b) => Number(b?.id || 0) - Number(a?.id || 0))[0] || null;
            const matchedFromCity = dedupedCities.find(
              (city) => Number(city?.id) === Number(trip?.fromCityId),
            ) || dedupedCities.find(
              (city) => Number(city?.id) === Number(latestLocal?.city?.id),
            ) || latestLocal?.city || null;
            setSelectedCity(matchedCity);
            setFromCity(matchedFromCity);
            setTitle(String(trip?.title || ""));
            setStartDate(toDateOnly(trip?.startDate));
            setEndDate(toDateOnly(trip?.endDate));
            setDepartureDateTime(String(trip?.departureDateTime || ""));
            setDepartureLandingDateTime(String(trip?.departureLandingDateTime || ""));
          }
        }
      } catch {
        if (!mounted) {
          return;
        }
        setCities([]);
        setError(tx("초기 데이터를 불러오지 못했습니다.", "Failed to load initial data."));
      } finally {
        if (mounted) {
          setLoadingInitialData(false);
        }
      }
    }

    loadInitialData();

    return () => {
      mounted = false;
    };
  }, [isEditMode, tripId, isKorean, tx]);

  const actionLabel = useMemo(() => {
    if (submitting) {
      return tx("등록 중...", "Saving...");
    }
    return isEditMode ? tx("수정", "Save") : tx("등록", "Create");
  }, [isEditMode, submitting, tx]);

  const nights = useMemo(() => getNights(startDate, endDate), [startDate, endDate]);
  const dateRangeText = useMemo(() => {
    const from = startDate ? startDate.replaceAll("-", ".") : "0000.00.00";
    const to = endDate ? endDate.replaceAll("-", ".") : "0000.00.00";
    return `${from}   ~   ${to}`;
  }, [endDate, startDate]);

  function handleCityPickerQueryChange(nextQuery) {
    setCityPickerQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatchedCity = cities.find((city) => {
      const ko = normalizeLiteral(city?.cityNameKorean);
      const en = normalizeLiteral(city?.cityNameEnglish);
      const fallback = normalizeLiteral(city?.name);
      return normalizedQuery === ko || normalizedQuery === en || normalizedQuery === fallback;
    }) || null;
    setCityPickerSelection(exactMatchedCity);
  }

  function openCityPicker(target) {
    setCityPickerTarget(target);
    const existing = target === "from" ? fromCity : selectedCity;
    setCityPickerSelection(existing || null);
    setCityPickerQuery(existing ? getCityDisplayName(existing, isKorean) : "");
  }

  function applyCityPickerSelection() {
    if (!cityPickerSelection) {
      setCityPickerTarget(null);
      return;
    }
    if (cityPickerTarget === "from") {
      setFromCity(cityPickerSelection);
      setFromAirportCode("");
    } else if (cityPickerTarget === "to") {
      setSelectedCity(cityPickerSelection);
      setToAirportCode("");
    }
    setError(null);
    setCityPickerTarget(null);
  }

  async function handlePickTicketFromGallery() {
    let permissionResult;
    try {
      permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    } catch {
      const message = tx("권한 확인 중 오류가 발생했습니다.", "Failed to check permissions.");
      setError(message);
      Alert.alert(tx("티켓 스캔", "Ticket Scan"), message);
      return;
    }

    if (!permissionResult?.granted) {
      const message = tx("티켓 이미지를 불러오기 위한 권한이 필요합니다.", "Permission is required to read ticket images.");
      setError(message);
      Alert.alert(tx("티켓 스캔", "Ticket Scan"), message);
      return;
    }

    let pickerResult;
    try {
      pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.9,
        base64: true,
      });
    } catch {
      const message = tx("갤러리를 열 수 없습니다.", "Unable to open gallery.");
      setError(message);
      Alert.alert(tx("티켓 스캔", "Ticket Scan"), message);
      return;
    }

    if (pickerResult?.canceled) {
      return;
    }

    const asset = pickerResult?.assets?.[0] || null;
    if (!asset?.base64) {
      const message = tx("이미지를 읽을 수 없습니다. 다시 시도해주세요.", "Could not read the image. Please try again.");
      setError(message);
      Alert.alert(tx("티켓 스캔", "Ticket Scan"), message);
      return;
    }

    setError(null);
    setScanningTicket(true);
    try {
      const mimeType = asset?.mimeType || "image/jpeg";
      const response = await recognizeBoardingPass({
        imageBase64: `data:${mimeType};base64,${asset.base64}`,
      });
      const draft = response?.draft ?? null;
      if (!draft) {
        setError(tx("티켓 인식 결과를 확인할 수 없습니다.", "Ticket recognition result is empty."));
        return;
      }

      setTitle(String(draft?.title || ""));
      setFromAirportCode(String(draft?.fromAirportCode || ""));
      setToAirportCode(String(draft?.toAirportCode || ""));
      const detectedFromCity = cities.find((cityEntry) => Number(cityEntry?.id) === Number(draft?.fromCityId || 0)) || null;
      setFromCity(detectedFromCity);
      const detectedCity = cities.find((cityEntry) => Number(cityEntry?.id) === Number(draft?.cityId)) || null;
      if (detectedCity) {
        setSelectedCity(detectedCity);
      }
      const nextStartDate = toDateOnly(draft?.startDate);
      setStartDate(nextStartDate);
      setDepartureDateTime(String(draft?.departureDateTime || ""));
      setDepartureLandingDateTime(String(draft?.departureLandingDateTime || ""));
      if (!endDate || (nextStartDate && endDate < nextStartDate)) {
        setEndDate(nextStartDate);
      }
    } catch (scanError) {
      const message = scanError?.message || tx("티켓 인식에 실패했습니다.", "Ticket recognition failed.");
      setError(message);
      Alert.alert(tx("티켓 스캔", "Ticket Scan"), message);
    } finally {
      setScanningTicket(false);
    }
  }

  async function handleSubmitTrip() {
    if (!selectedCity?.id) {
      setError(tx("도시를 정확히 선택해주세요.", "Please select a valid destination city."));
      return;
    }

    if (!startDate || !endDate) {
      setError(tx("여행 일정을 입력해주세요.", "Please set your travel dates."));
      return;
    }

    if (startDate > endDate) {
      setError(tx("여행 종료일은 시작일 이후여야 합니다.", "End date must be on or after start date."));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const resolvedTitle = title?.trim() || `${getCityDisplayName(selectedCity, isKorean)} ${tx("여행", "Trip")}`;
      const payload = {
        title: resolvedTitle,
        cityId: Number(selectedCity.id),
        fromCityId: fromCity?.id ? Number(fromCity.id) : null,
        startDate,
        endDate,
        departureDateTime: departureDateTime || null,
        departureLandingDateTime: departureLandingDateTime || null,
      };

      if (isEditMode) {
        await updateTrip(tripId, payload);
      } else {
        await createTrip(payload);
      }

      navigation.goBack();
    } catch (submitError) {
      setError(submitError?.message || tx("여행 등록에 실패했습니다.", "Failed to save trip."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#141414" />
        </Pressable>
        <Text style={styles.headerTitle}>{tx("새로운 여행지", "New Trip")}</Text>
      </View>

      <Text style={styles.sectionTitle}>{tx("여행지 등록", "Trip Setup")}</Text>

      <View style={styles.tripCardLabels}>
        <Text style={styles.tripCardLabel}>FROM</Text>
        <Text style={styles.tripCardLabel}>TO</Text>
      </View>

      <View style={styles.tripCardRow}>
        <View style={styles.tripLocationCard}>
          {fromCity?.representativeImageUrl ? (
            <Image source={{ uri: fromCity.representativeImageUrl }} style={styles.tripLocationImage} resizeMode="cover" />
          ) : (
            <View style={[styles.tripLocationImage, styles.tripFallbackImage]} />
          )}
          <View style={styles.tripLocationMeta}>
            <View style={styles.tripCityEditRow}>
              <Text style={styles.tripLocationTitle}>{getCityDisplayName(fromCity, isKorean) || getAirportLabel(fromAirportCode, locale)}</Text>
              <Pressable onPress={() => openCityPicker("from")} hitSlop={10}>
                <Ionicons name="pencil" size={14} color="#AAB0BB" />
              </Pressable>
            </View>
            <Text style={styles.tripLocationSubtitle}>{getCitySubName(fromCity, isKorean) || String(fromAirportCode || EMPTY_FIELD)}</Text>
            <View style={styles.tripInfoDivider} />
            <Text style={styles.tripLocationTime}>{formatDateMeta(toDateOnly(departureDateTime) || startDate, locale)}</Text>
          </View>
        </View>

        <View style={styles.tripLocationCard}>
          {selectedCity?.representativeImageUrl ? (
            <Image source={{ uri: selectedCity.representativeImageUrl }} style={styles.tripLocationImage} resizeMode="cover" />
          ) : (
            <View style={[styles.tripLocationImage, styles.tripFallbackImage]} />
          )}
          <View style={styles.tripLocationMeta}>
            <View style={styles.tripCityEditRow}>
              <Text style={[styles.tripLocationTitle, styles.tripLocationTitleTo]}>{getCityDisplayName(selectedCity, isKorean) || EMPTY_FIELD}</Text>
              <Pressable onPress={() => openCityPicker("to")} hitSlop={10}>
                <Ionicons name="pencil" size={14} color="#AAB0BB" />
              </Pressable>
            </View>
            <Text style={styles.tripLocationSubtitle}>{getCitySubName(selectedCity, isKorean) || String(toAirportCode || EMPTY_FIELD)}</Text>
            <View style={styles.tripInfoDivider} />
            <Text style={styles.tripLocationTime}>{formatDateMeta(endDate || toDateOnly(departureLandingDateTime) || startDate, locale)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.scheduleHeader}>
        <Text style={styles.sectionTitle}>{tx("여행 일정", "Travel Dates")}</Text>
        <Text style={styles.scheduleMeta}>
          {nights == null ? tx("일정을 선택해주세요", "Select your dates") : tx(`${nights}박 ${nights + 1}일`, `${nights}N ${nights + 1}D`)}
        </Text>
      </View>

      <Pressable style={styles.dateRangeCard} onPress={() => setDateModalVisible(true)}>
        <Text style={styles.dateRangeText}>{dateRangeText}</Text>
        <Ionicons name="calendar-outline" size={18} color="#A4ACBA" />
      </Pressable>

      {loadingInitialData ? <Text style={styles.metaText}>{tx("초기 데이터를 불러오는 중...", "Loading initial data...")}</Text> : null}
      {scanningTicket ? <Text style={styles.metaText}>{tx("티켓을 분석 중입니다...", "Analyzing ticket...")}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.submitButton, (submitting || loadingInitialData || scanningTicket) && styles.submitButtonDisabled]}
        onPress={handleSubmitTrip}
        disabled={submitting || loadingInitialData || scanningTicket}
      >
        <Text style={styles.submitButtonText}>{actionLabel}</Text>
      </Pressable>

      <Modal visible={Boolean(cityPickerTarget)} transparent animationType="slide" onRequestClose={() => setCityPickerTarget(null)}>
        <View style={styles.pickerModalBackdrop}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>
              {cityPickerTarget === "from" ? tx("출발 도시 선택", "Choose Departure City") : tx("도착 도시 선택", "Choose Destination City")}
            </Text>
            <SearchDropdown
              value={cityPickerQuery}
              onChangeText={handleCityPickerQueryChange}
              placeholder={tx("도시 검색", "Search city")}
              items={cities}
              selectedItem={cityPickerSelection}
              getItemKey={(city) => city.id}
              getItemLabel={(city) => getCityDisplayName(city, isKorean)}
              getItemSearchText={getCitySearchText}
              onSelectItem={(city) => {
                setCityPickerSelection(city);
                setCityPickerQuery(getCityDisplayName(city, isKorean));
              }}
              emptyText={tx("일치하는 도시가 없습니다.", "No matching city.")}
            />
            <View style={styles.pickerActionRow}>
              <Pressable style={styles.pickerCancelButton} onPress={() => setCityPickerTarget(null)}>
                <Text style={styles.pickerCancelText}>{tx("취소", "Cancel")}</Text>
              </Pressable>
              <Pressable style={styles.pickerDoneButton} onPress={applyCityPickerSelection}>
                <Text style={styles.pickerDoneText}>{tx("선택", "Apply")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={dateModalVisible} transparent animationType="fade" onRequestClose={() => setDateModalVisible(false)}>
        <View style={styles.pickerModalBackdrop}>
          <View style={styles.pickerModalCard}>
            <Text style={styles.pickerModalTitle}>{tx("여행 일정", "Travel Dates")}</Text>
            <CalendarDateField
              label={tx("출국일", "Departure date")}
              value={startDate}
              onChange={(dateValue) => {
                setStartDate(dateValue);
                if (endDate && endDate < dateValue) {
                  setEndDate(dateValue);
                }
              }}
              maxDate={endDate || undefined}
              placeholder={tx("날짜 선택", "Select date")}
            />
            <CalendarDateField
              label={tx("여행 종료일", "Trip end date")}
              value={endDate}
              onChange={setEndDate}
              minDate={startDate || undefined}
              placeholder={tx("날짜 선택", "Select date")}
            />
            <View style={styles.pickerActionRow}>
              <Pressable style={styles.pickerDoneButton} onPress={() => setDateModalVisible(false)}>
                <Text style={styles.pickerDoneText}>{tx("완료", "Done")}</Text>
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
    minHeight: "100%",
    backgroundColor: "#F2F3F7",
    paddingTop: 46,
    paddingHorizontal: 18,
    paddingBottom: 26,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  headerTitle: {
    color: "#171717",
    fontSize: 30 / 2,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  sectionTitle: {
    color: "#1B1B1B",
    fontSize: 32 / 2,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  tripCardLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: 4,
  },
  tripCardLabel: {
    color: "#A0A7B5",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
    width: "48%",
  },
  tripCardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  tripLocationCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    overflow: "hidden",
  },
  tripLocationImage: {
    width: "100%",
    height: 128,
    backgroundColor: "#DCE7FF",
  },
  tripFallbackImage: {
    backgroundColor: "#D3E1FF",
  },
  tripLocationMeta: {
    marginTop: -18,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    minHeight: 120,
    alignItems: "center",
  },
  tripCityEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  tripLocationTitle: {
    color: "#20232A",
    fontSize: 34 / 2,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  tripLocationTitleTo: {
    color: "#1D6FF2",
  },
  tripLocationSubtitle: {
    color: "#A0A7B5",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  tripInfoDivider: {
    width: "100%",
    marginTop: 8,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#EBEDF2",
  },
  tripLocationTime: {
    color: "#A2AABA",
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
  },
  scheduleHeader: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scheduleMeta: {
    color: "#A0A7B5",
    fontSize: 13,
    fontWeight: "700",
  },
  dateRangeCard: {
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ECEFF4",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateRangeText: {
    color: "#A3ABBA",
    fontSize: 14,
    fontWeight: "700",
  },
  metaText: {
    color: "#5E6E88",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#CF3A38",
    fontSize: 13,
    fontWeight: "700",
  },
  submitButton: {
    marginTop: 10,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1D6FF2",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  pickerModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.24)",
    justifyContent: "flex-end",
    padding: 14,
  },
  pickerModalCard: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 10,
  },
  pickerModalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#151515",
  },
  pickerActionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  pickerCancelButton: {
    height: 36,
    borderRadius: 12,
    backgroundColor: "#EFF2F7",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  pickerCancelText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "700",
  },
  pickerDoneButton: {
    height: 36,
    borderRadius: 12,
    backgroundColor: "#1D6FF2",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  pickerDoneText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
