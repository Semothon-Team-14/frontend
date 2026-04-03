import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { SearchDropdown } from "../../components/SearchDropdown";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import { useLocale } from "../../locale";
import {
  getCurrentHomeMode,
  HOME_MODE_LOCAL,
  HOME_MODE_TRAVELER,
  setCurrentHomeMode,
} from "../../state/homeMode";
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

function getNationalityDisplayName(nationality, isKorean) {
  return (
    (isKorean
      ? nationality?.countryNameKorean || nationality?.countryNameEnglish
      : nationality?.countryNameEnglish || nationality?.countryNameKorean) || ""
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
  const { tx, isKorean } = useLocale();
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
  const [selectedHomeMode, setSelectedHomeMode] = useState(getCurrentHomeMode());
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
            ? getNationalityDisplayName(matchedNationality, isKorean)
            : "",
        );
        setLocalId(Number(latestLocal?.id || 0) || null);
        setAvailableTimeText(String(latestLocal?.availableTimeText || ""));
      } catch {
        setError(tx("사용자 정보를 불러오지 못했습니다.", "Failed to load user profile."));
      }
    }

    load();
  }, [userId, isKorean, tx]);

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
      setError(tx("이름, 이메일, 전화번호를 입력해주세요.", "Please enter name, email, and phone."));
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

      if (selectedHomeMode === HOME_MODE_LOCAL && Number(localId) > 0) {
        await updateLocal(localId, {
          availableTimeText: availableTimeText.trim() || null,
        });
      }

      navigation.goBack();
    } catch (requestError) {
      setError(requestError?.message || tx("프로필 저장에 실패했습니다.", "Failed to save profile."));
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
            ? tx("카메라 권한을 허용해주세요.", "Please allow camera permission.")
            : tx("사진 접근 권한을 허용해주세요.", "Please allow photo permission."),
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
        setError(tx("선택한 이미지를 불러오지 못했습니다.", "Failed to load selected image."));
        return;
      }

      setLoading(true);
      const uploadResponse = await uploadUserProfileImage(userId, assetUri);
      const uploadedImageUrl = uploadResponse?.user?.profileImageUrl || "";
      if (!uploadedImageUrl) {
        throw new Error(tx("프로필 사진 URL을 받지 못했습니다.", "Did not receive profile image URL."));
      }

      updateField("profileImageUrl", uploadedImageUrl);
    } catch (requestError) {
      setError(requestError?.message || tx("프로필 사진 업로드에 실패했습니다.", "Failed to upload profile photo."));
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

  const localMode = selectedHomeMode === HOME_MODE_LOCAL;
  const travelerMode = selectedHomeMode === HOME_MODE_TRAVELER;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </Pressable>
        <Text style={styles.headerTitle}>{tx("내 정보 수정", "Edit Profile")}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.modeBar}>
        <Text style={styles.modeBarTitle}>
          {localMode
            ? tx("현재 모드: 로컬", "Current Mode: Local")
            : tx("현재 모드: 여행자", "Current Mode: Traveler")}
        </Text>
        <View style={styles.modeToggleRow}>
          <Text style={[styles.modeToggleLabel, travelerMode && styles.modeToggleLabelActive]}>
            {tx("여행자", "Traveler")}
          </Text>
          <Switch
            value={localMode}
            onValueChange={(nextValue) => {
              const nextMode = nextValue ? HOME_MODE_LOCAL : HOME_MODE_TRAVELER;
              setSelectedHomeMode(nextMode);
              setCurrentHomeMode(nextMode);
            }}
            trackColor={{ false: "#6B7380", true: "#3E65FF" }}
            thumbColor="#FFFFFF"
          />
          <Text style={[styles.modeToggleLabel, localMode && styles.modeToggleLabelActive]}>
            {tx("로컬", "Local")}
          </Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.sectionTitle}>{localMode ? tx("로컬 프로필", "Local Profile") : tx("여행자 프로필", "Traveler Profile")}</Text>

        <Text style={styles.label}>{tx("프로필 이미지", "Profile Image")}</Text>
        <View style={styles.profileImageRow}>
          <View style={styles.profileImagePreview}>
            {form.profileImageUrl ? (
              <Image source={{ uri: form.profileImageUrl }} style={styles.profileImage} resizeMode="cover" />
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
              <Text style={styles.profileImageButtonText}>{tx("갤러리", "Gallery")}</Text>
            </Pressable>
            <Pressable
              style={styles.profileImageButton}
              onPress={handlePickProfileImageFromCamera}
              disabled={loading}
            >
              <Text style={styles.profileImageButtonText}>{tx("카메라", "Camera")}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.label}>{tx("닉네임", "Nickname")}</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(v) => updateField("name", v)}
          placeholder={tx("닉네임을 입력하세요", "Enter your nickname")}
        />

        <Text style={styles.label}>{tx("이메일", "Email")}</Text>
        <TextInput
          style={styles.input}
          value={form.email}
          onChangeText={(v) => updateField("email", v)}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={tx("이메일을 입력하세요", "Enter your email")}
        />

        <Text style={styles.label}>{tx("전화번호", "Phone")}</Text>
        <TextInput
          style={styles.input}
          value={form.phone}
          onChangeText={(v) => updateField("phone", v)}
          keyboardType="phone-pad"
          placeholder={tx("전화번호를 입력하세요", "Enter your phone number")}
        />

        <Text style={styles.label}>{tx("국가", "Nationality")}</Text>
        <SearchDropdown
          value={nationalityQuery}
          onChangeText={handleNationalityQueryChange}
          placeholder={tx("국가명을 입력하세요", "Type a country")}
          items={nationalities}
          selectedItem={selectedNationality}
          getItemKey={(nationality) => nationality.id}
          getItemLabel={(nationality) => getNationalityDisplayName(nationality, isKorean)}
          getItemSearchText={getNationalitySearchText}
          onSelectItem={(nationality) => {
            setSelectedNationality(nationality);
            setNationalityQuery(getNationalityDisplayName(nationality, isKorean));
          }}
          emptyText={tx("일치하는 국가가 없습니다.", "No matching nationality.")}
        />

        <Text style={styles.label}>{tx("성별", "Gender")}</Text>
        <View style={styles.sexRow}>
          <Pressable
            style={[styles.sexButton, form.sex === "MALE" && styles.sexButtonActive]}
            onPress={() => updateField("sex", "MALE")}
          >
            <Text style={[styles.sexText, form.sex === "MALE" && styles.sexTextActive]}>
              {tx("남자", "Male")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sexButton, form.sex === "FEMALE" && styles.sexButtonActive]}
            onPress={() => updateField("sex", "FEMALE")}
          >
            <Text style={[styles.sexText, form.sex === "FEMALE" && styles.sexTextActive]}>
              {tx("여자", "Female")}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.label}>{tx("소개", "Introduction")}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={form.introduction}
          onChangeText={(v) => updateField("introduction", v)}
          multiline
          placeholder={tx("자기소개를 입력하세요", "Write a short introduction")}
        />
      </View>

      {localMode ? (
        <View style={styles.localCard}>
          <Text style={styles.sectionTitle}>{tx("로컬 설정", "Local Settings")}</Text>
          {Number(localId) > 0 ? (
            <>
              <Text style={styles.label}>{tx("가능 시간", "Available Time")}</Text>
              <TextInput
                style={styles.input}
                value={availableTimeText}
                onChangeText={setAvailableTimeText}
                placeholder={tx("예: 토 · 09:30 ~ 21:40", "e.g. Sat · 09:30 ~ 21:40")}
              />
            </>
          ) : (
            <Text style={styles.helperText}>
              {tx("로컬 설정이 아직 없습니다. 지역을 설정하면 로컬 시간을 입력할 수 있어요.", "Local profile is not set yet. Set your area to enable available-time settings.")}
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.travelerCard}>
          <Text style={styles.sectionTitle}>{tx("여행자 모드", "Traveler Mode")}</Text>
          <Text style={styles.helperText}>
            {tx("여행자 모드에서는 로컬 가능 시간 설정이 숨겨집니다.", "Local available-time settings are hidden in traveler mode.")}
          </Text>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.saveButton, loading && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={loading}
      >
        <Text style={styles.saveButtonText}>
          {loading ? tx("저장 중...", "Saving...") : tx("저장", "Save")}
        </Text>
      </Pressable>

      <Pressable style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>{tx("로그아웃", "Logout")}</Text>
      </Pressable>
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
    gap: 12,
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
  modeBar: {
    backgroundColor: "#27324A",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modeBarTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  modeToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modeToggleLabel: {
    color: "#D6DFEF",
    fontSize: 12,
    fontWeight: "600",
  },
  modeToggleLabelActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  formCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  localCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E4ECFF",
  },
  travelerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#E7E7EA",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#151515",
    marginBottom: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  helperText: {
    color: "#6D7482",
    fontSize: 13,
    lineHeight: 18,
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
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  profileImagePreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "#D5D5D5",
    backgroundColor: "#EEF2F8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
    marginTop: 2,
    backgroundColor: "#0169FE",
    borderRadius: 10,
    alignItems: "center",
    paddingVertical: 12,
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
