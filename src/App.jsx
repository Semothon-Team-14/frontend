import { LogBox } from "react-native";
import { Navigation } from './navigation';
import { AuthProvider } from './auth';
import { LocaleProvider } from "./locale";

LogBox.ignoreLogs([
  "VirtualizedLists should never be nested inside plain ScrollViews",
]);

export default function App() {
  return (
    <AuthProvider>
      <LocaleProvider>
        <Navigation />
      </LocaleProvider>
    </AuthProvider>
  );
}
