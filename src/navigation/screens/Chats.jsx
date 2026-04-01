import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { setAccessToken } from "../../api/authTokenStore";
import { fetchChatMessages, fetchChatRooms, initializeDirectChatRoom } from "../../services";

export function Chats() {
    const [devToken, setDevToken] = useState("");
    const [participantUserIdText, setParticipantUserIdText] = useState("2");
    const [chatRooms, setChatRooms] = useState([]);
    const [selectedRoomId, setSelectedRoomId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingRooms, setLoadingRooms] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const participantUserId = useMemo(() => Number(participantUserIdText), [participantUserIdText]);

    async function loadRooms() {
        setLoadingRooms(true);
        setError(null);
        try {
            const response = await fetchChatRooms();
            const rooms = response?.chatRooms ?? [];
            setChatRooms(rooms);
            if (rooms.length > 0 && !selectedRoomId) {
                setSelectedRoomId(rooms[0].id);
            }
        } catch (requestError) {
            setError(requestError?.message ?? "채팅방 목록을 불러오지 못했습니다.");
        } finally {
            setLoadingRooms(false);
        }
    }

    useEffect(() => {
        loadRooms();
    }, []);

    async function loadMessages(roomId) {
        if (!roomId) {
            setMessages([]);
            return;
        }

        setLoadingMessages(true);
        setError(null);
        try {
            const response = await fetchChatMessages(roomId);
            setMessages(response?.messages ?? []);
        } catch (requestError) {
            setError(requestError?.message ?? "메시지를 불러오지 못했습니다.");
        } finally {
            setLoadingMessages(false);
        }
    }

    useEffect(() => {
        loadMessages(selectedRoomId);
    }, [selectedRoomId]);

    function applyDevToken() {
        setAccessToken(devToken.trim() || null);
    }

    async function handleCreateDirectRoom() {
        if (!Number.isFinite(participantUserId) || participantUserId <= 0) {
            setError("participantUserId must be a positive number.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const response = await initializeDirectChatRoom(participantUserId);
            const newRoom = response?.chatRoom;
            await loadRooms();
            if (newRoom?.id) {
                setSelectedRoomId(newRoom.id);
            }
        } catch (requestError) {
            setError(requestError?.message ?? "1:1 채팅방 생성에 실패했습니다.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>채팅</Text>
            <Text style={styles.subheader}>내 채팅방과 메시지 내역을 확인할 수 있어요.</Text>

            <View style={styles.controlBox}>
                <Text style={styles.label}>Dev Token (optional)</Text>
                <TextInput
                    style={styles.input}
                    value={devToken}
                    onChangeText={setDevToken}
                    autoCapitalize="none"
                    placeholder="accessToken 값 입력 (예: master)"
                />
                <Text style={styles.label}>1:1 상대 userId</Text>
                <TextInput
                    style={styles.input}
                    value={participantUserIdText}
                    onChangeText={setParticipantUserIdText}
                    keyboardType="numeric"
                    placeholder="2"
                />
                <View style={styles.row}>
                    <Pressable style={styles.secondaryBtn} onPress={applyDevToken}>
                        <Text style={styles.secondaryBtnText}>토큰 적용</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryBtn} onPress={loadRooms}>
                        <Text style={styles.secondaryBtnText}>방 새로고침</Text>
                    </Pressable>
                </View>
                <Pressable style={styles.primaryBtn} onPress={handleCreateDirectRoom} disabled={submitting}>
                    <Text style={styles.primaryBtnText}>1:1 채팅방 생성</Text>
                </Pressable>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.sectionTitle}>채팅방</Text>
            {loadingRooms ? (
                <Text style={styles.info}>로딩 중...</Text>
            ) : chatRooms.length === 0 ? (
                <Text style={styles.info}>채팅방이 없습니다.</Text>
            ) : (
                <View style={styles.list}>
                    {chatRooms.map((room) => {
                        const selected = room.id === selectedRoomId;
                        return (
                            <Pressable
                                key={room.id}
                                style={[styles.roomCard, selected && styles.roomCardSelected]}
                                onPress={() => setSelectedRoomId(room.id)}
                            >
                                <Text style={styles.roomTitle}>{room.name || `ROOM #${room.id}`}</Text>
                                <Text style={styles.roomMeta}>participants: {(room.participantUserIds ?? []).join(", ")}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            )}

            <Text style={styles.sectionTitle}>메시지</Text>
            {loadingMessages ? (
                <Text style={styles.info}>로딩 중...</Text>
            ) : messages.length === 0 ? (
                <Text style={styles.info}>메시지가 없습니다.</Text>
            ) : (
                <View style={styles.list}>
                    {messages.map((message) => (
                        <View key={message.id} style={styles.messageCard}>
                            <Text style={styles.messageSender}>user #{message.senderUserId}</Text>
                            <Text style={styles.messageContent}>{message.content}</Text>
                            <Text style={styles.messageMeta}>{message.createdDateTime}</Text>
                        </View>
                    ))}
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: "#F5F6F8",
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
    controlBox: {
        backgroundColor: "#FFF",
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
    row: {
        flexDirection: "row",
        gap: 8,
    },
    primaryBtn: {
        backgroundColor: "#0169FE",
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: "center",
    },
    primaryBtnText: {
        color: "#FFF",
        fontWeight: "700",
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
    sectionTitle: {
        marginTop: 8,
        fontSize: 18,
        fontWeight: "700",
        color: "#111",
    },
    info: {
        color: "#666",
        fontSize: 14,
    },
    list: {
        gap: 8,
    },
    roomCard: {
        backgroundColor: "#FFF",
        borderRadius: 12,
        padding: 12,
        gap: 4,
    },
    roomCardSelected: {
        borderWidth: 1,
        borderColor: "#0169FE",
    },
    roomTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111",
    },
    roomMeta: {
        fontSize: 12,
        color: "#666",
    },
    messageCard: {
        backgroundColor: "#FFF",
        borderRadius: 12,
        padding: 12,
        gap: 5,
    },
    messageSender: {
        fontSize: 12,
        fontWeight: "700",
        color: "#0169FE",
    },
    messageContent: {
        fontSize: 14,
        color: "#111",
    },
    messageMeta: {
        fontSize: 11,
        color: "#666",
    },
});
