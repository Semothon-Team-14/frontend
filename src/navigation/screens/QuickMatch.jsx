import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import GoBack from '../../icons/goback.svg';
import { setAccessToken } from "../../api/authTokenStore";
import {
    acceptQuickMatch,
    createQuickMatch,
    declineQuickMatch,
    fetchQuickMatches,
} from "../../services/quickMatchService";

export function QuickMatch() {
    const navigation = useNavigation();
    const [cityIdText, setCityIdText] = useState('1');
    const [message, setMessage] = useState('');
    const [targetType, setTargetType] = useState('ANY');
    const [devToken, setDevToken] = useState('');
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const cityId = useMemo(() => Number(cityIdText), [cityIdText]);

    async function loadMatches() {
        if (!Number.isFinite(cityId) || cityId <= 0) {
            setMatches([]);
            setLoading(false);
            setError('cityId must be a positive number.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await fetchQuickMatches({
                cityId,
                targetType,
            });
            setMatches(response?.quickMatches ?? []);
        } catch (requestError) {
            setError(requestError?.message ?? 'Failed to load quick matches.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadMatches();
    }, [cityId, targetType]);

    async function handleCreateMatch() {
        if (!Number.isFinite(cityId) || cityId <= 0) {
            setError('cityId must be a positive number.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await createQuickMatch({
                cityId,
                message: message.trim() || undefined,
                targetType,
            });
            setMessage('');
            await loadMatches();
        } catch (requestError) {
            setError(requestError?.message ?? 'Failed to create quick match.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleAccept(quickMatchId) {
        setSubmitting(true);
        setError(null);
        try {
            await acceptQuickMatch(quickMatchId);
            await loadMatches();
        } catch (requestError) {
            setError(requestError?.message ?? 'Failed to accept quick match.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDecline(quickMatchId) {
        setSubmitting(true);
        setError(null);
        try {
            await declineQuickMatch(quickMatchId);
            await loadMatches();
        } catch (requestError) {
            setError(requestError?.message ?? 'Failed to decline quick match.');
        } finally {
            setSubmitting(false);
        }
    }

    function applyDevToken() {
        setAccessToken(devToken.trim() || null);
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableWithoutFeedback onPress={() => navigation.goBack()}>
                    <GoBack style={{ position: 'absolute', left: 30 }} />
                </TouchableWithoutFeedback>
                <Text style={styles.headerText}>빠른 매칭</Text>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>주변의 여행자를 찾는 중...</Text>
                <Text style={styles.subtitle}>도시/타입 기준으로 빠른 매칭을 조회하고 생성할 수 있어요.</Text>

                <View style={styles.panel}>
                    <Text style={styles.label}>Dev Token (optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={devToken}
                        onChangeText={setDevToken}
                        autoCapitalize="none"
                        placeholder="accessToken 값 입력 (예: master)"
                    />
                    <Pressable style={styles.secondaryBtn} onPress={applyDevToken}>
                        <Text style={styles.secondaryBtnText}>토큰 적용</Text>
                    </Pressable>
                </View>

                <View style={styles.panel}>
                    <Text style={styles.label}>City ID</Text>
                    <TextInput
                        style={styles.input}
                        value={cityIdText}
                        onChangeText={setCityIdText}
                        keyboardType="numeric"
                        placeholder="1"
                    />

                    <Text style={styles.label}>Target Type</Text>
                    <View style={styles.segmentRow}>
                        {['ANY', 'MINGLERS', 'LOCALS'].map((value) => {
                            const selected = targetType === value;
                            return (
                                <Pressable
                                    key={value}
                                    style={[styles.segmentBtn, selected && styles.segmentBtnActive]}
                                    onPress={() => setTargetType(value)}
                                >
                                    <Text style={[styles.segmentBtnText, selected && styles.segmentBtnTextActive]}>{value}</Text>
                                </Pressable>
                            );
                        })}
                    </View>

                    <Text style={styles.label}>Message (optional)</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        placeholder="같이 저녁 먹으실 분?"
                    />

                    <View style={styles.row}>
                        <Pressable style={styles.primaryBtn} onPress={loadMatches} disabled={submitting}>
                            <Text style={styles.primaryBtnText}>목록 새로고침</Text>
                        </Pressable>
                        <Pressable style={styles.primaryBtn} onPress={handleCreateMatch} disabled={submitting}>
                            <Text style={styles.primaryBtnText}>매칭 생성</Text>
                        </Pressable>
                    </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                {loading ? (
                    <Text style={styles.hint}>로딩 중...</Text>
                ) : matches.length === 0 ? (
                    <Text style={styles.hint}>조건에 맞는 매칭이 없습니다.</Text>
                ) : (
                    <View style={styles.list}>
                        {matches.map((match) => (
                            <View key={match.id} style={styles.card}>
                                <Text style={styles.cardTitle}>#{match.id} · {match.status}</Text>
                                <Text style={styles.cardText}>cityId: {match.cityId}</Text>
                                <Text style={styles.cardText}>targetType: {match.targetType}</Text>
                                <Text style={styles.cardText}>message: {match.message || '-'}</Text>
                                <Text style={styles.cardText}>requesterUserId: {match.requesterUserId}</Text>
                                <View style={styles.row}>
                                    <Pressable
                                        style={styles.actionBtn}
                                        onPress={() => handleAccept(match.id)}
                                        disabled={submitting}
                                    >
                                        <Text style={styles.actionBtnText}>수락</Text>
                                    </Pressable>
                                    <Pressable
                                        style={[styles.actionBtn, styles.declineBtn]}
                                        onPress={() => handleDecline(match.id)}
                                        disabled={submitting}
                                    >
                                        <Text style={styles.actionBtnText}>거절</Text>
                                    </Pressable>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F6F8',
    },
    header: {
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 60,
        flexDirection: 'row',
        width: '100%',
        marginBottom: 12,
    },
    headerText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 36,
        gap: 10,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
    },
    panel: {
        backgroundColor: '#FFFFFF',
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
    textArea: {
        minHeight: 68,
        textAlignVertical: 'top',
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
    },
    segmentBtnActive: {
        borderColor: '#0169FE',
        backgroundColor: '#EAF2FF',
    },
    segmentBtnText: {
        fontSize: 13,
        color: '#666',
    },
    segmentBtnTextActive: {
        color: '#0169FE',
        fontWeight: '700',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
    },
    primaryBtn: {
        flex: 1,
        backgroundColor: '#0169FE',
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: 'center',
    },
    primaryBtnText: {
        color: '#FFF',
        fontWeight: '700',
    },
    secondaryBtn: {
        borderWidth: 1,
        borderColor: '#0169FE',
        borderRadius: 10,
        paddingVertical: 8,
        alignItems: 'center',
    },
    secondaryBtnText: {
        color: '#0169FE',
        fontWeight: '700',
    },
    error: {
        color: '#C62828',
        fontSize: 13,
    },
    hint: {
        color: '#666',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 6,
    },
    list: {
        gap: 10,
    },
    card: {
        backgroundColor: '#FFF',
        borderRadius: 14,
        padding: 14,
        gap: 5,
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    cardText: {
        fontSize: 13,
        color: '#666',
    },
    actionBtn: {
        flex: 1,
        backgroundColor: '#0169FE',
        borderRadius: 8,
        paddingVertical: 8,
        alignItems: 'center',
    },
    declineBtn: {
        backgroundColor: '#8E8E8E',
    },
    actionBtnText: {
        color: '#FFF',
        fontWeight: '700',
    },
})
