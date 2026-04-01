import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
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
  const clientRef = useRef(null);
  const citySubscriptionRef = useRef(null);
  const userSubscriptionRef = useRef(null);
  const lastNotificationAtRef = useRef({});

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
      onConnect: () => setSocketReady(true),
      onError: () => setSocketReady(false),
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

      Alert.alert("빠른 매칭", getEventMessage(event?.eventType));
    });

    return () => {
      userSubscriptionRef.current?.unsubscribe();
      userSubscriptionRef.current = null;
    };
  }, [socketReady, userId, shouldNotify]);

  useEffect(() => {
    if (!socketReady || !clientRef.current || !userId || !currentCityId) {
      return;
    }

    citySubscriptionRef.current?.unsubscribe();
    citySubscriptionRef.current = subscribeCityQuickMatches(clientRef.current, currentCityId, (event) => {
      const targetUserIds = event?.targetUserIds ?? [];
      const isTargetUser = targetUserIds.length === 0 || targetUserIds.some((id) => toNumberOrNull(id) === userId);
      if (!isTargetUser || !shouldNotify(event)) {
        return;
      }

      Alert.alert("빠른 매칭", getEventMessage(event?.eventType));
    });

    return () => {
      citySubscriptionRef.current?.unsubscribe();
      citySubscriptionRef.current = null;
    };
  }, [socketReady, userId, currentCityId, shouldNotify]);

  return null;
}
