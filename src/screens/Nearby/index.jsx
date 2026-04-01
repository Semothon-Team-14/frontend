import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRoute } from "@react-navigation/native";
import { setAccessToken } from "../../api/authTokenStore";
import { fetchMingles, joinMingle, leaveMingle } from "../../services";

export function Nearby() {
    const route = useRoute();
    const [cityIdText, setCityIdText] = useState(route?.params?.cityId ? String(route.params.cityId) : "1");
    const [devToken, setDevToken] = useState("");
    const [mingles, setMingles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submittingId, setSubmittingId] = useState(null);
    const [joinedMingleIds, setJoinedMingleIds] = useState([]);
    const [error, setError] = useState(null);

    const cityId = useMemo(() => Number(cityIdText), [cityIdText]);

    async function loadMingles() {
        if (!Number.isFinite(cityId) || cityId <= 0) {
            setLoading(false);
            setMingles([]);
            setError("cityId must be a positive number.");
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetchMingles({ cityId });
            setMingles(response?.mingles ?? []);
        } catch (requestError) {
            setError(requestError?.message ?? "밍글 목록을 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMingles();
    }, [cityId]);

    async function handleJoin(mingleId) {
        setSubmittingId(mingleId);
        setError(null);
        try {
            await joinMingle(mingleId);
            setJoinedMingleIds((previous) => Array.from(new Set([...previous, mingleId])));
        } catch (requestError) {
            setError(requestError?.message ?? "밍글 참여에 실패했습니다.");
        } finally {
            setSubmittingId(null);
        }
    }

    async function handleLeave(mingleId) {
        setSubmittingId(mingleId);
        setError(null);
        try {
            await leaveMingle(mingleId);
            setJoinedMingleIds((previous) => previous.filter((id) => id !== mingleId));
        } catch (requestError) {
            setError(requestError?.message ?? "밍글 나가기에 실패했습니다.");
        } finally {
            setSubmittingId(null);
        }
    }

    function applyDevToken() {
        setAccessToken(devToken.trim() || null);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>여행자 밍글러</Text>
            <Text style={styles.subheader}>도시 기준 밍글 모집글을 확인하고 참여할 수 있어요.</Text>

            <View style={styles.controlsBox}>
                <Text style={styles.label}>Dev Token (optional)</Text>
                <TextInput
                    style={styles.input}
                    value={devToken}
                    onChangeText={setDevToken}
                    autoCapitalize="none"
                    placeholder="accessToken 값 입력 (예: master)"
                />
                <Text style={styles.label}>City ID</Text>
                <TextInput
                    style={styles.input}
                    value={cityIdText}
                    onChangeText={setCityIdText}
                    keyboardType="numeric"
                    placeholder="1"
                />
                <View style={styles.actionRow}>
                    <Pressable style={styles.secondaryBtn} onPress={applyDevToken}>
                        <Text style={styles.secondaryBtnText}>토큰 적용</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryBtn} onPress={loadMingles}>
                        <Text style={styles.secondaryBtnText}>새로고침</Text>
                    </Pressable>
                </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading ? (
                <Text style={styles.info}>로딩 중...</Text>
            ) : mingles.length === 0 ? (
                <Text style={styles.info}>현재 도시에 밍글이 없습니다.</Text>
            ) : (
                <View style={styles.list}>
                    {mingles.map((mingle) => {
                        const joined = joinedMingleIds.includes(mingle.id);
                        return (
                            <View key={mingle.id} style={styles.card}>
                                <Text style={styles.cardTitle}>{mingle.title}</Text>
                                <Text style={styles.cardDescription}>{mingle.description || "설명 없음"}</Text>
                                <Text style={styles.cardMeta}>city: {mingle?.city?.name || "-"}</Text>
                                <View style={styles.actionRow}>
                                    {!joined ? (
                                        <Pressable
                                            style={styles.primaryBtn}
                                            onPress={() => handleJoin(mingle.id)}
                                            disabled={submittingId === mingle.id}
                                        >
                                            <Text style={styles.primaryBtnText}>참여하기</Text>
                                        </Pressable>
                                    ) : (
                                        <Pressable
                                            style={[styles.primaryBtn, styles.leaveBtn]}
                                            onPress={() => handleLeave(mingle.id)}
                                            disabled={submittingId === mingle.id}
                                        >
                                            <Text style={styles.primaryBtnText}>나가기</Text>
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#fff",
        minHeight: "100%",
        paddingTop: 64,
        paddingHorizontal: 20,
        paddingBottom: 32,
        gap: 10,
    },
    header: {
        fontSize: 26,
        fontWeight: "700",
        color: "#111",
    },
    subheader: {
        fontSize: 14,
        color: "#666",
    },
    controlsBox: {
        backgroundColor: "#F5F6F8",
        borderRadius: 14,
        padding: 12,
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
        paddingVertical: 9,
    },
    actionRow: {
        flexDirection: "row",
        gap: 8,
    },
    secondaryBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: "#0169FE",
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: "center",
    },
    secondaryBtnText: {
        color: "#0169FE",
        fontWeight: "700",
    },
    error: {
        color: "#C62828",
        fontSize: 13,
    },
    info: {
        fontSize: 14,
        color: "#666",
        textAlign: "center",
        marginTop: 10,
    },
    list: {
        gap: 10,
    },
    card: {
        backgroundColor: "#F5F6F8",
        borderRadius: 14,
        padding: 14,
        gap: 6,
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#111",
    },
    cardDescription: {
        fontSize: 14,
        color: "#333",
    },
    cardMeta: {
        fontSize: 12,
        color: "#666",
    },
    primaryBtn: {
        flex: 1,
        borderRadius: 10,
        backgroundColor: "#0169FE",
        paddingVertical: 10,
        alignItems: "center",
    },
    leaveBtn: {
        backgroundColor: "#555",
    },
    primaryBtnText: {
        color: "#FFF",
        fontWeight: "700",
    },
});
