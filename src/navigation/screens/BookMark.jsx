import { ImageBackground, StyleSheet, Text, View } from "react-native";

export function BookMark() {
    return (
        <View>
            <View>
                <ImageBackground
                    source={require('../../images/bookmarkBackground.png')}
                    resizeMode="cover"
                    style={styles.image}
                >
                </ImageBackground>
            </View>
            <View>
                <View style={styles.bookmarkArea}>
                    <View style={{flexDirection: 'row', alignItems: 'flex-end', gap: 10}}>
                        <Text style={{fontSize: 20, fontWeight: 'bold'}}>음식점 이름 A</Text>
                        <Text style={{fontSize: 14, color: '#86A6D5'}}>restaurant</Text>
                    </View>
                </View>
            </View>
        </View>
    )
}

const styles = StyleSheet.create({
    image: {
        width: '100%',
        height: '400',
        position: 'absolute',
    },
    bookmarkArea: {
        backgroundColor: '#fff',
        marginTop: 350,
        height: 700,
        borderRadius: 17,
        padding: 20,

    }
});