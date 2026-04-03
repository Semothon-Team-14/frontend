import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocale } from "../../locale";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function SearchDropdown({
  value,
  onChangeText,
  placeholder,
  items,
  selectedItem,
  onSelectItem,
  getItemKey,
  getItemLabel,
  getItemSearchText,
  emptyText,
}) {
  const { tx } = useLocale();
  const resolvedEmptyText = emptyText || tx("검색 결과가 없습니다.", "No matching results.");
  const [isFocused, setIsFocused] = useState(false);
  const blurTimeoutRef = useRef(null);
  const optionTapInProgressRef = useRef(false);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  function closeDropdownWithDelay() {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    blurTimeoutRef.current = setTimeout(() => {
      if (!optionTapInProgressRef.current) {
        setIsFocused(false);
      }
    }, 180);
  }

  const filteredItems = useMemo(() => {
    const query = normalize(value);
    if (!query) {
      return [];
    }

    return (items || [])
      .filter((item) => {
        const searchText = getItemSearchText ? getItemSearchText(item) : getItemLabel(item);
        return normalize(searchText).includes(query);
      })
      .slice(0, 20);
  }, [getItemLabel, getItemSearchText, items, value]);

  const showDropdown = isFocused && normalize(value).length > 0;

  return (
    <View style={styles.wrapper}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        onFocus={() => {
          if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current);
          }
          setIsFocused(true);
        }}
        onBlur={closeDropdownWithDelay}
      />

      {showDropdown ? (
        <View style={styles.dropdown}>
          {filteredItems.length === 0 ? (
            <Text style={styles.emptyText}>{resolvedEmptyText}</Text>
          ) : (
            <FlatList
              keyboardShouldPersistTaps="always"
              data={filteredItems}
              keyExtractor={(item) => String(getItemKey(item))}
              renderItem={({ item }) => {
                const active = selectedItem && getItemKey(selectedItem) === getItemKey(item);
                return (
                  <Pressable
                    style={[styles.optionItem, active && styles.optionItemActive]}
                    onPressIn={() => {
                      optionTapInProgressRef.current = true;
                    }}
                    onPress={() => {
                      onSelectItem(item);
                      optionTapInProgressRef.current = false;
                      setIsFocused(false);
                    }}
                    onPressOut={() => {
                      optionTapInProgressRef.current = false;
                    }}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{getItemLabel(item)}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "relative",
    zIndex: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D5D5D5",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
    fontSize: 14,
  },
  dropdown: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E4E4E4",
    backgroundColor: "#FFF",
    maxHeight: 220,
    overflow: "hidden",
  },
  optionItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFF1",
  },
  optionItemActive: {
    backgroundColor: "#EAF2FF",
  },
  optionText: {
    fontSize: 14,
    color: "#222",
  },
  optionTextActive: {
    color: "#1C73F0",
    fontWeight: "700",
  },
  emptyText: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    color: "#8A8A8A",
    fontSize: 13,
  },
});
