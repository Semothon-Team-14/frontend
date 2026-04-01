import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { setAccessToken } from "../../api/authTokenStore";
import {
    deleteSavedCafe,
    deleteSavedRestaurant,
    fetchSavedCafes,
    fetchSavedRestaurants,
} from "../../services/savedPlaceService";

export function BookMark() {
    const [devToken, setDevToken] = useState('');
    const [activeTab, setActiveTab] = useState('restaurant');
    const [savedRestaurants, setSavedRestaurants] = useState([]);
    const [savedCafes, setSavedCafes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const activeItems = useMemo(() => {
        if (activeTab === 'restaurant') {
            return savedRestaurants;
        }

        return savedCafes;
    }, [activeTab, savedRestaurants, savedCafes]);

    async function loadSavedPlaces() {
        setLoading(true);
        setError(null);
        try {
            const [restaurantResponse, cafeResponse] = await Promise.all([
                fetchSavedRestaurants(),
                fetchSavedCafes(),
            ]);

            setSavedRestaurants(restaurantResponse?.savedRestaurants ?? []);
            setSavedCafes(cafeResponse?.savedCafes ?? []);
        } catch (requestError) {
            setError(requestError?.message ?? 'Failed to load saved places.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadSavedPlaces();
    }, []);

    async function handleDelete(itemId) {
        setSubmitting(true);
        setError(null);
        try {
            if (activeTab === 'restaurant') {
                await deleteSavedRestaurant(itemId);
            } else {
                await deleteSavedCafe(itemId);
            }
            await loadSavedPlaces();
        } catch (requestError) {
            setError(requestError?.message ?? 'Failed to delete saved place.');
        } finally {
            setSubmitting(false);
        }
    }

    function applyDevToken() {
        setAccessToken(devToken.trim() || null);
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>저장한 장소</Text>
            <Text style={styles.subheader}>음식점/카페 저장 목록을 관리할 수 있어요.</Text>

            <View style={styles.panel}>
                <Text style={styles.label}>Dev Token (optional)</Text>
                <TextInput
                    style={styles.input}
                    value={devToken}
                    onChangeText={setDevToken}
                    autoCapitalize="none"
                    placeholder="accessToken 값 입력 (예: master)"
                />
                <View style={styles.row}>
                    <Pressable style={styles.secondaryBtn} onPress={applyDevToken}>
                        <Text style={styles.secondaryBtnText}>토큰 적용</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryBtn} onPress={loadSavedPlaces} disabled={submitting}>
                        <Text style={styles.secondaryBtnText}>새로고침</Text>
                    </Pressable>
                </View>
            </View>

            <View style={styles.segmentRow}>
                <Pressable
                    style={[styles.segmentBtn, activeTab === 'restaurant' && styles.segmentBtnActive]}
                    onPress={() => setActiveTab('restaurant')}
                >
                    <Text style={[styles.segmentText, activeTab === 'restaurant' && styles.segmentTextActive]}>음식점</Text>
                </Pressable>
                <Pressable
                    style={[styles.segmentBtn, activeTab === 'cafe' && styles.segmentBtnActive]}
                    onPress={() => setActiveTab('cafe')}
                >
                    <Text style={[styles.segmentText, activeTab === 'cafe' && styles.segmentTextActive]}>카페</Text>
                </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {loading ? (
                <Text style={styles.hint}>로딩 중...</Text>
            ) : activeItems.length === 0 ? (
                <Text style={styles.hint}>저장된 항목이 없습니다.</Text>
            ) : (
                <View style={styles.list}>
                    {activeItems.map((item) => {
                        const place = activeTab === 'restaurant' ? item.restaurant : item.cafe;
                        return (
                            <View key={item.id} style={styles.card}>
                                <Text style={styles.placeName}>{place?.name || '-'}</Text>
                                <Text style={styles.placeType}>{activeTab === 'restaurant' ? 'restaurant' : 'cafe'}</Text>
                                <Text style={styles.placeMeta}>address: {place?.address || '-'}</Text>
                                <Text style={styles.placeMeta}>category: {place?.foodCategory || '-'}</Text>
                                <Pressable
                                    style={styles.deleteBtn}
                                    onPress={() => handleDelete(item.id)}
                                    disabled={submitting}
                                >
                                    <Text style={styles.deleteBtnText}>저장 해제</Text>
                                </Pressable>
                            </View>
                        )
                    })}
                </View>
            )}
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        paddingTop: 64,
        paddingBottom: 32,
        backgroundColor: '#F5F6F8',
        minHeight: '100%',
        gap: 10,
    },
    header: {
        fontSize: 26,
        fontWeight: '700',
        color: '#111',
    },
    subheader: {
        fontSize: 14,
        color: '#666',
    },
    panel: {
        backgroundColor: '#FFF',
        borderRadius: 14,
        padding: 14,
        gap: 8,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    input: {
        borderWidth: 1,
        borderColor: '#D5D5D5',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        backgroundColor: '#FFF',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
    },
    secondaryBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#0169FE',
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: 'center',
    },
    secondaryBtnText: {
        color: '#0169FE',
        fontWeight: '700',
    },
    segmentRow: {
        flexDirection: 'row',
        gap: 8,
    },
    segmentBtn: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#D5D5D5',
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: 'center',
        backgroundColor: '#FFF',
    },
    segmentBtnActive: {
        borderColor: '#0169FE',
        backgroundColor: '#EAF2FF',
    },
    segmentText: {
        color: '#666',
        fontWeight: '600',
    },
    segmentTextActive: {
        color: '#0169FE',
    },
    error: {
        color: '#C62828',
        fontSize: 13,
    },
    hint: {
        color: '#666',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 10,
    },
    list: {
        gap: 10,
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 14,
        padding: 14,
        gap: 6,
    },
    placeName: {
        fontSize: 18,
        fontWeight: '700',
    },
    placeType: {
        fontSize: 13,
        color: '#0169FE',
        fontWeight: '600',
    },
    placeMeta: {
        fontSize: 13,
        color: '#666',
    },
    deleteBtn: {
        marginTop: 6,
        backgroundColor: '#111',
        borderRadius: 10,
        paddingVertical: 9,
        alignItems: 'center',
    },
    deleteBtnText: {
        color: '#FFF',
        fontWeight: '700',
    },
})
