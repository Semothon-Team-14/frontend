import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CalendarDateField } from "../../components/CalendarDateField";
import { SearchDropdown } from "../../components/SearchDropdown";
import { createTrip } from "../../services/tripService";
import { fetchAllCities } from "../../services/placeService";

function normalizeLiteral(value) {
  return String(value || "").trim().toLowerCase();
}

function getCityDisplayName(city) {
  return city?.cityNameKorean || city?.cityNameEnglish || city?.name || "";
}

function getCitySearchText(city) {
  return [city?.cityNameKorean, city?.cityNameEnglish, city?.name]
    .filter(Boolean)
    .join(" ");
}

export function CreateTrip({ navigation }) {
  const [title, setTitle] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadCities() {
      try {
        const loadedCities = await fetchAllCities();
        const dedupedCities = Array.from(
          new Map((loadedCities ?? []).map((city) => [city?.id, city])).values(),
        ).sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
        setCities(dedupedCities);
      } catch {
        setCities([]);
      }
    }

    loadCities();
  }, []);

  function handleCityQueryChange(nextQuery) {
    setCityQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatchedCity = cities.find((city) => {
      const ko = normalizeLiteral(city?.cityNameKorean);
      const en = normalizeLiteral(city?.cityNameEnglish);
      const fallback = normalizeLiteral(city?.name);
      return normalizedQuery === ko || normalizedQuery === en || normalizedQuery === fallback;
    }) ?? null;
    setSelectedCity(exactMatchedCity);
  }

  async function handleCreateTrip() {
    if (!title.trim() || !startDate.trim() || !endDate.trim()) {
      setError("제목, 도시, 시작일, 종료일을 모두 입력해주세요.");
      return;
    }

    if (!selectedCity?.id) {
      setError("도시는 목록에서 검색해 정확히 선택해주세요.");
      return;
    }

    if (startDate > endDate) {
      setError("종료일은 시작일보다 같거나 이후여야 합니다.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createTrip({
        title: title.trim(),
        cityId: selectedCity.id,
        startDate: startDate.trim(),
        endDate: endDate.trim(),
      });
      navigation.goBack();
    } catch (requestError) {
      setError(requestError?.message ?? "여행 생성에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>새 여행 추가</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>여행 제목</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="예: 오사카 미식 투어"
        />

        <Text style={styles.label}>도시 검색</Text>
        <SearchDropdown
          value={cityQuery}
          onChangeText={handleCityQueryChange}
          placeholder="도시명을 입력하세요"
          items={cities}
          selectedItem={selectedCity}
          getItemKey={(city) => city.id}
          getItemLabel={getCityDisplayName}
          getItemSearchText={getCitySearchText}
          onSelectItem={(city) => {
            setSelectedCity(city);
            setCityQuery(getCityDisplayName(city));
            setError(null);
          }}
          emptyText="일치하는 도시가 없습니다."
        />
        {selectedCity?.id ? <Text style={styles.selectedCityText}>선택된 도시 ID: {selectedCity.id}</Text> : null}

        <CalendarDateField
          label="시작일"
          value={startDate}
          onChange={(dateValue) => {
            setStartDate(dateValue);
            if (endDate && endDate < dateValue) {
              setEndDate("");
            }
          }}
          maxDate={endDate || undefined}
          placeholder="시작일 선택"
        />

        <CalendarDateField
          label="종료일"
          value={endDate}
          onChange={setEndDate}
          minDate={startDate || undefined}
          placeholder="종료일 선택"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={[styles.createButton, submitting && styles.createButtonDisabled]} onPress={handleCreateTrip} disabled={submitting}>
          <Text style={styles.createButtonText}>{submitting ? "생성 중..." : "여행 생성"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F1F2F5",
    minHeight: "100%",
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  formCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
  },
  selectedCityText: {
    fontSize: 12,
    color: "#1C73F0",
    fontWeight: "600",
  },
  createButton: {
    marginTop: 8,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
