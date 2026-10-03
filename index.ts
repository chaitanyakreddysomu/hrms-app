import "./global.css";

import { registerRootComponent } from "expo";
import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App)
// It ensures the environment is set up correctly for Expo Go and native builds
registerRootComponent(App);
