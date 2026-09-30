# Cinepix — TV অ্যাপ ও Desktop অ্যাপ রোডম্যাপ

> অডিট ভিত্তিক (কোডবেইজ স্ক্যান: ২০২৬-০৯-৩০)। বর্তমান বেস: Expo SDK 57, RN 0.86, react-native-video (ExoPlayer), FlashList, bottom-tabs, self-hosted OTA।

---

## 📺 অংশ ১: Android TV / TV Box অ্যাপ

### ✅ যা এখনই আছে (বেস রেডি)
| জিনিস | অবস্থান |
|---|---|
| প্লেয়ারে TV ইভেন্ট হ্যান্ডলার (D-pad → কন্ট্রোল দেখানো) | `src/components/media-console/OSSupport/TVOSSupport.tsx` |
| Cast/PiP/Lock TV-তে অটো-লুকানো | `src/screens/home/Player.tsx` |
| Login-এ `device_type: 'tv'` | `src/lib/zustand/authStore.ts` |
| ফোন থেকে TV-র 18+ রিমোট কন্ট্রোল (`tv_adult_enabled`) | `src/lib/services/initService.ts` + Settings |
| টরেন্ট স্ট্যাক (TV box-এ দরকারি) | CI-তে `INCLUDE_TORRENT=1` |
| OTA + বিল্ড পাইপলাইন | আগের থেকেই কাজ করছে |

### 🔧 কাজের লিস্ট (প্রায়োরিটি অনুযায়ী)

**P0 — TV-তে অ্যাপ চালু হওয়াই যদি না হয়:**
1. **Leanback launcher ম্যানিফেস্টে যোগ** — `android.intent.category.LEANBACK_LAUNCHER` + `<uses-feature android:name="android.software.leanback" android:required="false"/>` + TV banner (320×180)। এখন ম্যানিফেস্টে নেই → TV-র হোম স্ক্রিনে অ্যাপ দেখায় না, sideload launcher ছাড়া খোলাই যায় না। *ছোট কাজ, সবচেয়ে জরুরি।*
2. **isTV গার্ড অডিট** — orientation lock/police, keep-awake, haptics TV-তে skip করা (মামলা ছোট, ঝামেলা বড়)।

**P1 — D-pad নেভিগেশন (সবচেয়ে বড় কাজ):**
3. সব টাচ কম্পোনেন্টে **focus সাপোর্ট** — `Pressable`/`TouchableHighlight` + `focusable`, ফোকাসড কার্ডে scale/border অ্যানিমেশন।
4. **রো-টু-রো ফোকাস নেভিগেশন** — Home-এর horizontal FlashList রোগুলোতে উপরে/নিচে দিলে রো বদলে আগের ফোকাস পজিশন মনে রাখা (focus memory)।
5. **Bottom tabs → TV-তে top navigation** — D-pad-এ নিচে যাওয়া কষ্টকর; TV ভ্যারিয়েন্টে উপরে tab strip (বা sidebar)।
6. **Back বাটন আচরণ** — modal/রো/স্ক্রিন অনুযায়ী সঠিক pop।

**P2 — 10-foot UI:**
7. TV হোম লেআউট ভ্যারিয়েন্ট — বড় পোস্টার কার্ড, হিরো ব্যানার, ফোকাস জুম।
8. প্লেয়ার TV পলিশ — D-pad বামে/ডানে ±১০/৩০ সেকেন্ড সিক, OK = play/pause, সাবটাইটেল/অডিও ট্র্যাক মেনু ফোকাসেবল।
9. **TV পেয়ারিং ফ্লো** — রিমোটে টাইপিং কষ্টকর; ফোন↔TV পেয়ার কোড (সার্ভারে ৬ ডিজিটের কোড endpoint + TV-তে কোড দেখানো স্ক্রিন)।
10. AdultLock PIN প্যাড ফোকাসেবল করা।

