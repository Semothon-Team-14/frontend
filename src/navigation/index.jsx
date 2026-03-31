import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createStaticNavigation } from "@react-navigation/native";
import { MainScreen } from "./screens/MainScreen";
import { Chats } from "./screens/Chats";
import { MyPage } from "./screens/MyPage";
import { BookMark } from "./screens/BookMark";
import { Nearby } from "./screens/Nearby";
import { QuickMatch } from "./screens/QuickMatch";
import { NotFound } from "./screens/NotFound";

const Tabs = createBottomTabNavigator({
    screenOptions: {
        headerShown: false,
    },
    screens: {
        MainScreen: {
            screen: MainScreen,
            options: {
                title: '홈',
            },
        },
        Chats: {
            screen: Chats,
            options: {
                title: '채팅',
            },
        },
        MyPage: {
            screen: MyPage,
            options: {
                title: '나의 여행',
            },
        },
        BookMark: {
            screen: BookMark,
            options: {
                title: '저장',
            },
        },
    },
});

const RootStack = createNativeStackNavigator({
    screenOptions: {
        headerShown: false,
    },
    screens: {
        Tabs: {
            screen: Tabs,
        },
        Nearby: {
            screen: Nearby,
        },
        QuickMatch: {
            screen: QuickMatch,
        },
        NotFound: {
            screen: NotFound,
            options: {
                title: '404',
            },
        }
    },
});

export const Navigation = createStaticNavigation(RootStack);