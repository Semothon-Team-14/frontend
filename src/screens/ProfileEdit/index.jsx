import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { SearchDropdown } from "../../components/SearchDropdown";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import {
  fetchLocals,
  fetchNationalities,
  fetchUser,
  updateLocal,
  updateUser,
  uploadUserProfileImage,
} from "../../services";

function normalizeLiteral(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getNationalityDisplayName(nationality) {
  return (
    nationality?.countryNameKorean || nationality?.countryNameEnglish || ""
  );
}

function getNationalitySearchText(nationality) {
  return [
    nationality?.countryNameKorean,
    nationality?.countryNameEnglish,
    nationality?.countryCode,
  ]
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
    profileImageUrl: "",
  });
  const [nationalityQuery, setNationalityQuery] = useState("");
  const [selectedNationality, setSelectedNationality] = useState(null);
  const [localId, setLocalId] = useState(null);
  const [availableTimeText, setAvailableTimeText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    async function load() {
      try {
        const [userResponse, nationalityResponse, localsResponse] = await Promise.all([
          fetchUser(userId),
          fetchNationalities(),
          fetchLocals(),
        ]);
        const user = userResponse?.user;
        const loadedNationalities = nationalityResponse?.nationalities ?? [];
        const latestLocal = (localsResponse?.locals ?? [])[0] || null;
        const matchedNationality =
          loadedNationalities.find(
            (item) => Number(item?.id) === Number(user?.nationalityId),
          ) || null;

        setForm({
          name: user?.name || "",
          email: user?.email || "",
          phone: user?.phone || "",
          sex: user?.sex || "",
          introduction: user?.introduction || "",
          profileImageUrl: user?.profileImageUrl || "",
        });
        setNationalities(loadedNationalities);
        setSelectedNationality(matchedNationality);
        setNationalityQuery(
          matchedNationality
            ? getNationalityDisplayName(matchedNationality)
            : "",
        );
        setLocalId(Number(latestLocal?.id || 0) || null);
        setAvailableTimeText(String(latestLocal?.availableTimeText || ""));
      } catch {
        setError("사용자 정보를 불러오지 못했습니다.");
      }
    }

    load();
  }, [userId]);

  function handleNationalityQueryChange(nextQuery) {
    setNationalityQuery(nextQuery);
    const normalizedQuery = normalizeLiteral(nextQuery);
    const exactMatched =
      nationalities.find((nationality) => {
        const ko = normalizeLiteral(nationality?.countryNameKorean);
        const en = normalizeLiteral(nationality?.countryNameEnglish);
        const code = normalizeLiteral(nationality?.countryCode);
        return (
          normalizedQuery === ko ||
          normalizedQuery === en ||
          normalizedQuery === code
        );
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
        profileImageUrl: form.profileImageUrl?.trim() || null,
        nationalityId: selectedNationality?.id || null,
      });
      if (Number(localId) > 0) {
        await updateLocal(localId, {
          availableTimeText: availableTimeText.trim() || null,
        });
      }
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

  async function pickAndUploadProfileImage(source) {
    setError(null);
    try {
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          source === "camera"
            ? "카메라 권한을 허용해주세요."
            : "사진 접근 권한을 허용해주세요.",
        );
        return;
      }

      const launch =
        source === "camera"
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;
      const picked = await launch({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
        aspect: [1, 1],
      });
      if (picked.canceled) {
        return;
      }

      const assetUri = picked.assets?.[0]?.uri || "";
      if (!assetUri) {
        setError("선택한 이미지를 불러오지 못했습니다.");
        return;
      }

      setLoading(true);
      const uploadResponse = await uploadUserProfileImage(userId, assetUri);
      const uploadedImageUrl = uploadResponse?.user?.profileImageUrl || "";
      if (!uploadedImageUrl) {
        throw new Error("프로필 사진 URL을 받지 못했습니다.");
      }

      updateField("profileImageUrl", uploadedImageUrl);
    } catch (requestError) {
      setError(requestError?.message || "프로필 사진 업로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePickProfileImageFromGallery() {
    await pickAndUploadProfileImage("gallery");
  }

  async function handlePickProfileImageFromCamera() {
    await pickAndUploadProfileImage("camera");
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>내 정보 수정</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.formCard}>
        <Text style={styles.label}>프로필 이미지</Text>
        <View style={styles.profileImageRow}>
          <View style={styles.profileImagePreview}>
            {form.profileImageUrl ? (
              <Image
                source={{ uri: form.profileImageUrl }}
                style={styles.profileImage}
              />
            ) : (
              <Ionicons
                name="person-circle"
                size={62}
                color="#94A3B8"
                style={styles.profileImagePlaceholder}
              />
            )}
          </View>
          <View style={styles.profileImageButtonGroup}>
            <Pressable
              style={styles.profileImageButton}
              onPress={handlePickProfileImageFromGallery}
              disabled={loading}
            >
              <Text style={styles.profileImageButtonText}>갤러리</Text>
            </Pressable>
            <Pressable
              style={styles.profileImageButton}
              onPress={handlePickProfileImageFromCamera}
              disabled={loading}
            >
              <Text style={styles.profileImageButtonText}>카메라</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.label}>닉네임</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(v) => updateField("name", v)}
        />

        <Text style={styles.label}>이메일</Text>
        <TextInput
          style={styles.input}
          value={form.email}
          onChangeText={(v) => updateField("email", v)}
          autoCapitalize="none"
        />

        <Text style={styles.label}>전화번호</Text>
        <TextInput
          style={styles.input}
          value={form.phone}
          onChangeText={(v) => updateField("phone", v)}
        />

        <Text style={styles.label}>국가</Text>
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

        <Text style={styles.label}>성별</Text>
        <View style={styles.sexRow}>
          <Pressable
            style={[
              styles.sexButton,
              form.sex === "MALE" && styles.sexButtonActive,
            ]}
            onPress={() => updateField("sex", "MALE")}
          >
            <Text
              style={[
                styles.sexText,
                form.sex === "MALE" && styles.sexTextActive,
              ]}
            >
              남자
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.sexButton,
              form.sex === "FEMALE" && styles.sexButtonActive,
            ]}
            onPress={() => updateField("sex", "FEMALE")}
          >
            <Text
              style={[
                styles.sexText,
                form.sex === "FEMALE" && styles.sexTextActive,
              ]}
            >
              여자
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>Introduction</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.introduction}
          onChangeText={(v) => updateField("introduction", v)}
          multiline
        />

        {Number(localId) > 0 ? (
          <>
            <Text style={styles.label}>가능 시간</Text>
            <TextInput
              style={styles.input}
              value={availableTimeText}
              onChangeText={setAvailableTimeText}
              placeholder="예: 토 · 09:30 ~ 21:40"
            />
          </>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>
            {loading ? "저장 중..." : "저장"}
          </Text>
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
  profileImageRow: {
    // flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  profileImagePreview: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    backgroundColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  profileImagePlaceholder: {
    lineHeight: 62,
  },
  profileImageButton: {
    height: 38,
    borderRadius: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#C9D3E7",
    backgroundColor: "#F8FAFD",
    alignItems: "center",
    justifyContent: "center",
  },
  profileImageButtonText: {
    color: "#4A5A78",
    fontSize: 13,
    fontWeight: "700",
  },
  profileImageButtonGroup: {
    gap: 8,
    flexDirection: "row",
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
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF",
    paddingHorizontal: 20,
    borderWidth: 0.5,
    borderColor: "#D5D5D5",
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
