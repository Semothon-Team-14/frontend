import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocale } from "../../locale";

const DAY_OPTIONS = [
  { key: "MON", ko: "월", en: "Mon" },
  { key: "TUE", ko: "화", en: "Tue" },
  { key: "WED", ko: "수", en: "Wed" },
  { key: "THU", ko: "목", en: "Thu" },
  { key: "FRI", ko: "금", en: "Fri" },
  { key: "SAT", ko: "토", en: "Sat" },
  { key: "SUN", ko: "일", en: "Sun" },
];

function buildTimeOptions() {
  const values = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      values.push(`${hh}:${mm}`);
    }
  }
  return values;
}

const TIME_OPTIONS = buildTimeOptions();

export function WeeklyAvailabilityPicker({
  days = [],
  startTime = "09:00",
  endTime = "18:00",
  onChange,
}) {
  const { tx, isKorean } = useLocale();
  const [activeTimeField, setActiveTimeField] = useState(null);
  const [draftStartTime, setDraftStartTime] = useState(startTime);
  const [draftEndTime, setDraftEndTime] = useState(endTime);

  const daySet = useMemo(() => new Set(days), [days]);

  function toggleDay(dayKey) {
    if (typeof onChange !== "function") {
      return;
    }
    const nextSet = new Set(days);
    if (nextSet.has(dayKey)) {
      nextSet.delete(dayKey);
    } else {
      nextSet.add(dayKey);
    }
    onChange({
      days: DAY_OPTIONS.map((option) => option.key).filter((key) => nextSet.has(key)),
      startTime,
      endTime,
    });
  }

  function openTimeModal(field) {
    setDraftStartTime(startTime);
    setDraftEndTime(endTime);
    setActiveTimeField(field);
  }

  function applyTimeSelection() {
    if (typeof onChange === "function") {
      onChange({
        days,
        startTime: draftStartTime,
        endTime: draftEndTime,
      });
    }
    setActiveTimeField(null);
  }

  const daySummary = days.length
    ? DAY_OPTIONS.filter((option) => daySet.has(option.key))
        .map((option) => (isKorean ? option.ko : option.en))
        .join(isKorean ? " · " : ", ")
    : tx("요일을 선택하세요", "Select day(s)");

  return (
    <View style={styles.wrapper}>
      <View style={styles.dayChipRow}>
        {DAY_OPTIONS.map((option) => {
          const active = daySet.has(option.key);
          return (
            <Pressable
              key={option.key}
              style={[styles.dayChip, active && styles.dayChipActive]}
              onPress={() => toggleDay(option.key)}
            >
              <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                {isKorean ? option.ko : option.en}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.daySummary}>{daySummary}</Text>

      <View style={styles.timeRangeRow}>
        <Pressable style={styles.timeButton} onPress={() => openTimeModal("start")}>
          <Text style={styles.timeButtonText}>{startTime}</Text>
        </Pressable>
        <Text style={styles.timeDivider}>~</Text>
        <Pressable style={styles.timeButton} onPress={() => openTimeModal("end")}>
          <Text style={styles.timeButtonText}>{endTime}</Text>
        </Pressable>
      </View>

      <Modal
        visible={Boolean(activeTimeField)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveTimeField(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {tx("가능 시간 설정", "Set Available Time")}
            </Text>

            <View style={styles.modalTimeColumns}>
              <View style={styles.modalTimeColumn}>
                <Text style={styles.modalLabel}>{tx("시작", "Start")}</Text>
                <FlatList
                  data={TIME_OPTIONS}
                  keyExtractor={(item) => `start-${item}`}
                  style={styles.timeList}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[styles.timeListItem, draftStartTime === item && styles.timeListItemActive]}
                      onPress={() => setDraftStartTime(item)}
                    >
                      <Text style={[styles.timeListItemText, draftStartTime === item && styles.timeListItemTextActive]}>
                        {item}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>

              <View style={styles.modalTimeColumn}>
                <Text style={styles.modalLabel}>{tx("종료", "End")}</Text>
                <FlatList
                  data={TIME_OPTIONS}
                  keyExtractor={(item) => `end-${item}`}
                  style={styles.timeList}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[styles.timeListItem, draftEndTime === item && styles.timeListItemActive]}
                      onPress={() => setDraftEndTime(item)}
                    >
                      <Text style={[styles.timeListItemText, draftEndTime === item && styles.timeListItemTextActive]}>
                        {item}
                      </Text>
                    </Pressable>
                  )}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setActiveTimeField(null)}>
                <Text style={styles.cancelButtonText}>{tx("취소", "Cancel")}</Text>
              </Pressable>
              <Pressable style={styles.applyButton} onPress={applyTimeSelection}>
                <Ionicons name="checkmark" size={16} color="#FFF" />
                <Text style={styles.applyButtonText}>{tx("적용", "Apply")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  dayChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  dayChip: {
    minWidth: 34,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#D5DDEB",
    backgroundColor: "#F8FAFF",
    alignItems: "center",
    justifyContent: "center",
  },
  dayChipActive: {
    borderColor: "#0169FE",
    backgroundColor: "#EAF2FF",
  },
  dayChipText: {
    color: "#657084",
    fontSize: 12,
    fontWeight: "700",
  },
  dayChipTextActive: {
    color: "#0169FE",
  },
  daySummary: {
    color: "#6B7488",
    fontSize: 12,
    fontWeight: "600",
  },
  timeRangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  timeButton: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D5DDEB",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  timeButtonText: {
    color: "#2D3442",
    fontSize: 13,
    fontWeight: "700",
  },
  timeDivider: {
    color: "#7B869C",
    fontSize: 13,
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 14,
    gap: 10,
  },
  modalTitle: {
    color: "#151515",
    fontSize: 16,
    fontWeight: "800",
  },
  modalTimeColumns: {
    flexDirection: "row",
    gap: 10,
  },
  modalTimeColumn: {
    flex: 1,
    gap: 6,
  },
  modalLabel: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "700",
  },
  timeList: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: "#E5EAF3",
    borderRadius: 10,
  },
  timeListItem: {
    height: 34,
    justifyContent: "center",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F8",
  },
  timeListItemActive: {
    backgroundColor: "#EAF2FF",
  },
  timeListItemText: {
    color: "#2D3442",
    fontSize: 12,
    fontWeight: "700",
  },
  timeListItemTextActive: {
    color: "#0169FE",
  },
  modalActions: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  cancelButton: {
    height: 34,
    borderRadius: 10,
    backgroundColor: "#EFF2F7",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  cancelButtonText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700",
  },
  applyButton: {
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0169FE",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  applyButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
