import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeIcon from "../icons/home.svg";
import ChatIcon from "../icons/chat.svg";
import MyPageIcon from "../icons/mypage.svg";
import BookMarkIcon from "../icons/bookmark.svg";
import { MainScreen } from "../screens/MainScreen/index.jsx";
import { Chats } from "../screens/Chats/index.jsx";
import { MyPage } from "../screens/MyPage/index.jsx";
import { BookMark } from "../screens/BookMark/index.jsx";
import { Nearby } from "../screens/Nearby/index.jsx";
import { QuickMatch } from "../screens/QuickMatch/index.jsx";
import { NotFound } from "../screens/NotFound/index.jsx";
import { CreateTrip } from "../screens/CreateTrip";
import { ProfileEdit } from "../screens/ProfileEdit";
import { LoginScreen } from "../screens/Auth/Login";
import { SignUpScreen } from "../screens/Auth/SignUp";
import { useAuth } from "../auth";
import { QuickMatchAlertListener } from "../realtime/QuickMatchAlertListener";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabsNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: "#fff", paddingTop: 4 },
      }}
    >
      <Tab.Screen
        name="MainScreen"
        component={MainScreen}
        options={{
          title: "홈",
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="Chats"
        component={Chats}
        options={{
          title: "채팅",
          tabBarIcon: ({ color }) => <ChatIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="MyPage"
        component={MyPage}
        options={{
          title: "나의 여행",
          tabBarIcon: ({ color }) => <MyPageIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="BookMark"
        component={BookMark}
        options={{
          title: "저장",
          tabBarIcon: ({ color }) => <BookMarkIcon color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  );
}

function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabsNavigator} />
      <Stack.Screen name="Nearby" component={Nearby} />
      <Stack.Screen name="QuickMatch" component={QuickMatch} />
      <Stack.Screen name="CreateTrip" component={CreateTrip} />
      <Stack.Screen name="ProfileEdit" component={ProfileEdit} />
      <Stack.Screen
        name="NotFound"
        component={NotFound}
        options={{
          title: "404",
        }}
      />
    </Stack.Navigator>
  );
}

function BootSplash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F5F6F8" }}>
      <ActivityIndicator size="large" color="#0169FE" />
    </View>
  );
}

export function Navigation() {
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    return <BootSplash />;
  }

  return (
    <>
      {isAuthenticated ? <QuickMatchAlertListener /> : null}
      <NavigationContainer>{isAuthenticated ? <AppStack /> : <AuthStack />}</NavigationContainer>
    </>
  );
}
