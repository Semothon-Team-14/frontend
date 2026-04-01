import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SearchDropdown } from "../../components/SearchDropdown";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { fetchNationalities, fetchUser, updateUser } from "../../services";

function normalizeLiteral(value) {
  return String(value || "").trim().toLowerCase();
}

function getNationalityDisplayName(nationality) {
  return nationality?.countryNameKorean || nationality?.countryNameEnglish || "";
}

function getNationalitySearchText(nationality) {
  return [nationality?.countryNameKorean, nationality?.countryNameEnglish, nationality?.countryCode]
    .filter(Boolean)
    .join(" ");
}

export function ProfileEdit({ navigation }) {
  const { token, logout } = useAuth();
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);
  const [nationalities, setNationalities] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    sex: "",
    introduction: "",
  });
  const [nationalityQuery, setNationalityQuery] = useState("");
  const [selectedNationality, setSelectedNationality] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    async function load() {
      try {
        const [userResponse, nationalityResponse] = await Promise.all([
          fetchUser(userId),
          fetchNationalities(),
        ]);
        const user = userResponse?.user;
        const loadedNationalities = nationalityResponse?.nationalities ?? [];
        const matchedNationality = loadedNationalities.find((item) => Number(item?.id) === Number(user?.nationalityId)) || null;

        setForm({
          name: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          sex: user?.sex || "",
          introduction: user?.introduction || "",
        });
        setNationalities(loadedNationalities);
        setSelectedNationality(matchedNationality);
        setNationalityQuery(matchedNationality ? getNationalityDisplayName(matchedNationality) : "");
      } catch {
        setError("사용자 정보를 불러오지 못했습니다.");
      }
    }

    load();
  }, [userId]);

  function handleNationalityQueryChange(nextQuery) {
    setNationalityQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatched = nationalities.find((nationality) => {
      const ko = normalizeLiteral(nationality?.countryNameKorean);
      const en = normalizeLiteral(nationality?.countryNameEnglish);
      const code = normalizeLiteral(nationality?.countryCode);
      return normalizedQuery === ko || normalizedQuery === en || normalizedQuery === code;
    }) || null;
    setSelectedNationality(exactMatched);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setError("이름, 이메일, 전화번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateUser(userId, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        sex: form.sex || null,
        introduction: form.introduction?.trim() || null,
        nationalityId: selectedNationality?.id || null,
      });
      navigation.goBack();
    } catch (requestError) {
      setError(requestError?.message || "프로필 저장에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>내 정보 수정</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={(v) => updateField("name", v)} />

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={form.email} onChangeText={(v) => updateField("email", v)} autoCapitalize="none" />

        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={form.phone} onChangeText={(v) => updateField("phone", v)} />

        <Text style={styles.label}>Nationality</Text>
        <SearchDropdown
          value={nationalityQuery}
          onChangeText={handleNationalityQueryChange}
          placeholder="국가명을 입력하세요"
          items={nationalities}
          selectedItem={selectedNationality}
          getItemKey={(nationality) => nationality.id}
          getItemLabel={getNationalityDisplayName}
          getItemSearchText={getNationalitySearchText}
          onSelectItem={(nationality) => {
            setSelectedNationality(nationality);
            setNationalityQuery(getNationalityDisplayName(nationality));
          }}
          emptyText="일치하는 국가가 없습니다."
        />

        <Text style={styles.label}>Sex</Text>
        <View style={styles.sexRow}>
          <Pressable
            style={[styles.sexButton, form.sex === "MALE" && styles.sexButtonActive]}
            onPress={() => updateField("sex", "MALE")}
          >
            <Text style={[styles.sexText, form.sex === "MALE" && styles.sexTextActive]}>MALE</Text>
          </Pressable>
          <Pressable
            style={[styles.sexButton, form.sex === "FEMALE" && styles.sexButtonActive]}
            onPress={() => updateField("sex", "FEMALE")}
          >
            <Text style={[styles.sexText, form.sex === "FEMALE" && styles.sexTextActive]}>FEMALE</Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Introduction</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.introduction}
          onChangeText={(v) => updateField("introduction", v)}
          multiline
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleSave} disabled={loading}>
          <Text style={styles.saveButtonText}>{loading ? "저장 중..." : "저장"}</Text>
        </Pressable>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>로그아웃</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F5F6F8",
    minHeight: "100%",
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 24,
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
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D5D5D5",
    borderRadius: 10,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  sexRow: {
    flexDirection: "row",
    gap: 8,
  },
  sexButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
  },
  sexButtonActive: {
    borderColor: "#0169FE",
    backgroundColor: "#EAF2FF",
  },
  sexText: {
    color: "#666",
    fontWeight: "700",
  },
  sexTextActive: {
    color: "#0169FE",
  },
  errorText: {
    color: "#C62828",
    fontSize: 13,
  },
  saveButton: {
    marginTop: 4,
    backgroundColor: "#0169FE",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#FFF",
    fontWeight: "700",
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: "#D32F2F",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  logoutButtonText: {
    color: "#D32F2F",
    fontWeight: "700",
  },
});