**P3 — শক্ত করা:**
11. পুরনো বক্স পারফরম্যান্স — expo-blur কমানো, image থাম্বনেইল সাইজ কমানো, reduced motion।
12. QA ম্যাট্রিক্স — Mi Box, Fire TV Stick (আলাদা স্টোর নোট), Google TV, জেনেরিক বক্স; WebView আছে কি না ফলব্যাক।
13. TV-তে APK আপডেট ইনস্টল ফ্লো (ডাউনলোড → প্যাকেজ ইনস্টলার পারমিশন)।

**একটাই APK কৌশল:** ফোন + leanback দুটো launcher-category-ই থাকবে — একই বাইনারি দুই জায়গায় চলবে, আলাদা বিল্ড লাগবে না। `Platform.isTV` দিয়ে runtime ভাগ।

### ❌ TV-তে যা হবে না / বাদ
- Cast বাটন (TV নিজেই টিভি — ইতিমধ্যে লুকানো)।
- PiP (বক্সে সাধারণত অর্থহীন, ইতিমধ্যে লুকানো)।

---

## 💻 অংশ ২: Desktop অ্যাপ (Windows/Mac/Linux)

### রুট নির্বাচন
> **🔑 মূল সিদ্ধান্ত (মালিকের সিদ্ধান্ত, সঠিক):** স্ক্র্যাপিং/স্ট্রিমিং **client-side-ই থাকবে** — প্রতিটা ইউজারের নিজের residential IP কাজ করবে। সার্ভার-প্রক্সি করলে সব ট্রাফিক ডেটাসেন্টার IP দিয়ে যেত → Cloudflare/provider সাথে সাথে ফ্ল্যাগ করত (cf_* যুদ্ধের অভিজ্ঞতা) আর সার্ভার ব্যান্ডউইথও শেষ হয়ে যেত।
>
> **Tauri-তে CORS-ই হয় না:** `tauri-plugin-http` রাস্ট-সাইডে নেটিভ রিকোয়েস্ট পাঠায় (ব্রাউজারের CORS নিয়ম প্রযোজ্য নয়)। তাই **desktop-এ সার্ভার প্রক্সি লাগবেই না** — axios+cheerio স্ক্র্যাপারগুলো সরাসরি ইউজারের IP থেকে চলবে। প্রক্সি শুধু ব্রাউজার/PWA-র জন্য optional।

| অপশন | বাস্তবতা | সুপারিশ |
|---|---|---|
| **A. React Native Web + Tauri** | UI কোড ৯০% রিইউজ + Tauri HTTP plugin-এ CORS নেই → স্ক্র্যাপার client-side residential IP-তেই চলে | ✅ **এটাই** |
| B. React Native Windows/macOS | নেটিভ মডিউল (mmkv-storage, video, torrent) পোর্ট করা প্রায় অসম্ভব পরিশ্রম | ❌ |
| C. শুধু ব্রাউজার/PWA | CORS-এ আটকে প্রক্সি লাগবেই — সার্ভার IP-ঝুঁকি; শুধু প্লে-ব্যাক পেজ হিসেবে দেখা যায় | ⚠️ পরে, সীমিত |

### 🔧 কাজের লিস্ট

**P0 — চালু হওয়া (client-first ক্রম):**
1. **Tauri shell আগেই বসানো** — খালি উইন্ডোতে RN-web bundle লোড + `tauri-plugin-http` চালু। CORS সমাধান এখানেই; প্রক্সি বাদ।
2. **expo-web বুটস্ট্র্যাপ** — `react-native-web` + Metro web এন্ট্রি; বর্তমানে ডিপেন্ডেন্সিতে RN-web **নেই** (আগের grep "react-native-web" ম্যাচটা আসলে `react-native-webview`-এর সাবস্ট্রিং ছিল)।
3. **HTTP রাউটিং লেয়ার** — নেটওয়ার্ক কোডে এক জায়গায় adapter: native-এ axios (আজকের মতোই), Tauri-তে `@tauri-apps/plugin-http`-এর fetch (একই axios signature) → স্ক্র্যাপার কোড অপরিবর্তিত থাকে, ইউজারের residential IP-তে চলে।
4. **স্টোরেজ অ্যাডাপ্টার** — `react-native-mmkv-storage` → web-এ localStorage/IndexedDB অ্যাডাপ্টার (settingsStorage/authStorage abstraction-এর পেছনে)।

