import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth";
import { decodeUserIdFromToken } from "../auth/userId";
import { acceptQuickMatch, declineQuickMatch, fetchLocals, fetchQuickMatch, fetchTrips } from "../services";
import { navigationRef } from "../navigation/navigationRef";
import { joinMingleChatRoom } from "../services/chatService";
import {
  createQuickMatchSocketClient,
  publishAcceptQuickMatch,
  publishDeclineQuickMatch,
  subscribeCityQuickMatches,
  subscribeUserQuickMatches,
} from "../services/quickMatchSocketService";
import { pickCurrentTrip } from "../utils/trip";

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getEventMessage(eventType) {
  if (eventType === "QUICK_MATCH_CREATED") {
    return "현재 여행 지역에서 빠른 매칭 요청이 도착했어요.";
  }

  if (eventType === "QUICK_MATCH_ACCEPTED") {
    return "빠른 매칭이 수락되었습니다.";
  }

  if (eventType === "QUICK_MATCH_DECLINED") {
    return "빠른 매칭이 거절되었습니다.";
  }

  return "빠른 매칭 알림이 도착했습니다.";
}

function isAlreadyAcceptedError(event) {
  if (event?.eventType !== "QUICK_MATCH_ERROR" || event?.action !== "QUICK_MATCH_ACCEPT") {
    return false;
  }
  const reason = String(event?.reason || "").toLowerCase();
  return reason.includes("already resolved") && reason.includes("accepted");
}

function isWebSocketReceiptTimeout(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("receipt timeout");
}

function unsubscribeAllCitySubscriptions(containerRef) {
  const container = containerRef?.current;
  if (!container) {
    containerRef.current = new Map();
    return;
  }

  if (typeof container.forEach === "function") {
    container.forEach((subscription) => subscription?.unsubscribe?.());
  } else if (Array.isArray(container)) {
    container.forEach((subscription) => subscription?.unsubscribe?.());
  }

  if (typeof container.clear === "function") {
    container.clear();
  }
  containerRef.current = new Map();
}

