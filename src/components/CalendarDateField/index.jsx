import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar } from "react-native-calendars";
import { Ionicons } from "@expo/vector-icons";

function formatDisplayDate(value) {
  if (!value) {
    return "날짜를 선택하세요";
  }

  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${year}.${month}.${day}`;
}

export function CalendarDateField({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "날짜를 선택하세요",
}) {
  const [visible, setVisible] = useState(false);

  const markedDates = useMemo(() => {
    if (!value) {
      return {};
    }

    return {
      [value]: {
        selected: true,
        selectedColor: "#1C73F0",
        selectedTextColor: "#FFFFFF",
      },
    };
  }, [value]);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable style={styles.fieldButton} onPress={() => setVisible(true)}>
        <Text style={[styles.fieldText, !value && styles.placeholderText]}>
          {value ? formatDisplayDate(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color="#6B7280" />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label || "날짜 선택"}</Text>
              <Pressable onPress={() => setVisible(false)}>
                <Ionicons name="close" size={22} color="#111" />
              </Pressable>
            </View>

            <Calendar
              current={value || undefined}
              minDate={minDate || undefined}
              maxDate={maxDate || undefined}
              markedDates={markedDates}
              onDayPress={(day) => {
                onChange(day.dateString);
                setVisible(false);
              }}
              theme={{
                todayTextColor: "#1C73F0",
                arrowColor: "#1C73F0",
                textDayFontWeight: "500",
                textMonthFontWeight: "700",
                textDayHeaderFontWeight: "600",
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: "#666",
    fontWeight: "600",
  },
  fieldButton: {
    borderWidth: 1,
    borderColor: "#D5D5D5",
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldText: {
    fontSize: 14,
    color: "#111",
  },
  placeholderText: {
    color: "#9CA3AF",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.28)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
});
