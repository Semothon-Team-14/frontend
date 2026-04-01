import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth";
import { decodeUserIdFromToken } from "../auth/userId";
import { fetchTrips } from "../services";
import {
  createQuickMatchSocketClient,
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

export function QuickMatchAlertListener() {
  const { token } = useAuth();
  const userId = useMemo(() => toNumberOrNull(decodeUserIdFromToken(token)), [token]);
  const [socketReady, setSocketReady] = useState(false);
  const [currentCityId, setCurrentCityId] = useState(null);
  const [socketError, setSocketError] = useState(null);
  const [bannerMessage, setBannerMessage] = useState(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const clientRef = useRef(null);
  const citySubscriptionRef = useRef(null);
  const userSubscriptionRef = useRef(null);
  const lastNotificationAtRef = useRef({});
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
    if (!socketError) {
      return;
    }

    const message = socketError.toLowerCase().includes("access token")
      ? "소켓 인증 실패: accessToken을 확인해주세요."
      : `소켓 오류: ${socketError}`;
    showInAppBanner(message);
  }, [socketError, showInAppBanner]);

  const loadCurrentCityId = useCallback(async () => {
    if (!userId) {
      setCurrentCityId(null);
      return;
    }

    try {
      const tripsResponse = await fetchTrips();
      const userTrips = (tripsResponse?.trips ?? []).filter((trip) => toNumberOrNull(trip?.userId) === userId);
      const trip = pickCurrentTrip(userTrips);
      setCurrentCityId(toNumberOrNull(trip?.cityId));
    } catch {
      setCurrentCityId(null);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    const client = createQuickMatchSocketClient({
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
      citySubscriptionRef.current?.unsubscribe();
      citySubscriptionRef.current = null;
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
  }, [userId]);

  useEffect(() => {
    loadCurrentCityId();

    const intervalId = setInterval(loadCurrentCityId, 60000);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        loadCurrentCityId();
      }
    });

    return () => {
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [loadCurrentCityId]);

  useEffect(() => {
    if (!socketReady || !clientRef.current || !userId) {
      return;
    }

    userSubscriptionRef.current?.unsubscribe();
    userSubscriptionRef.current = subscribeUserQuickMatches(clientRef.current, userId, (event) => {
      if (!shouldNotify(event)) {
        return;
      }

      showInAppBanner(getEventMessage(event?.eventType));
    });

    return () => {
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;
    };
  }, [socketReady, userId, shouldNotify, showInAppBanner]);

  useEffect(() => {
    if (!socketReady || !clientRef.current || !userId || !currentCityId) {
      return;
    }

    console.log("[QM SOCKET] SUBSCRIBE CITY", currentCityId);
    citySubscriptionRef.current?.unsubscribe();
    citySubscriptionRef.current = subscribeCityQuickMatches(clientRef.current, currentCityId, (event) => {
      console.log("[QM SOCKET] CITY EVENT", event?.eventType || "-", event?.quickMatch?.id || "-");
      const targetUserIds = event?.targetUserIds ?? [];
      const isTargetUser = targetUserIds.length === 0 || targetUserIds.some((id) => toNumberOrNull(id) === userId);
      if (!isTargetUser || !shouldNotify(event)) {
        return;
      }

      showInAppBanner(getEventMessage(event?.eventType));
    });

    return () => {
      citySubscriptionRef.current?.unsubscribe();
      citySubscriptionRef.current = null;
    };
  }, [socketReady, userId, currentCityId, shouldNotify, showInAppBanner]);

  if (!bannerVisible || !bannerMessage) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Pressable style={styles.banner} onPress={() => setBannerVisible(false)}>
        <Text style={styles.bannerTitle}>빠른 매칭 알림</Text>
        <Text style={styles.bannerBody}>{bannerMessage}</Text>
      </Pressable>
    </View>
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
});
