import { StyleSheet, Text, View } from "react-native";
import GoBack from '../../images/goback.svg';

export function QuickMatch() {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <GoBack style={{position: 'absolute', left: 25}} />
                <Text style={styles.headerText}>빠른 매칭</Text>
            </View>
            <View style={{justifyContent: 'center', alignItems: 'center', flex: 1}}>
                <Text style={{fontSize: 20, fontWeight: 'bold', margin: 10}}>주변의 여행자를 찾는 중...</Text>
                <Text style={{fontSize: 16, color: '#818181'}}>자유롭게 여행하세요. 매칭이 완료되면 알려드릴게요.</Text>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 50,
        position: 'static'
    },
    headerText: {
        fontSize: 20,
        fontWeight: 'bold',
    }
})