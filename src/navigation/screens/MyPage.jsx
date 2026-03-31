import { StatusBar } from "expo-status-bar";
import { ScrollView, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import Info from '../../images/info.svg';
import TravelIcon from '../../images/travelIcon.svg';
import More from '../../images/more.svg';
import DirectionBlack from '../../images/direction_black.svg';

export function MyPage() {
    return (
        <ScrollView style={styles.container}>
            <View style={styles.userInfo}>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 60 }}>
                    <TouchableWithoutFeedback>
                        <Info />
                    </TouchableWithoutFeedback>
                </View>
                <View>
                    <Text style={{fontSize: 14, color: '#D9D9D9'}}>USER #23941</Text>
                    <Text style={{fontSize: 24, fontWeight: 'bold', color: '#fff'}}>야호호</Text>
                    <View style={styles.categories}>
                        <View style={styles.category}><Text style={styles.categoryText}>#역동적인현지체험</Text></View>
                        <View style={styles.category}><Text style={styles.categoryText}>#휴식</Text></View>
                    </View>
                </View>
            </View>
            <View style={styles.travelLogArea}>
                <Text style={{fontWeight: 'bold', fontSize: 20, marginBottom: 10}}>여행 기록</Text>
                <Text style={{fontSize: 14, color: '#818181'}}>최근 3개월간 3번의 여행을 함께 했어요!</Text>
                <View style={styles.travelLog}>
                    <View style={styles.travel}>
                        <View style={styles.travelHeader}>
                            <TravelIcon />
                            <DirectionBlack />
                        </View>
                        <View>
                            <Text style={styles.travelTitle}>일본 오사카</Text>
                            <Text style={styles.travelDays}>4박 5일 2026년 3월 21일 ~ 25일</Text>
                        </View>
                    </View>
                    <View style={styles.travel}>
                        <View style={styles.travelHeader}>
                            <TravelIcon />
                            <DirectionBlack />
                        </View>
                        <View>
                            <Text style={styles.travelTitle}>일본 오사카</Text>
                            <Text style={styles.travelDays}>4박 5일 2026년 3월 21일 ~ 25일</Text>
                        </View>
                    </View>
                    <View style={styles.travel}>
                        <View style={styles.travelHeader}>
                            <TravelIcon />
                            <DirectionBlack />
                        </View>
                        <View>
                            <Text style={styles.travelTitle}>일본 오사카</Text>
                            <Text style={styles.travelDays}>4박 5일 2026년 3월 21일 ~ 25일</Text>
                        </View>
                    </View>
                    <View style={{alignItems: 'center'}}>
                        <More />
                    </View>
                </View>
            </View>
        </ScrollView>
    )
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#0169FE'
    },
    userInfo: {
        padding: 20,
        height: 400,
        justifyContent: 'space-between'
    },
    categories: {
        marginTop: 10,
        flexDirection: 'row',
        gap: 10,
    },
    category: {
        backgroundColor: '#fff',
        paddingHorizontal: 10,
        height: 26,
        borderRadius: 13,
        justifyContent: 'center',
    },
    categoryText: {
        color: '#0169FE',
        fontSize: 12,
    },
    travelLogArea: {
        backgroundColor: '#F5F6F8',
        minHeight: 445,
        borderTopEndRadius: 20,
        borderTopStartRadius: 20,
        padding: 30,
    },
    travelLog: {
        gap: 20,
        marginTop: 20,
    },
    travel: {
        backgroundColor: '#fff',
        height: 128,
        padding: 20,
        borderRadius: 17,
        justifyContent: 'space-between',
    },
    travelHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    travelTitle: {
        fontWeight: 'bold',
        fontSize: 20
    },
    travelDays: {
        fontSize: 14,
        color: '#818181'
    }
})