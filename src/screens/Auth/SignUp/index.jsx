import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { CalendarDateField } from "../../../components/CalendarDateField";
import { SearchDropdown } from "../../../components/SearchDropdown";
import { useAuth } from "../../../auth";
import { createLocal, createTrip, fetchAllCities, fetchKeywords } from "../../../services";

const STEP_RESIDENCE = 0;
const STEP_KEYWORDS = 1;
const STEP_TRIP = 2;
const STEP_PROFILE = 3;
const STEP_COUNT = 4;

function normalizeLiteral(value) {
  return String(value || "").trim().toLowerCase();
}

function getCityDisplayName(city) {
  const ko = String(city?.cityNameKorean || "").trim();
  const en = String(city?.cityNameEnglish || "").trim();
  if (ko && en) {
    return `${ko} (${en})`;
  }
  return ko || en || "";
}

function getCitySearchText(city) {
  return [city?.cityNameKorean, city?.cityNameEnglish, city?.name]
    .filter(Boolean)
    .join(" ");
}

function formatKeywordLabel(label) {
  const text = String(label || "").trim();
  if (!text) {
    return "";
  }

  return text.startsWith("#") ? text : `#${text}`;
}

function isFilled(value) {
  return String(value || "").trim().length > 0;
}

export function SignUpScreen({ navigation }) {
  const { signup, login } = useAuth();

  const [step, setStep] = useState(STEP_RESIDENCE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [cities, setCities] = useState([]);
  const [keywords, setKeywords] = useState([]);

  const [residenceQuery, setResidenceQuery] = useState("");
  const [selectedResidenceCity, setSelectedResidenceCity] = useState(null);

  const [selectedKeywordIds, setSelectedKeywordIds] = useState([]);

  const [tripCityQuery, setTripCityQuery] = useState("");
  const [selectedTripCity, setSelectedTripCity] = useState(null);
  const [tripStartDate, setTripStartDate] = useState("");
  const [tripEndDate, setTripEndDate] = useState("");

  const [profile, setProfile] = useState({
    name: "",
    sex: "",
    username: "",
    password: "",
    email: "",
    phone: "",
    introduction: "",
  });

  const keywordCountLabel = useMemo(() => {
    if (selectedKeywordIds.length === 0) {
      return "선택 없음";
    }

    return `${selectedKeywordIds.length}개 선택`;
  }, [selectedKeywordIds.length]);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const [loadedCities, keywordResponse] = await Promise.all([
          fetchAllCities(),
          fetchKeywords(),
        ]);

        if (!mounted) {
          return;
        }

        const dedupedCities = Array.from(
          new Map((loadedCities ?? []).map((city) => [city?.id, city])).values(),
        ).sort((a, b) => String(getCityDisplayName(a)).localeCompare(String(getCityDisplayName(b))));
        const loadedKeywords = (keywordResponse?.keywords ?? [])
          .slice()
          .sort((a, b) => Number(b?.priority ?? 0) - Number(a?.priority ?? 0));

        setCities(dedupedCities);
        setKeywords(loadedKeywords);
      } catch {
        if (!mounted) {
          return;
        }

        setCities([]);
        setKeywords([]);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  function updateProfile(key, value) {
    setProfile((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function handleResidenceQueryChange(nextQuery) {
    setResidenceQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatched = cities.find((city) => {
      const ko = normalizeLiteral(city?.cityNameKorean);
      const en = normalizeLiteral(city?.cityNameEnglish);
      const fallback = normalizeLiteral(city?.name);
      return normalizedQuery === ko || normalizedQuery === en || normalizedQuery === fallback;
    }) || null;
    setSelectedResidenceCity(exactMatched);
  }

  function handleTripCityQueryChange(nextQuery) {
    setTripCityQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatched = cities.find((city) => {
      const ko = normalizeLiteral(city?.cityNameKorean);
      const en = normalizeLiteral(city?.cityNameEnglish);
      const fallback = normalizeLiteral(city?.name);
      return normalizedQuery === ko || normalizedQuery === en || normalizedQuery === fallback;
    }) || null;
    setSelectedTripCity(exactMatched);
  }

  function toggleKeyword(keywordId) {
    setSelectedKeywordIds((previous) => {
      if (previous.includes(keywordId)) {
        return previous.filter((id) => id !== keywordId);
      }

      return [...previous, keywordId];
    });
  }

  function validateCurrentStep() {
    if (step === STEP_RESIDENCE && !selectedResidenceCity?.id) {
      setError("현재 거주지를 목록에서 선택해주세요.");
      return false;
    }

    if (step === STEP_TRIP) {
      const hasAnyTripInput = isFilled(tripCityQuery) || isFilled(tripStartDate) || isFilled(tripEndDate);
      if (!hasAnyTripInput) {
        return true;
      }

      if (!selectedTripCity?.id || !isFilled(tripStartDate) || !isFilled(tripEndDate)) {
        setError("여행 계획을 입력하려면 도시와 날짜를 모두 선택해주세요.");
        return false;
      }

      if (tripStartDate > tripEndDate) {
        setError("종료일은 시작일보다 같거나 이후여야 합니다.");
        return false;
      }
    }

    if (step === STEP_PROFILE) {
      if (!isFilled(profile.name) || !isFilled(profile.sex)) {
        setError("닉네임과 성별은 필수입니다.");
        return false;
      }

      if (!isFilled(profile.username) || !isFilled(profile.password) || !isFilled(profile.email) || !isFilled(profile.phone)) {
        setError("아이디, 비밀번호, 이메일, 전화번호를 입력해주세요.");
        return false;
      }
    }

    return true;
  }

  function handleNextStep() {
    if (!validateCurrentStep()) {
      return;
    }

    setError(null);
    setStep((previous) => Math.min(STEP_PROFILE, previous + 1));
  }

  function handleBackStep() {
    setError(null);
    if (step <= STEP_RESIDENCE) {
      navigation.goBack();
      return;
    }

    setStep((previous) => Math.max(STEP_RESIDENCE, previous - 1));
  }

  function handleSkipTripStep() {
    setSelectedTripCity(null);
    setTripCityQuery("");
    setTripStartDate("");
    setTripEndDate("");
    setError(null);
    setStep(STEP_PROFILE);
  }

  async function handleCompleteSignup() {
    if (!validateCurrentStep()) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await signup({
        username: profile.username.trim(),
        password: profile.password,
        name: profile.name.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
        sex: profile.sex,
        introduction: profile.introduction?.trim() ? profile.introduction.trim() : null,
        nationalityId: selectedResidenceCity?.nationalityId || null,
        keywordIds: selectedKeywordIds,
      });

      await login(profile.username.trim(), profile.password);

      if (selectedResidenceCity?.id) {
        await createLocal({ cityId: selectedResidenceCity.id });
      }

      if (selectedTripCity?.id && isFilled(tripStartDate) && isFilled(tripEndDate)) {
        const tripTitle = `${getCityDisplayName(selectedTripCity)} 여행`;
        await createTrip({
          title: tripTitle,
          cityId: selectedTripCity.id,
          startDate: tripStartDate,
          endDate: tripEndDate,
        });
      }
    } catch (requestError) {
      setError(requestError?.message || "회원가입 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Pressable onPress={handleBackStep}>
          <Text style={styles.backText}>이전</Text>
        </Pressable>
        <Text style={styles.stepText}>{step + 1} / {STEP_COUNT}</Text>
      </View>

      <View style={styles.progressRow}>
        {[0, 1, 2, 3].map((index) => (
          <View key={index} style={[styles.progressDot, index <= step && styles.progressDotActive]} />
        ))}
      </View>

      {step === STEP_RESIDENCE ? (
        <View style={styles.card}>
          <Text style={styles.title}>반가워요!</Text>
          <Text style={styles.subtitle}>현재 거주지를 알려주세요.</Text>
          <Text style={styles.helper}>상세한 위치를 입력할수록 좋아요.</Text>

          <SearchDropdown
            value={residenceQuery}
            onChangeText={handleResidenceQueryChange}
            placeholder="검색어를 입력하세요"
            items={cities}
            selectedItem={selectedResidenceCity}
            getItemKey={(city) => city.id}
            getItemLabel={getCityDisplayName}
            getItemSearchText={getCitySearchText}
            onSelectItem={(city) => {
              setSelectedResidenceCity(city);
              setResidenceQuery(getCityDisplayName(city));
              setError(null);
            }}
            emptyText="일치하는 도시가 없습니다."
          />
        </View>
      ) : null}

      {step === STEP_KEYWORDS ? (
        <View style={styles.card}>
          <Text style={styles.title}>나의 여행 스타일 키워드</Text>
          <Text style={styles.subtitle}>가장 가까운 키워드를 선택해주세요.</Text>
          <Text style={styles.helper}>중복 선택 가능 · {keywordCountLabel}</Text>

          <View style={styles.keywordWrap}>
            {keywords.map((keyword) => {
              const active = selectedKeywordIds.includes(keyword.id);
              return (
                <Pressable
                  key={keyword.id}
                  style={[styles.keywordChip, active && styles.keywordChipActive]}
                  onPress={() => toggleKeyword(keyword.id)}
                >
                  <Text style={[styles.keywordChipText, active && styles.keywordChipTextActive]}>
                    {formatKeywordLabel(keyword.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {step === STEP_TRIP ? (
        <View style={styles.card}>
          <Text style={styles.title}>곧 떠날 여정이 있다면 알려주세요!</Text>
          <Text style={styles.subtitle}>미리 밍글러를 위한 연결을 준비할게요.</Text>

          <Text style={styles.label}>어디로 떠나시나요?</Text>
          <SearchDropdown
            value={tripCityQuery}
            onChangeText={handleTripCityQueryChange}
            placeholder="검색어를 입력하세요"
            items={cities}
            selectedItem={selectedTripCity}
            getItemKey={(city) => city.id}
            getItemLabel={getCityDisplayName}
            getItemSearchText={getCitySearchText}
            onSelectItem={(city) => {
              setSelectedTripCity(city);
              setTripCityQuery(getCityDisplayName(city));
              setError(null);
            }}
            emptyText="일치하는 도시가 없습니다."
          />

          <Text style={styles.label}>언제 머무르시나요?</Text>
          <CalendarDateField
            label="시작일"
            value={tripStartDate}
            onChange={(dateValue) => {
              setTripStartDate(dateValue);
              if (tripEndDate && tripEndDate < dateValue) {
                setTripEndDate("");
              }
            }}
            maxDate={tripEndDate || undefined}
            placeholder="0000.00.00"
          />
          <CalendarDateField
            label="종료일"
            value={tripEndDate}
            onChange={setTripEndDate}
            minDate={tripStartDate || undefined}
            placeholder="0000.00.00"
          />

          <Pressable style={styles.skipButton} onPress={handleSkipTripStep}>
            <Text style={styles.skipButtonText}>건너뛰기</Text>
          </Pressable>
        </View>
      ) : null}

      {step === STEP_PROFILE ? (
        <View style={styles.card}>
          <Text style={styles.title}>마지막이에요!</Text>
          <Text style={styles.subtitle}>기본 정보를 설정해주세요.</Text>

          <Text style={styles.label}>닉네임</Text>
          <TextInput
            style={styles.input}
            placeholder="닉네임을 입력해주세요"
            value={profile.name}
            onChangeText={(value) => updateProfile("name", value)}
          />

          <Text style={styles.label}>성별</Text>
          <View style={styles.sexRow}>
            <Pressable style={[styles.sexButton, profile.sex === "FEMALE" && styles.sexButtonActive]} onPress={() => updateProfile("sex", "FEMALE")}>
              <Text style={[styles.sexText, profile.sex === "FEMALE" && styles.sexTextActive]}>여자</Text>
            </Pressable>
            <Pressable style={[styles.sexButton, profile.sex === "MALE" && styles.sexButtonActive]} onPress={() => updateProfile("sex", "MALE")}>
              <Text style={[styles.sexText, profile.sex === "MALE" && styles.sexTextActive]}>남자</Text>
            </Pressable>
          </View>

          <Text style={styles.label}>아이디</Text>
          <TextInput style={styles.input} autoCapitalize="none" value={profile.username} onChangeText={(value) => updateProfile("username", value)} />

          <Text style={styles.label}>비밀번호</Text>
          <TextInput style={styles.input} secureTextEntry value={profile.password} onChangeText={(value) => updateProfile("password", value)} />

          <Text style={styles.label}>이메일</Text>
          <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" value={profile.email} onChangeText={(value) => updateProfile("email", value)} />

          <Text style={styles.label}>전화번호</Text>
          <TextInput style={styles.input} keyboardType="phone-pad" value={profile.phone} onChangeText={(value) => updateProfile("phone", value)} />

          <Text style={styles.label}>소개 (선택)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            value={profile.introduction}
            onChangeText={(value) => updateProfile("introduction", value)}
          />
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
        onPress={step === STEP_PROFILE ? handleCompleteSignup : handleNextStep}
        disabled={loading}
      >
        <Text style={styles.primaryButtonText}>
          {loading ? "처리 중..." : step === STEP_PROFILE ? "확인" : "다음"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: "100%",
    backgroundColor: "#F6F7FA",
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 34,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backText: {
    color: "#3F4A60",
    fontSize: 14,
    fontWeight: "700",
  },
  stepText: {
    color: "#5F6980",
    fontSize: 13,
    fontWeight: "600",
  },
  progressRow: {
    flexDirection: "row",
    gap: 6,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D9DEE8",
  },
  progressDotActive: {
    backgroundColor: "#1C73F0",
  },
  card: {
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7EBF2",
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 8,
  },
  title: {
    color: "#101827",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 2,
  },
  subtitle: {
    color: "#2A364F",
    fontSize: 14,
    fontWeight: "600",
  },
  helper: {
    color: "#75809B",
    fontSize: 12,
    marginBottom: 4,
  },
  label: {
    marginTop: 4,
    color: "#59627A",
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D5DBE7",
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#101827",
    fontSize: 14,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  keywordWrap: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  keywordChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D8E2F5",
    backgroundColor: "#F3F7FF",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  keywordChipActive: {
    borderColor: "#1C73F0",
    backgroundColor: "#EAF2FF",
  },
  keywordChipText: {
    color: "#34466C",
    fontSize: 12,
    fontWeight: "700",
  },
  keywordChipTextActive: {
    color: "#145FCA",
  },
  sexRow: {
    flexDirection: "row",
    gap: 8,
  },
  sexButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D5DBE7",
    alignItems: "center",
    justifyContent: "center",
  },
  sexButtonActive: {
    borderColor: "#1C73F0",
    backgroundColor: "#EAF2FF",
  },
  sexText: {
    color: "#4F5D7D",
    fontWeight: "700",
    fontSize: 14,
  },
  sexTextActive: {
    color: "#145FCA",
  },
  skipButton: {
    marginTop: 8,
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  skipButtonText: {
    color: "#6F7890",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 4,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1C73F0",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
