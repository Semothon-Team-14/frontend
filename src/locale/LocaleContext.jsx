import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth";
import { decodeUserIdFromToken } from "../auth/userId";
import { fetchNationalities } from "../services/placeService";
import { fetchUser } from "../services/userService";

const LocaleContext = createContext(null);

export function LocaleProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [locale, setLocale] = useState("ko");
  const userId = useMemo(() => decodeUserIdFromToken(token), [token]);

  useEffect(() => {
    let mounted = true;

    async function loadLocale() {
      if (!isAuthenticated || !Number.isFinite(userId) || userId <= 0) {
        if (mounted) {
          setLocale("ko");
        }
        return;
      }

      try {
        const [userResponse, nationalityResponse] = await Promise.all([
          fetchUser(userId),
          fetchNationalities(),
        ]);
        if (!mounted) {
          return;
        }

        const nationalityId = Number(userResponse?.user?.nationalityId || 0);
        const nationalities = nationalityResponse?.nationalities ?? [];
        const nationality = nationalities.find(
          (item) => Number(item?.id) === nationalityId,
        );
        const countryCode = String(nationality?.countryCode || "").toUpperCase();
        setLocale(countryCode === "KR" ? "ko" : "en");
      } catch {
        if (mounted) {
          setLocale("ko");
        }
      }
    }

    loadLocale();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, userId]);

  const tx = useCallback(
    (korean, english) => (locale === "ko" ? korean : english || korean),
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      isKorean: locale === "ko",
      tx,
    }),
    [locale, tx],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
