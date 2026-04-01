import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SearchDropdown } from "../../../components/SearchDropdown";
import { useAuth } from "../../../auth";
import { fetchNationalities } from "../../../services";

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

export function SignUpScreen({ navigation }) {
  const { signup, login } = useAuth();
  const [form, setForm] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    phone: "",
    sex: "",
    introduction: "",
  });
  const [nationalityQuery, setNationalityQuery] = useState("");
  const [selectedNationality, setSelectedNationality] = useState(null);
  const [nationalities, setNationalities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function updateField(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  useEffect(() => {
    async function loadNationalities() {
      try {
        const response = await fetchNationalities();
        const loaded = response?.nationalities ?? [];
        setNationalities(loaded);
      } catch {
        setNationalities([]);
      }
    }

    loadNationalities();
  }, []);

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

  async function handleSignUp() {
    const requiredKeys = ["username", "password", "name", "email", "phone", "sex"];
    const missing = requiredKeys.some((key) => !form[key]?.trim());

    if (missing) {
      setError("username, password, name, email, phone, sex are required.");
      return;
    }

    if (!selectedNationality?.id) {
      setError("국적을 목록에서 선택해주세요.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signup({
        username: form.username.trim(),
        password: form.password,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        sex: form.sex.trim(),
        introduction: form.introduction?.trim() ? form.introduction.trim() : null,
        nationalityId: selectedNationality.id,
        keywordIds: [],
      });

      await login(form.username.trim(), form.password);
    } catch (requestError) {
      setError(requestError?.message ?? "Sign up failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>회원가입</Text>
      <Text style={styles.subtitle}>Figma 인증 화면 추가 전 임시 인증 UI입니다.</Text>

      <View style={styles.form}>
        <Field label="Username" value={form.username} onChangeText={(v) => updateField("username", v)} />
        <Field label="Password" value={form.password} onChangeText={(v) => updateField("password", v)} secureTextEntry />
        <Field label="Name" value={form.name} onChangeText={(v) => updateField("name", v)} />
        <Field label="Email" value={form.email} onChangeText={(v) => updateField("email", v)} />
        <Field label="Phone" value={form.phone} onChangeText={(v) => updateField("phone", v)} />

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
            setError(null);
          }}
          emptyText="일치하는 국가가 없습니다."
        />

        <Text style={styles.label}>Sex</Text>
        <View style={styles.sexRow}>
          <Pressable
            style={[styles.sexButton, form.sex === "MALE" && styles.sexButtonActive]}
            onPress={() => updateField("sex", "MALE")}
          >
            <Text style={[styles.sexButtonText, form.sex === "MALE" && styles.sexButtonTextActive]}>MALE</Text>
          </Pressable>
          <Pressable
            style={[styles.sexButton, form.sex === "FEMALE" && styles.sexButtonActive]}
            onPress={() => updateField("sex", "FEMALE")}
          >
            <Text style={[styles.sexButtonText, form.sex === "FEMALE" && styles.sexButtonTextActive]}>FEMALE</Text>
          </Pressable>
        </View>

        <Field
          label="Introduction (optional)"
          value={form.introduction}
          onChangeText={(v) => updateField("introduction", v)}
          multiline
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.primaryBtn} onPress={handleSignUp} disabled={loading}>
          <Text style={styles.primaryBtnText}>{loading ? "가입 중..." : "회원가입"}</Text>
        </Pressable>

        <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.secondaryBtnText}>로그인으로 돌아가기</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Field({ label, ...inputProps }) {
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, inputProps.multiline && styles.textArea]}
        autoCapitalize="none"
        placeholder={inputProps.placeholder || label}
        {...inputProps}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F5F6F8",
    minHeight: "100%",
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 30,
    gap: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
  },
  form: {
    marginTop: 6,
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
  sexButtonText: {
    color: "#666",
    fontWeight: "700",
  },
  sexButtonTextActive: {
    color: "#0169FE",
  },
  error: {
    color: "#C62828",
    fontSize: 13,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: "#0169FE",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: "#FFF",
    fontWeight: "700",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#0169FE",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: "#0169FE",
    fontWeight: "700",
  },
});
