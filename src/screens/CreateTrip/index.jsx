import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { CalendarDateField } from "../../components/CalendarDateField";
import { SearchDropdown } from "../../components/SearchDropdown";
import { useLocale } from "../../locale";
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
  const [cityQuery, setCityQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [departureDateTime, setDepartureDateTime] = useState("");
  const [departureLandingDateTime, setDepartureLandingDateTime] = useState("");
  const [fromAirportCode, setFromAirportCode] = useState("");
  const [toAirportCode, setToAirportCode] = useState("");
  const [fromCity, setFromCity] = useState(null);
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingInitialData, setLoadingInitialData] = useState(false);
  const [scanningTicket, setScanningTicket] = useState(false);
  const [error, setError] = useState(null);

  const tripId = Number(route?.params?.tripId || 0);
  const isEditMode = tripId > 0;

  useEffect(() => {
    let mounted = true;

    async function loadInitialData() {
      setLoadingInitialData(true);
      try {
        const [loadedCities, tripResponse] = await Promise.all([
          fetchAllCities(),
          isEditMode ? fetchTrip(tripId) : Promise.resolve(null),
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
            setSelectedCity(matchedCity);
            setCityQuery(matchedCity ? getCityDisplayName(matchedCity, isKorean) : "");
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

  function handleCityQueryChange(nextQuery) {
    setCityQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatchedCity = cities.find((city) => {
      const ko = normalizeLiteral(city?.cityNameKorean);
      const en = normalizeLiteral(city?.cityNameEnglish);
      const fallback = normalizeLiteral(city?.name);
      return normalizedQuery === ko || normalizedQuery === en || normalizedQuery === fallback;
    }) || null;
    setSelectedCity(exactMatchedCity);
  }

  async function handlePickTicket(source) {
    let permissionResult;
    try {
      permissionResult = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
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
      pickerResult = source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.9,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: false,
            quality: 0.9,
            base64: true,
          });
    } catch {
      const message = source === "camera"
        ? tx("카메라를 실행할 수 없습니다. 에뮬레이터에서는 갤러리 선택을 사용해주세요.", "Camera is not available. On emulators, use gallery selection.")
        : tx("갤러리를 열 수 없습니다.", "Unable to open gallery.");
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
        setCityQuery(getCityDisplayName(detectedCity, isKorean));
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
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.sectionTitle}>{tx("여행지 등록", "Trip Setup")}</Text>

      <View style={styles.citySelectorArea}>
        <SearchDropdown
          value={cityQuery}
          onChangeText={handleCityQueryChange}
          placeholder={tx("도착 도시 검색", "Search destination city")}
          items={cities}
          selectedItem={selectedCity}
          getItemKey={(city) => city.id}
          getItemLabel={(city) => getCityDisplayName(city, isKorean)}
          getItemSearchText={getCitySearchText}
          onSelectItem={(city) => {
            setSelectedCity(city);
            setCityQuery(getCityDisplayName(city, isKorean));
            setError(null);
          }}
          emptyText={tx("일치하는 도시가 없습니다.", "No matching city.")}
        />
      </View>

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
            <Text style={styles.tripLocationTitle}>{getAirportLabel(fromAirportCode, locale)}</Text>
            <Text style={styles.tripLocationSubtitle}>{String(fromAirportCode || EMPTY_FIELD)}</Text>
            <Text style={styles.tripLocationTime}>{formatTime(departureDateTime, locale)}</Text>
            <Text style={styles.tripLocationDate}>{formatDateMeta(startDate, locale)}</Text>
          </View>
        </View>

        <View style={styles.tripLocationCard}>
          {selectedCity?.representativeImageUrl ? (
            <Image source={{ uri: selectedCity.representativeImageUrl }} style={styles.tripLocationImage} resizeMode="cover" />
          ) : (
            <View style={[styles.tripLocationImage, styles.tripFallbackImage]} />
          )}
          <View style={styles.tripLocationMeta}>
            <Text style={styles.tripLocationTitle}>{getCityDisplayName(selectedCity, isKorean) || EMPTY_FIELD}</Text>
            <Text style={styles.tripLocationSubtitle}>{getCitySubName(selectedCity, isKorean) || String(toAirportCode || EMPTY_FIELD)}</Text>
            <Text style={styles.tripLocationTime}>{formatTime(departureLandingDateTime, locale)}</Text>
            <Text style={styles.tripLocationDate}>{formatDateMeta(startDate, locale)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.scanRow}>
        <Pressable
          style={[styles.scanButton, scanningTicket && styles.scanButtonDisabled]}
          onPress={() => handlePickTicket("gallery")}
          disabled={scanningTicket || submitting || loadingInitialData}
        >
          <Ionicons name="images-outline" size={18} color="#1D6FF2" />
          <Text style={styles.scanButtonText}>{tx("갤러리에서 티켓 불러오기", "Scan Ticket from Gallery")}</Text>
        </Pressable>
        <Pressable
          style={[styles.scanButton, scanningTicket && styles.scanButtonDisabled]}
          onPress={() => handlePickTicket("camera")}
          disabled={scanningTicket || submitting || loadingInitialData}
        >
          <Ionicons name="camera-outline" size={18} color="#1D6FF2" />
          <Text style={styles.scanButtonText}>{tx("카메라로 티켓 촬영", "Scan Ticket with Camera")}</Text>
        </Pressable>
      </View>

      <View style={styles.scheduleHeader}>
        <Text style={styles.sectionTitle}>{tx("여행 일정", "Travel Dates")}</Text>
        <Text style={styles.scheduleMeta}>
          {nights == null ? tx("일정을 선택해주세요", "Select your dates") : tx(`${nights}박 ${nights + 1}일`, `${nights}N ${nights + 1}D`)}
        </Text>
      </View>

      <View style={styles.dateRangeCard}>
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
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: "100%",
    backgroundColor: "#F2F3F7",
    paddingTop: 54,
    paddingHorizontal: 18,
    paddingBottom: 28,
    gap: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    color: "#171717",
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  headerSpacer: {
    width: 24,
  },
  sectionTitle: {
    color: "#1B1B1B",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  citySelectorArea: {
    marginTop: 2,
  },
  tripCardLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginTop: 4,
  },
  tripCardLabel: {
    color: "#A0A7B5",
    fontSize: 24,
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
    borderRadius: 20,
    overflow: "hidden",
  },
  tripLocationImage: {
    width: "100%",
    height: 182,
    backgroundColor: "#DCE7FF",
  },
  tripFallbackImage: {
    backgroundColor: "#D3E1FF",
  },
  tripLocationMeta: {
    marginTop: -24,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
    minHeight: 172,
  },
  tripLocationTitle: {
    color: "#20232A",
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  tripLocationSubtitle: {
    color: "#A0A7B5",
    fontSize: 26,
    fontWeight: "700",
    marginTop: 2,
  },
  tripLocationTime: {
    marginTop: 20,
    color: "#20232A",
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: -1,
  },
  tripLocationDate: {
    marginTop: 4,
    color: "#A0A7B5",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  scanRow: {
    gap: 8,
    marginTop: 2,
  },
  scanButton: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EAF2FF",
  },
  scanButtonDisabled: {
    opacity: 0.7,
  },
  scanButtonText: {
    color: "#1D6FF2",
    fontSize: 14,
    fontWeight: "700",
  },
  scheduleHeader: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  scheduleMeta: {
    color: "#A0A7B5",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 2,
  },
  dateRangeCard: {
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 8,
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
    marginTop: 8,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#1D6FF2",
    alignItems: "center",
    justifyContent: "center",
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
});
