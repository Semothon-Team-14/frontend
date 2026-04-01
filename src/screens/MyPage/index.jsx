import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Info from "../../icons/info.svg";
import TravelIcon from "../../icons/travelIcon.svg";
import DirectionBlack from "../../icons/direction_black.svg";
import { setAccessToken } from "../../api/authTokenStore";
import { useAuth } from "../../auth";
import { fetchTrips, fetchUser } from "../../services";

function formatDateRange(startDate, endDate) {
    if (!startDate || !endDate) {
        return "-";
    }

    return `${startDate} ~ ${endDate}`;
}

export function MyPage() {
    const { logout } = useAuth();
    const [devToken, setDevToken] = useState("");
    const [userIdText, setUserIdText] = useState("1");
    const [user, setUser] = useState(null);
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const userId = useMemo(() => Number(userIdText), [userIdText]);

    async function loadMyPageData() {
        if (!Number.isFinite(userId) || userId <= 0) {
            setLoading(false);
            setError("userId must be a positive number.");
            setUser(null);
            setTrips([]);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const [userResponse, tripsResponse] = await Promise.all([
                fetchUser(userId),
                fetchTrips(),
            ]);

            const loadedUser = userResponse?.user ?? null;
            const allTrips = tripsResponse?.trips ?? [];
            const myTrips = allTrips.filter((trip) => trip?.userId === userId);

            setUser(loadedUser);
            setTrips(myTrips);
        } catch (requestError) {
            setError(requestError?.message ?? "마이페이지 정보를 불러오지 못했습니다.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMyPageData();
    }, [userId]);

    function applyDevToken() {
        setAccessToken(devToken.trim() || null);
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View style={styles.userInfo}>
                <View style={styles.infoIconRow}>
                    <Info />
                </View>
                <View style={styles.controlBox}>
                    <Text style={styles.controlLabel}>Dev Token (optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={devToken}
                        onChangeText={setDevToken}
                        autoCapitalize="none"
                        placeholder="accessToken 값 입력 (예: master)"
                    />
                    <Text style={styles.controlLabel}>User ID</Text>
                    <TextInput
                        style={styles.input}
                        value={userIdText}
                        onChangeText={setUserIdText}
                        keyboardType="numeric"
                        placeholder="1"
                    />
                    <View style={styles.buttonRow}>
                        <Pressable style={styles.controlBtn} onPress={applyDevToken}>
                            <Text style={styles.controlBtnText}>토큰 적용</Text>
                        </Pressable>
                        <Pressable style={styles.controlBtn} onPress={loadMyPageData}>
                            <Text style={styles.controlBtnText}>새로고침</Text>
                        </Pressable>
                    </View>
                    <Pressable style={styles.logoutBtn} onPress={logout}>
                        <Text style={styles.logoutBtnText}>로그아웃</Text>
                    </Pressable>
                </View>

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                <View>
                    <Text style={styles.userCode}>USER #{user?.id ?? "-"}</Text>
                    <Text style={styles.userName}>{user?.name || "이름 없음"}</Text>
                    <View style={styles.categories}>
                        {(user?.keywords ?? []).slice(0, 3).map((keyword) => (
                            <View key={keyword.id} style={styles.category}>
                                <Text style={styles.categoryText}>#{keyword.name}</Text>
                            </View>
                        ))}
                        {(user?.keywords ?? []).length === 0 ? (
                            <View style={styles.category}>
                                <Text style={styles.categoryText}>#키워드없음</Text>
                            </View>
                        ) : null}
                    </View>
                </View>
            </View>

            <View style={styles.travelLogArea}>
                <Text style={styles.travelTitleMain}>여행 기록</Text>
                <Text style={styles.travelSubTitle}>총 {trips.length}개의 여행이 조회되었습니다.</Text>

                {loading ? (
                    <Text style={styles.infoText}>로딩 중...</Text>
                ) : trips.length === 0 ? (
                    <Text style={styles.infoText}>여행 기록이 없습니다.</Text>
                ) : (
                    <View style={styles.travelLog}>
                        {trips.map((trip) => (
                            <View key={trip.id} style={styles.travel}>
                                <View style={styles.travelHeader}>
                                    <TravelIcon />
                                    <DirectionBlack />
                                </View>
                                <View>
                                    <Text style={styles.travelTitle}>{trip.title || "제목 없음"}</Text>
                                    <Text style={styles.travelDays}>{formatDateRange(trip.startDate, trip.endDate)}</Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#0169FE",
    },
    contentContainer: {
        minHeight: "100%",
    },
    userInfo: {
        padding: 20,
        minHeight: 420,
        justifyContent: "space-between",
        gap: 10,
    },
    infoIconRow: {
        flexDirection: "row",
        justifyContent: "flex-end",
        marginTop: 60,
    },
    controlBox: {
        backgroundColor: "rgba(255,255,255,0.18)",
        borderRadius: 12,
        padding: 10,
        gap: 7,
    },
    controlLabel: {
        fontSize: 12,
        color: "#E6ECF8",
        fontWeight: "700",
    },
    input: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.5)",
        borderRadius: 9,
        backgroundColor: "rgba(255,255,255,0.15)",
        color: "#FFF",
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    buttonRow: {
        flexDirection: "row",
        gap: 8,
    },
    controlBtn: {
        flex: 1,
        backgroundColor: "#FFF",
        borderRadius: 9,
        paddingVertical: 8,
        alignItems: "center",
    },
    controlBtnText: {
        color: "#0169FE",
        fontWeight: "700",
    },
    logoutBtn: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.7)",
        borderRadius: 9,
        paddingVertical: 8,
        alignItems: "center",
    },
    logoutBtnText: {
        color: "#FFF",
        fontWeight: "700",
    },
    errorText: {
        color: "#FFD5D5",
        fontSize: 12,
    },
    userCode: {
        fontSize: 14,
        color: "#D9D9D9",
    },
    userName: {
        fontSize: 24,
        fontWeight: "bold",
        color: "#fff",
    },
    categories: {
        marginTop: 10,
        flexDirection: "row",
        gap: 10,
        flexWrap: "wrap",
    },
    category: {
        backgroundColor: "#fff",
        paddingHorizontal: 10,
        height: 26,
        borderRadius: 13,
        justifyContent: "center",
    },
    categoryText: {
        color: "#0169FE",
        fontSize: 12,
    },
    travelLogArea: {
        backgroundColor: "#F5F6F8",
        minHeight: 445,
        borderTopEndRadius: 20,
        borderTopStartRadius: 20,
        padding: 30,
    },
    travelTitleMain: {
        fontWeight: "bold",
        fontSize: 20,
        marginBottom: 10,
    },
    travelSubTitle: {
        fontSize: 14,
        color: "#818181",
    },
    infoText: {
        marginTop: 16,
        color: "#666",
        fontSize: 14,
    },
    travelLog: {
        gap: 20,
        marginTop: 20,
    },
    travel: {
        backgroundColor: "#fff",
        minHeight: 128,
        padding: 20,
        borderRadius: 17,
        justifyContent: "space-between",
        gap: 12,
    },
    travelHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
    },
    travelTitle: {
        fontWeight: "bold",
        fontSize: 20,
    },
    travelDays: {
        fontSize: 14,
        color: "#818181",
    },
});