export function QuickMatchAlertListener() {
  const { token } = useAuth();
  const userId = useMemo(() => toNumberOrNull(decodeUserIdFromToken(token)), [token]);
  const [socketReady, setSocketReady] = useState(false);
  const [subscribedCityIds, setSubscribedCityIds] = useState([]);
  const [socketError, setSocketError] = useState(null);
  const [bannerMessage, setBannerMessage] = useState(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [incomingQuickMatch, setIncomingQuickMatch] = useState(null);
  const [incomingActionLoading, setIncomingActionLoading] = useState(false);
  const [pendingAcceptedQuickMatchId, setPendingAcceptedQuickMatchId] = useState(null);
  const clientRef = useRef(null);
  const citySubscriptionRef = useRef(new Map());
  const userSubscriptionRef = useRef(null);
  const lastNotificationAtRef = useRef({});
  const handledAcceptedQuickMatchesRef = useRef(new Set());
  const resolvedQuickMatchIdsRef = useRef(new Set());
  const incomingQuickMatchIdRef = useRef(null);
  const bannerTimerRef = useRef(null);

  const shouldNotify = useCallback((event) => {
    const quickMatchId = event?.quickMatch?.id;
    const eventType = event?.eventType || "QUICK_MATCH";
    const key = `${eventType}:${quickMatchId || "none"}`;
    const now = Date.now();
    const lastTime = lastNotificationAtRef.current[key] || 0;
    if (now - lastTime < 3000) {
      return false;
    }

    lastNotificationAtRef.current[key] = now;
    return true;
  }, []);

  const showInAppBanner = useCallback((message) => {
    if (!message) {
      return;
    }

    setBannerMessage(message);
    setBannerVisible(true);
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }

    bannerTimerRef.current = setTimeout(() => {
      setBannerVisible(false);
      setBannerMessage(null);
    }, 4200);
  }, []);

  useEffect(() => {
    incomingQuickMatchIdRef.current = toNumberOrNull(incomingQuickMatch?.quickMatch?.id);
  }, [incomingQuickMatch]);

  const clearIncomingQuickMatchIfResolved = useCallback((event) => {
    const incomingQuickMatchId = incomingQuickMatchIdRef.current;
    if (!incomingQuickMatchId) {
      return;
    }

    const eventType = event?.eventType;
    const eventQuickMatchId = toNumberOrNull(event?.quickMatch?.id);
    const isResolvedEvent =
      eventType === "QUICK_MATCH_ACCEPTED" ||
      eventType === "QUICK_MATCH_DECLINED" ||
      eventType === "QUICK_MATCH_ERROR";
    const isSameQuickMatch = eventQuickMatchId && eventQuickMatchId === incomingQuickMatchId;
    const isActionFailureForIncoming =
      eventType === "QUICK_MATCH_ERROR" &&
      incomingActionLoading &&
      (event?.action === "QUICK_MATCH_ACCEPT" || event?.action === "QUICK_MATCH_DECLINE");

    if (isResolvedEvent && (isSameQuickMatch || isActionFailureForIncoming)) {
      setIncomingQuickMatch(null);
      setIncomingActionLoading(false);
    }
  }, [incomingActionLoading]);

  const dismissIncomingQuickMatch = useCallback(() => {
    setIncomingQuickMatch(null);
  }, []);

  const handleAcceptIncomingQuickMatch = useCallback(async () => {
    const quickMatchId = toNumberOrNull(incomingQuickMatch?.quickMatch?.id);
    if (!quickMatchId || incomingActionLoading) {
      return;
    }

    setIncomingActionLoading(true);
    setPendingAcceptedQuickMatchId(quickMatchId);
    resolvedQuickMatchIdsRef.current.add(quickMatchId);
    try {
      let acceptedResult = null;
      if (clientRef.current?.connected) {
        try {
          await publishAcceptQuickMatch(clientRef.current, quickMatchId);
        } catch (publishError) {
          if (!isWebSocketReceiptTimeout(publishError)) {
            throw publishError;
          }
          acceptedResult = await acceptQuickMatch(quickMatchId);
        }
      } else {
        acceptedResult = await acceptQuickMatch(quickMatchId);
      }
      setIncomingQuickMatch(null);
      const acceptedChatRoomId = toNumberOrNull(acceptedResult?.result?.chatRoom?.id);
      if (acceptedChatRoomId && navigationRef.isReady()) {
        navigationRef.navigate("ChatRoom", { chatRoomId: acceptedChatRoomId });
      }
      showInAppBanner("빠른 매칭 수락 요청을 보냈어요.");
    } catch (error) {
      if (
        String(error?.message || "").toLowerCase().includes("already resolved") &&
        String(error?.message || "").toLowerCase().includes("accepted")
      ) {
        try {
          const detail = await fetchQuickMatch(quickMatchId);
          const acceptedByUserId = toNumberOrNull(detail?.quickMatch?.acceptedByUserId);
          if (acceptedByUserId && acceptedByUserId === userId) {
            const acceptedMingleId = toNumberOrNull(detail?.quickMatch?.mingleId);
            if (acceptedMingleId) {
              const joined = await joinMingleChatRoom(acceptedMingleId);
              const chatRoomId = toNumberOrNull(joined?.chatRoom?.id);
              if (chatRoomId && navigationRef.isReady()) {
                navigationRef.navigate("ChatRoom", { chatRoomId });
              } else if (navigationRef.isReady()) {
                navigationRef.navigate("Tabs", { screen: "Chats" });
              }
            } else if (navigationRef.isReady()) {
              navigationRef.navigate("Tabs", { screen: "Chats" });
            }
            showInAppBanner("빠른 매칭이 확정되어 채팅으로 이동합니다.");
          } else {
            Alert.alert(
              "빠른 매칭 안내",
              "다른 밍글러가 먼저 수락했어요.",
            );
          }
        } catch {
          Alert.alert(
            "빠른 매칭 안내",
            "다른 밍글러가 먼저 수락했어요.",
          );
        }
        setIncomingQuickMatch(null);
        setPendingAcceptedQuickMatchId(null);
        setIncomingActionLoading(false);
        return;
      }
      showInAppBanner(error?.message || "빠른 매칭 수락에 실패했습니다.");
    } finally {
      setIncomingActionLoading(false);
    }
  }, [incomingActionLoading, incomingQuickMatch?.quickMatch?.id, showInAppBanner, userId]);

  const handleDeclineIncomingQuickMatch = useCallback(async () => {
    const quickMatchId = toNumberOrNull(incomingQuickMatch?.quickMatch?.id);
    if (!quickMatchId || incomingActionLoading) {
      return;
    }

    // Optimistically close immediately for responsive UX.
    setIncomingQuickMatch(null);
    setIncomingActionLoading(true);
    resolvedQuickMatchIdsRef.current.add(quickMatchId);
    try {
      if (clientRef.current?.connected) {
        await publishDeclineQuickMatch(clientRef.current, quickMatchId);
      } else {
        await declineQuickMatch(quickMatchId);
      }
      setIncomingQuickMatch(null);
      showInAppBanner("빠른 매칭을 거절했어요.");
    } catch (error) {
      showInAppBanner(error?.message || "빠른 매칭 거절에 실패했습니다.");
    } finally {
      setIncomingActionLoading(false);
    }
  }, [incomingActionLoading, incomingQuickMatch?.quickMatch?.id, showInAppBanner]);

  useEffect(() => {
    if (!socketError) {
      return;
    }

    const message = socketError.toLowerCase().includes("access token")
      ? "소켓 인증 실패: accessToken을 확인해주세요."
      : `소켓 오류: ${socketError}`;
    showInAppBanner(message);
  }, [socketError, showInAppBanner]);

  const loadSubscribedCityIds = useCallback(async () => {
    if (!userId) {
      setSubscribedCityIds([]);
      return;
    }

    try {
      const [tripsResponse, localsResponse] = await Promise.all([
        fetchTrips(),
        fetchLocals(),
      ]);
      const userTrips = (tripsResponse?.trips ?? []).filter((trip) => toNumberOrNull(trip?.userId) === userId);
      const trip = pickCurrentTrip(userTrips);
      const tripCityId = toNumberOrNull(trip?.cityId);
      const tripCityIds = userTrips
        .map((tripItem) => toNumberOrNull(tripItem?.cityId))
        .filter(Boolean);
      const localCityIds = (localsResponse?.locals ?? [])
        .map((local) => toNumberOrNull(local?.city?.id))
        .filter(Boolean);
      const merged = Array.from(new Set([tripCityId, ...tripCityIds, ...localCityIds].filter(Boolean))).sort((a, b) => a - b);
      setSubscribedCityIds(merged);
    } catch {
      setSubscribedCityIds([]);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const client = createQuickMatchSocketClient({
      accessToken: token,
      onConnect: () => {
        setSocketReady(true);
        setSocketError(null);
        console.log("[QM SOCKET] CONNECTED");
      },
      onError: (message) => {
        setSocketReady(false);
        setSocketError(message || "unknown error");
        console.warn("[QM SOCKET] ERROR", message || "unknown");
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      unsubscribeAllCitySubscriptions(citySubscriptionRef);
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;
      client.deactivate();
      clientRef.current = null;
      setSocketReady(false);
      setSocketError(null);
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }
    };
  }, [token, userId]);

  useEffect(() => {
    loadSubscribedCityIds();

    const intervalId = setInterval(loadSubscribedCityIds, 60000);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadSubscribedCityIds();
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [loadSubscribedCityIds]);

  useEffect(() => {
    if (!socketReady || !clientRef.current || !userId) {
      return;
    }

    userSubscriptionRef.current?.unsubscribe();
    userSubscriptionRef.current = subscribeUserQuickMatches(clientRef.current, userId, async (event) => {
      clearIncomingQuickMatchIfResolved(event);
      const eventType = event?.eventType;
      const eventRequesterUserId = toNumberOrNull(event?.quickMatch?.requesterUserId);
      const isRequesterEventForMe = eventRequesterUserId && eventRequesterUserId === userId;

      if (eventType === "QUICK_MATCH_CREATED") {
        return;
      }

      if (eventType === "QUICK_MATCH_ERROR") {
        if (isAlreadyAcceptedError(event)) {
          const alreadyAcceptedId = toNumberOrNull(event?.quickMatch?.id) || pendingAcceptedQuickMatchId;
          if (alreadyAcceptedId) {
            resolvedQuickMatchIdsRef.current.add(alreadyAcceptedId);
          }
          setIncomingQuickMatch(null);
          setIncomingActionLoading(false);
          const matchedPendingAccept =
            alreadyAcceptedId &&
            pendingAcceptedQuickMatchId &&
            alreadyAcceptedId === pendingAcceptedQuickMatchId;
          if (pendingAcceptedQuickMatchId) {
            setPendingAcceptedQuickMatchId(null);
          }
          if (matchedPendingAccept) {
            if (navigationRef.isReady()) {
              const acceptedMingleId = toNumberOrNull(event?.quickMatch?.mingleId);
              if (acceptedMingleId) {
                try {
                  const joined = await joinMingleChatRoom(acceptedMingleId);
                  const chatRoomId = toNumberOrNull(joined?.chatRoom?.id);
                  if (chatRoomId) {
                    navigationRef.navigate("ChatRoom", { chatRoomId });
                  } else {
                    navigationRef.navigate("Tabs", { screen: "Chats" });
                  }
                } catch {
                  navigationRef.navigate("Tabs", { screen: "Chats" });
                }
              } else {
                navigationRef.navigate("Tabs", { screen: "Chats" });
              }
            }
            showInAppBanner("빠른 매칭이 확정되어 채팅으로 이동합니다.");
          } else {
            Alert.alert(
              "빠른 매칭 안내",
              "다른 밍글러가 먼저 수락했어요.",
            );
          }
          return;
        }
        if (pendingAcceptedQuickMatchId && event?.action === "QUICK_MATCH_ACCEPT") {
          setPendingAcceptedQuickMatchId(null);
        }
        showInAppBanner(event?.reason || "빠른 매칭 처리 중 오류가 발생했습니다.");
        return;
      }

      if (eventType === "QUICK_MATCH_ACCEPTED") {
        const quickMatchId = toNumberOrNull(event?.quickMatch?.id);
        if (quickMatchId) {
          resolvedQuickMatchIdsRef.current.add(quickMatchId);
          setIncomingQuickMatch((prev) => {
            const prevId = toNumberOrNull(prev?.quickMatch?.id);
            return prevId && prevId === quickMatchId ? null : prev;
          });
        }
        const acceptedChatRoomId = toNumberOrNull(event?.chatRoom?.id);
        const acceptedMingleId = toNumberOrNull(event?.quickMatch?.mingleId);
        const alreadyHandled = quickMatchId ? handledAcceptedQuickMatchesRef.current.has(quickMatchId) : false;
        if (quickMatchId && !alreadyHandled) {
          handledAcceptedQuickMatchesRef.current.add(quickMatchId);
          try {
            if (acceptedChatRoomId && navigationRef.isReady()) {
              navigationRef.navigate("ChatRoom", { chatRoomId: acceptedChatRoomId });
            } else if (acceptedMingleId) {
              const joined = await joinMingleChatRoom(acceptedMingleId);
              const chatRoomId = toNumberOrNull(joined?.chatRoom?.id);
              if (chatRoomId && navigationRef.isReady()) {
                navigationRef.navigate("ChatRoom", { chatRoomId });
              } else if (navigationRef.isReady()) {
                navigationRef.navigate("Tabs", {
                  screen: "Chats",
                });
              }
            } else if (navigationRef.isReady()) {
              navigationRef.navigate("Tabs", {
                screen: "Chats",
              });
            }
          } catch {
            if (navigationRef.isReady()) {
              navigationRef.navigate("Tabs", {
                screen: "Chats",
              });
            }
          } finally {
            if (pendingAcceptedQuickMatchId && quickMatchId === pendingAcceptedQuickMatchId) {
              setPendingAcceptedQuickMatchId(null);
            }
          }
        }
      }
      if (eventType === "QUICK_MATCH_DECLINED") {
        const quickMatchId = toNumberOrNull(event?.quickMatch?.id);
        if (quickMatchId) {
          resolvedQuickMatchIdsRef.current.add(quickMatchId);
          setIncomingQuickMatch((prev) => {
            const prevId = toNumberOrNull(prev?.quickMatch?.id);
            return prevId && prevId === quickMatchId ? null : prev;
          });
        }
      }

      if (!shouldNotify(event)) {
        return;
      }

      showInAppBanner(getEventMessage(event?.eventType));
    });

    return () => {
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;
    };
  }, [pendingAcceptedQuickMatchId, socketReady, userId, shouldNotify, showInAppBanner, clearIncomingQuickMatchIfResolved]);

  useEffect(() => {
    const nextCityIds = Array.isArray(subscribedCityIds) ? subscribedCityIds : [];
    if (!socketReady || !clientRef.current || !userId || nextCityIds.length === 0) {
      return;
    }

    unsubscribeAllCitySubscriptions(citySubscriptionRef);

    nextCityIds.forEach((cityId) => {
      console.log("[QM SOCKET] SUBSCRIBE CITY", cityId);
      const subscription = subscribeCityQuickMatches(clientRef.current, cityId, (event) => {
        console.log("[QM SOCKET] CITY EVENT", event?.eventType || "-", event?.quickMatch?.id || "-");
        const quickMatch = event?.quickMatch;
        const eventType = event?.eventType;
        const quickMatchId = toNumberOrNull(quickMatch?.id);
        const requesterUserId = toNumberOrNull(quickMatch?.requesterUserId);
        const targetUserIds = event?.targetUserIds ?? [];
        const isRequester = requesterUserId && requesterUserId === userId;
        const isExplicitTargetUser = targetUserIds.some((id) => toNumberOrNull(id) === userId);
        const isTargetUser = isExplicitTargetUser;

        if (eventType === "QUICK_MATCH_CREATED" && isRequester) {
          return;
        }

        if (!isTargetUser) {
          return;
        }
        if (quickMatchId && resolvedQuickMatchIdsRef.current.has(quickMatchId)) {
          return;
        }

        clearIncomingQuickMatchIfResolved(event);

        if (!shouldNotify(event)) {
          return;
        }

        if (eventType === "QUICK_MATCH_CREATED") {
          setIncomingQuickMatch(event);
        }
        showInAppBanner(getEventMessage(eventType));
      });
      if (subscription) {
        if (!(citySubscriptionRef.current instanceof Map)) {
          citySubscriptionRef.current = new Map();
        }
        citySubscriptionRef.current.set(cityId, subscription);
      }
    });

    return () => {
      unsubscribeAllCitySubscriptions(citySubscriptionRef);
    };
  }, [socketReady, userId, subscribedCityIds, shouldNotify, showInAppBanner, clearIncomingQuickMatchIfResolved]);

  const hasBanner = bannerVisible && bannerMessage;
  const hasIncomingQuickMatch = Boolean(incomingQuickMatch?.quickMatch?.id);

  if (!hasBanner && !hasIncomingQuickMatch) {
    return null;
  }

  return (
    <>
      {hasBanner ? (
        <View pointerEvents="box-none" style={styles.overlay}>
          <Pressable style={styles.banner} onPress={() => setBannerVisible(false)}>
            <Text style={styles.bannerTitle}>빠른 매칭 알림</Text>
            <Text style={styles.bannerBody}>{bannerMessage}</Text>
          </Pressable>
        </View>
      ) : null}

      {hasIncomingQuickMatch ? (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Pressable style={styles.modalCloseButton} onPress={dismissIncomingQuickMatch}>
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
            <Text style={styles.modalTitle}>빠른 매칭 요청이 도착했어요</Text>
            <Text style={styles.modalDescription}>
              {incomingQuickMatch?.quickMatch?.message || "지금 함께할 밍글러를 찾고 있어요."}
            </Text>
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalActionButton, styles.modalDeclineButton, incomingActionLoading && styles.modalActionButtonDisabled]}
                onPress={handleDeclineIncomingQuickMatch}
                disabled={incomingActionLoading}
              >
                <Text style={styles.modalDeclineText}>{incomingActionLoading ? "처리 중..." : "거절"}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.modalAcceptButton, incomingActionLoading && styles.modalActionButtonDisabled]}
                onPress={handleAcceptIncomingQuickMatch}
                disabled={incomingActionLoading}
              >
                <Text style={styles.modalAcceptText}>{incomingActionLoading ? "처리 중..." : "수락하고 채팅 시작"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingHorizontal: 14,
    paddingTop: 56,
  },
  banner: {
    borderRadius: 14,
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  bannerTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 2,
  },
  bannerBody: {
    color: "#E5E7EB",
    fontSize: 12,
    lineHeight: 17,
  },
  modalOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10000,
    backgroundColor: "rgba(15,23,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingTop: 18,
    paddingBottom: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  modalCloseButton: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    fontSize: 18,
    lineHeight: 18,
    color: "#334155",
    fontWeight: "600",
  },
  modalTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
    marginBottom: 8,
  },
  modalDescription: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  modalActionButton: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionButtonDisabled: {
    opacity: 0.7,
  },
  modalDeclineButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  modalAcceptButton: {
    backgroundColor: "#1D4ED8",
  },
  modalDeclineText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  modalAcceptText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
