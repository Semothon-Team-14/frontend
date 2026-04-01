import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../../auth";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function updateField(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  async function handleSignUp() {
    const requiredKeys = ["username", "password", "name", "email", "phone"];
    const missing = requiredKeys.some((key) => !form[key]?.trim());

    if (missing) {
      setError("username, password, name, email, phone are required.");
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
        sex: form.sex?.trim() ? form.sex.trim() : null,
        introduction: form.introduction?.trim() ? form.introduction.trim() : null,
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
        <Field label="Sex (optional)" value={form.sex} onChangeText={(v) => updateField("sex", v)} placeholder="MALE / FEMALE" />
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
