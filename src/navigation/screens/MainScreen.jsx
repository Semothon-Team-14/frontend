import { ImageBackground, Pressable, ScrollView, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import Person from '../../images/person.svg';
import Alarm from '../../images/alarm.svg';
import Now from '../../images/state.svg';
import Position from '../../images/position.svg';
import Direction from '../../images/direction.svg';
import Quick from '../../images/quick.svg';
import Speech from '../../images/speech.svg';
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from '@expo/vector-icons';
import { useState } from "react";
import { useNavigation } from "@react-navigation/native";

const CHIPS = [
  { id: 'restaurant', label: '#식당' },
  { id: 'cafe', label: '#카페' },
  { id: 'shopping', label: '#쇼핑' },
  { id: 'fun', label: '#놀거리' },
];

const IMG_MINGLER =
  'https://images.unsplash.com/photo-1579584425555-c783ce2fd867?w=900&q=80';
const IMG_TAKOYAKI =
  'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=900&q=80';
const IMG_HOTPOT =
  'https://images.unsplash.com/photo-1551218808-94e220e084d2?w=900&q=80';
const IMG_RAMEN =
  'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900&q=80';

const PLACES = [
  {
    rank: 1,
    nameKo: '잇치치 혼포 타코야끼 도톤보리점',
    nameEn: 'Acchichi Hompo Dotombori',
    image: IMG_TAKOYAKI,
  },
  {
    rank: 2,
    nameKo: '카모나베 전문 도톤보리점',
    nameEn: 'Kamonabe Dotonbori',
    image: IMG_HOTPOT,
  },
  {
    rank: 3,
    nameKo: '이치란 라멘 도톤보리점',
    nameEn: 'Ichiran Ramen Dotonbori',
    image: IMG_RAMEN,
  },
];

function ChipRow({ activeId, onSelect }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {CHIPS.map((c) => {
        const active = c.id === activeId;
        return (
          <Pressable
            key={c.id}
            onPress={() => onSelect(c.id)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text
              style={[styles.chipText, active && styles.chipTextActive]}
              numberOfLines={1}
            >
              {c.label}
            </Text>
          </Pressable>
        );
      })}
      <Pressable style={styles.chip} accessibilityLabel="필터 추가">
        <Text style={styles.chipText}>+</Text>
      </Pressable>
    </ScrollView>
  );
}

export function MainScreen() {
    const [activeChip, setActiveChip] = useState('restaurant');
    const navigation = useNavigation();

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.homeheader}>
                <Alarm />
                <Person />
            </View>
            <View style={{marginBottom: 25}}>
                <Now style={{marginBottom: 10}} />
                <View style={{flexDirection: 'row', gap: 5, alignItems: 'center'}}>
                    <Text style={{fontSize: 24, fontWeight: 'bold'}}>오사카 도톤보리</Text>
                    <Position width={18} height={18} />
                </View>
                <Text style={{fontSize: 14, color: '#818181'}}>Dotombori District</Text>
            </View>
            <View style={styles.quickmenu}>
                <TouchableWithoutFeedback>
                    <View style={styles.nearbyMingler}>
                        <LinearGradient
                            colors={['rgba(1, 105, 254, 0.5)', 'rgb(1, 105, 254)']}
                            style={StyleSheet.absoluteFill}
                        />
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
                            <Text style={{color: 'white', fontWeight: 'bold', fontSize: 20}}>근처 밍글러</Text>
                            <Direction width={18} height={18} />
                        </View>
                        <View>
                            <Text style={{color: 'white', fontSize: 16}}>오늘 저녁에 같이{'\n'}<Text style={{color: '#61FF76'}}>#맛집투어</Text> 하실 분</Text>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
                <View style={{width: 170, justifyContent: 'space-between'}}>
                    <TouchableWithoutFeedback onPress={() => {
                        navigation.navigate('QuickMatch');
                    }}>
                        <View style={styles.quickmenuRight}>
                            <Quick />
                            <Text style={styles.menuText}>빠른 매칭</Text>
                        </View>
                    </TouchableWithoutFeedback>
                    <TouchableWithoutFeedback>
                        <View style={styles.quickmenuRight}>
                            <Speech />
                            <Text style={styles.menuText}>로컬 커뮤니티</Text>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </View>
            <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>실시간 인기</Text>
                <Text style={styles.sectionTime}>AM 9:00</Text>
            </View>
            <ChipRow activeId={activeChip} onSelect={setActiveChip} />
            <View style={styles.popularPanel}>
          <View style={styles.placesList}>
            {PLACES.map((p) => (
              <Pressable key={p.rank} style={styles.placeCard}>
                <ImageBackground
                  source={{ uri: p.image }}
                  style={styles.placeImage}
                  imageStyle={styles.placeImageRadius}
                >
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>{p.rank}</Text>
                  </View>
                  <Pressable
                    style={styles.bookmarkBtn}
                    hitSlop={12}
                    accessibilityLabel="저장"
                  >
                    <Ionicons name="bookmark-outline" size={22} color={'#ffffff'} />
                  </Pressable>
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.75)']}
                    style={styles.placeGradient}
                  />
                  <View style={styles.placeFooter}>
                    <View style={styles.placeTextCol}>
                      <Text style={styles.placeNameKo}>{p.nameKo}</Text>
                      <Text style={styles.placeNameEn}>{p.nameEn}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color={'#ffffff'} />
                  </View>
                </ImageBackground>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.morePlacesRow}
            accessibilityRole="button"
            accessibilityLabel="인기 장소 더보기"
          >
            <Text style={styles.morePlacesText}>인기 장소 더보기</Text>
            <Ionicons name="chevron-forward" size={16} color={'#818181'} />
          </Pressable>
        </View>
      </ScrollView>
    )
}
const styles = StyleSheet.create({
    container: {
        padding: 25,
        backgroundColor: '#f5f6f8'
    },
    homeheader: {
        marginTop: 30,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 15,
        marginBottom: 30,
    },
    quickmenu: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    nearbyMingler: {
        width: 170,
        height: 170,
        padding: 14,
        justifyContent: 'space-between',
        borderRadius: 20,
        overflow: 'hidden',
    },
    quickmenuRight: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 14,
        height: 80,
        justifyContent: 'center',
    },
    menuText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
    sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  sectionTime: {
    fontSize: 14,
    color: '#818181',
    fontWeight: '500',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
    marginBottom: 18,
  },
  chip: {
    borderRadius: 19,
    height: 26,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  chipActive: {
    backgroundColor: '#0169FE',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#818181',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  chipAdd: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  popularPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    paddingBottom: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  placesList: {
    flexDirection: 'column',
    gap: 14,
  },
  morePlacesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    paddingBottom: 6,
    gap: 2,
  },
  morePlacesText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#818181',
  },
  placeCard: {
    borderRadius: 18,
    overflow: 'hidden',
    height: 155,
  },
  placeImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  placeImageRadius: {
    borderRadius: 18,
  },
  rankBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0169FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  bookmarkBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 108,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  placeFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 28,
  },
  placeTextCol: {
    flex: 1,
    marginRight: 8,
  },
  placeNameKo: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  placeNameEn: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '500',
  },
})