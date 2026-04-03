import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth";
import { decodeUserIdFromToken } from "../../auth/userId";
import {
  createQuickMatchSocketClient,
  publishCreateQuickMatch,
  subscribeUserQuickMatches,
} from "../../services/quickMatchSocketService";

const INTEREST_ITEMS = [
  { key: "MEAL", label: "#식사" },
  { key: "HOBBY", label: "#취미생활" },
  { key: "TALK", label: "#담소" },
  { key: "REST", label: "#휴식" },
  { key: "ANY", label: "#상관없어요" },
];
const MIN_PROGRESS_VISIBLE_MS = 1200;

function formatElapsed(seconds) {
  const safe =
    Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const remainSeconds = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remainSeconds}`;
}

async function waitForSocketConnected(client, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (client?.connected) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return Boolean(client?.connected);
}

function isAlreadyAcceptedQuickMatchError(event) {
  if (event?.eventType !== "QUICK_MATCH_ERROR" || event?.action !== "QUICK_MATCH_ACCEPT") {
    return false;
  }
  const reason = String(event?.reason || "").toLowerCase();
  return reason.includes("already resolved") && reason.includes("accepted");
}

export function QuickMatch({ navigation, route }) {
  const { token } = useAuth();
  const userId = useMemo(
    () => Number(decodeUserIdFromToken(token) || 0),
    [token],
  );
  const [selectedInterestKeys, setSelectedInterestKeys] = useState(["ANY"]);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState(null);
  const [socketReady, setSocketReady] = useState(false);
  const startedAtRef = useRef(0);
  const elapsedTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const pendingRequestRef = useRef({
    cityId: null,
    quickMatchId: null,
  });
  const clientRef = useRef(null);
  const userSubscriptionRef = useRef(null);
  const cityId = useMemo(
    () => Number(route?.params?.cityId || 1),
    [route?.params?.cityId],
  );
  const selectedInterestsLabel = useMemo(() => {
    return INTEREST_ITEMS.filter((item) =>
      selectedInterestKeys.includes(item.key),
    )
      .map((item) => item.label)
      .join(" ");
  }, [selectedInterestKeys]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const client = createQuickMatchSocketClient({
      accessToken: token,
      onConnect: () => {
        if (!mountedRef.current) {
          return;
        }
        setSocketReady(true);
      },
      onError: (message) => {
        if (!mountedRef.current) {
          return;
        }
        setSocketReady(false);
        setError(message || "소켓 연결 오류");
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;
      client.deactivate();
      clientRef.current = null;
      if (mountedRef.current) {
        setSocketReady(false);
      }
    };
  }, [token, userId]);

  useEffect(() => {
    if (!socketReady || !clientRef.current || !userId) {
      return;
    }

    userSubscriptionRef.current?.unsubscribe();
    userSubscriptionRef.current = subscribeUserQuickMatches(
      clientRef.current,
      userId,
      (event) => {
        if (!mountedRef.current) {
          return;
        }

        const pending = pendingRequestRef.current;
        const match = event?.quickMatch;
        const quickMatchId = Number(match?.id || 0);
        const isPendingQuickMatch =
          (pending.quickMatchId && quickMatchId === pending.quickMatchId) ||
          (Number(match?.cityId) === pending.cityId &&
            Number(match?.requesterUserId) === userId);

        if (event?.eventType === "QUICK_MATCH_CREATED") {
          const isRequester = Number(match?.requesterUserId) === userId;
          if (isRequester && submitting && isPendingQuickMatch) {
            pendingRequestRef.current = {
              ...pending,
              quickMatchId,
            };
          }
        }

        if (
          event?.eventType === "QUICK_MATCH_ACCEPTED" &&
          submitting &&
          isPendingQuickMatch
        ) {
          setSubmitting(false);
          pendingRequestRef.current = {
            cityId: null,
            quickMatchId: null,
          };
          navigation.goBack();
          return;
        }

        if (
          event?.eventType === "QUICK_MATCH_DECLINED" &&
          submitting &&
          isPendingQuickMatch
        ) {
          setSubmitting(false);
          pendingRequestRef.current = {
            cityId: null,
            quickMatchId: null,
          };
          setError("빠른 매칭이 거절되었어요. 다시 시도해 주세요.");
          return;
        }

        if (event?.eventType === "QUICK_MATCH_ERROR" && submitting) {
          if (isAlreadyAcceptedQuickMatchError(event) && isPendingQuickMatch) {
            setSubmitting(false);
            pendingRequestRef.current = {
              cityId: null,
              quickMatchId: null,
            };
            navigation.goBack();
            return;
          }
          setSubmitting(false);
          pendingRequestRef.current = {
            cityId: null,
            quickMatchId: null,
          };
          setError(event?.reason || "빠른 매칭 요청 처리에 실패했습니다.");
        }
      },
    );

    return () => {
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;
    };
  }, [cityId, navigation, socketReady, submitting, userId]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!submitting) {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
      return;
    }

    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
    }

    elapsedTimerRef.current = setInterval(() => {
      if (!mountedRef.current) {
        return;
      }

      const nextElapsed = Math.floor(
        (Date.now() - startedAtRef.current) / 1000,
      );
      setElapsedSeconds(nextElapsed);
    }, 1000);

    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
      }
    };
  }, [submitting]);

  async function handleConfirm() {
    if (selectedInterestKeys.length === 0) {
      setError("Please choose at least one activity.");
      return;
    }
    setError(null);

    if (!Number.isFinite(cityId) || cityId <= 0) {
      setError("유효한 도시 정보가 없어 빠른 매칭을 생성할 수 없습니다.");
      navigation.goBack();
      return;
    }

    setSubmitting(true);
    setError(null);
    pendingRequestRef.current = {
      cityId,
      quickMatchId: null,
    };
    const requestStartedAt = Date.now();
    try {
      const connected = await waitForSocketConnected(clientRef.current, 5000);
      if (!connected) {
        throw new Error(
          "실시간 연결 준비 중입니다. 잠시 후 다시 시도해주세요.",
        );
      }
      await publishCreateQuickMatch(clientRef.current, {
        cityId,
        message: selectedInterestKeys.includes("ANY")
          ? null
          : selectedInterestsLabel,
      });
      const elapsedMs = Date.now() - requestStartedAt;
      if (elapsedMs < MIN_PROGRESS_VISIBLE_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_PROGRESS_VISIBLE_MS - elapsedMs),
        );
      }
      if (!mountedRef.current) {
        return;
      }
    } catch (requestError) {
      if (!mountedRef.current) {
        return;
      }
      const message = requestError?.message || "빠른 매칭 생성에 실패했습니다.";
      setError(message);
      setSubmitting(false);
      pendingRequestRef.current = {
        cityId: null,
        quickMatchId: null,
      };
      console.warn("[QM CREATE] FAILED", {
        cityId,
        message,
      });
    }
  }

  function handleSelectInterest(key) {
    setError(null);
    setSelectedInterestKeys((previous) => {
      if (key === "ANY") {
        return ["ANY"];
      }

      const next = previous.filter((item) => item !== "ANY");
      if (next.includes(key)) {
        const removed = next.filter((item) => item !== key);
        return removed.length === 0 ? ["ANY"] : removed;
      }
      return [...next, key];
    });
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.modal}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>빠른 매칭을 시작할게요!</Text>
          <Pressable onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color="#111" />
          </Pressable>
        </View>

        <>
          <Text style={styles.sectionDescription}>
            여행자와 무엇을 함께 하고 싶나요?
          </Text>
          <View style={styles.interestWrap}>
            {INTEREST_ITEMS.map((item) => {
              const active = selectedInterestKeys.includes(item.key);
              return (
                <Pressable
                  key={item.key}
                  style={[
                    styles.interestChip,
                    active && styles.interestChipActive,
                  ]}
                  onPress={() => handleSelectInterest(item.key)}
                >
                  <Text
                    style={[
                      styles.interestChipText,
                      active && styles.interestChipTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {!socketReady ? (
          <Text style={styles.metaText}>실시간 연결 중...</Text>
        ) : null}

        <Pressable
          style={[
            styles.confirmBtn,
            (submitting || !socketReady) && styles.confirmBtnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={submitting || !socketReady}
        >
          <Text style={styles.confirmText}>
            {submitting ? "확인 중..." : "확인"}
          </Text>
        </Pressable>
      </View>

      {submitting ? (
        <View style={styles.progressOverlay}>
          <View style={styles.progressCard}>
            <Pressable
              style={styles.progressCloseButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close" size={18} color="#334155" />
            </Pressable>
            <Text style={styles.progressTitle}>빠른 매칭 요청 중</Text>
            <Text style={styles.progressTarget}>
              현재 지역 전체에게 요청 중
            </Text>
            {selectedInterestsLabel ? (
              <Text style={styles.progressInterest}>
                {selectedInterestsLabel}
              </Text>
            ) : null}
            <Text style={styles.progressDescription}>
              요청이 완료될 때까지 잠시만 기다려 주세요.
            </Text>
            <Text style={styles.progressElapsedLabel}>경과 시간</Text>
            <Text style={styles.progressElapsedValue}>
              {formatElapsed(elapsedSeconds)}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.16)",
  },
  modal: {
    width: "90%",
    borderRadius: 16,
    backgroundColor: "#fff",
    padding: 14,
    paddingBottom: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    flex: 1,
    marginRight: 5,
  },
  sectionDescription: {
    color: "#374151",
    fontSize: 14,
    fontWeight: "600",
  },
  interestWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  interestChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#0169FE",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  interestChipActive: {
    borderColor: "#0169FE",
    backgroundColor: "#0169FE",
  },
  interestChipText: {
    color: "#45536F",
    fontSize: 13,
    fontWeight: "700",
  },
  interestChipTextActive: {
    color: "#F4F7FD",
  },
  confirmBtn: {
    marginTop: 6,
    borderRadius: 24,
    backgroundColor: "#1C73F0",
    height: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmText: {
    color: "#fff",
    fontSize: 34 / 2,
    fontWeight: "700",
  },
  errorText: {
    color: "#C62828",
    fontSize: 12,
    lineHeight: 16,
  },
  metaText: {
    color: "#64748B",
    fontSize: 12,
  },
  progressOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  progressCard: {
    width: "82%",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  progressCloseButton: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  progressTitle: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "700",
    color: "#0F172A",
  },
  progressTarget: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  progressInterest: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#2B4B84",
  },
  progressDescription: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 17,
    color: "#475569",
    textAlign: "center",
  },
  progressElapsedLabel: {
    marginTop: 14,
    fontSize: 11,
    color: "#64748B",
    fontWeight: "600",
  },
  progressElapsedValue: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 1,
  },
});
