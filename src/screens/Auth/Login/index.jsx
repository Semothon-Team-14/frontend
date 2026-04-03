import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../../../auth";

export function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleLogin() {
    if (!username || !password) {
      setError("username and password are required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (requestError) {
      setError(requestError?.message ?? "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>로그인</Text>
      {/* <Text style={styles.subtitle}>Figma 인증 화면 추가 전 임시 인증 UI입니다.</Text> */}

      <View style={styles.form}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="username"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="password"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={styles.primaryBtn}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.primaryBtnText}>
            {loading ? "로그인 중..." : "로그인"}
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate("SignUp")}
        >
          <Text style={styles.secondaryBtnText}>회원가입으로 이동</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F6F8",
    paddingHorizontal: 20,
    paddingTop: 90,
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
    marginTop: 12,
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