**P1 — মিডিয়া:**
4. **Web প্লেয়ার কম্পোনেন্ট** — react-native-video-র জায়গায় HLS/DASH-এর জন্য hls.js + HTML5 video; `media-console` abstraction আগে থেকেই আছে — ওই ফাঁকে নতুন web implementation।
5. **কীবোর্ড কন্ট্রোল** — Space=play/pause, ←/→=seek, F=fullscreen, Esc, M=mute; ডেস্কটপের মূল আকর্ষণ।
6. **ডাউনলোড** — স্ট্রিমিং-ফার্স্ট (ডেস্কটপে ডাউনলোড পরে); লাগলে Tauri-র fs API দিয়ে সেভ।

**P2 — ফিচার-গেট ও প্ল্যাটফর্ম:**
7. `Platform.OS === 'web'` গেট: orientation locker, haptics, volume manager, cast, expo-navigation-bar, notifee, intent-launcher — সব স্কিপ।
7b. **WebView-নির্ভর প্রোভাইডার:** Taurি নিজেই webview — challenge/কুকি দরকারে আলাদা Tauri উইন্ডো খুলে কুকি শেয়ার করা যায় (মোবাইলের webview ফ্লোর ডেস্কটপ প্যারালাল)।
8. WebView-নির্ভর প্রোভাইডার → web-এ iframe/নতুন ট্যাব (যেগুলো সম্ভব না, মোবাইল-অনলি মার্ক)।
9. **টরেন্ট** — libtorrent4j Android-only; ডেস্কটপে বাদ, চাইলে পরে Tauri sidecar (aria2)।
10. Analytics/Crashlytics — web ব্রাঞ্চে Firebase JS SDK বা বাদ।

**P3 — ডেস্কটপ পলিশ:**
11. Tauri পলিশ — উইন্ডো/ট্রে/আইকন/ইনস্টলার + অটো-আপডেট (বিল্ট-ইন)।
12. CI-তে desktop বিল্ড জব (GitHub Actions, Windows runner)।

### ❌ Desktop-এ যা হবে না (প্রথম ভার্সনে)
- টরেন্ট ডাউনলোড (শেল-integration ছাড়া অসম্ভব)
- Cast-to-TV (Chromecast web sender সম্ভব, কিন্তু পরে)
- ফোন-স্টাইল জেসচার (পিঞ্চ-জুম ইত্যাদি) — কীবোর্ড/মাউস প্যারালাল দরকার

---

## 🗓️ প্রস্তাবিত ক্রম (সংক্ষেপে)
1. **সপ্তাহ ১:** TV leanback manifest + isTV গার্ড + প্লেয়ার D-pad ঠিক → প্রথম TV-ব্যবহারযোগ্য বিল্ড
2. **সপ্তাহ ২-৩:** D-pad নেভিগেশন পুরো অ্যাপে + TV হোম ভ্যারিয়েন্ট + পেয়ারিং
3. **সমান্তরাল (desktop):** Tauri shell + HTTP adapter (CORS-মুক্ত client-side স্ক্র্যাপিং, residential IP) + RN-web bootstrap + স্টোরেজ অ্যাডাপ্টার
4. **সপ্তাহ ৪:** Web প্লেয়ার + কীবোর্ড শর্টকাট → প্রথম desktop beta — সব ট্রাফিক ইউজারের নিজের IP-তে, সার্ভারে চাপ শূন্য
