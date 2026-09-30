# TV UP-কী ফোকাস টেস্ট প্ল্যান — Home content → Top Navigation Bar

**লক্ষ্য:** Android TV-তে Home স্ক্রিনের যেকোনো কনটেন্ট এলিমেন্ট থেকে D-pad **UP** চেপে
top navigation bar-এ পৌঁছানো যায়, আর **BACK** দিয়ে আবার কনটেন্টে ফোকাস ফেরে।

**ডিভাইস:** Android TV (D-pad রিমোট), বিল্ড ≥ v5.7.15 (216) + OTA `711fe8c9` বা পরবর্তী।

---

## ১. ট্রাভার্সাল পাথ ম্যাপ (উপর → নিচ)

```
Top bar (TvTabBar)                 ← লক্ষ্য; UP/BACK দিয়ে পৌঁছানো যায়
  ↓ DOWN
Hero overlay: profile chip, menu   ← TV-ফোকাসেবল (TvFocusable); chip → প্রোফাইল মডাল,
                                      menu → ProviderDrawer (দুটোই নিচে দেখুন)
  ↓ DOWN
HeroStrip (overlap strip)          ← active card: poster→play; mini: রিং
  ↓ DOWN
ContinueWatching row               ← MediaPosterCard (আগেই ফোকাসেবল)
  ↓ DOWN
FriendsActivityRow                 ← এই প্যাচে ফোকাসেবল করা হলো (activity + recs)
  ↓ DOWN
Home sliders / mid-ads             ← MediaPosterCard / AdBox (নন-ইন্টারঅ্যাকটিভ ঠিক)

সাব-সার্কিট (প্রবেশযোগ্য ওভারলে):
ProviderDrawer (menu থেকে)   : [বন্ধ করুন ← initial focus] → প্রোভাইডার আইটেম...
ProfileSwitcherModal (chip থেকে): [লগইন (গেস্ট) | অ্যাভাটারগ্রিড + ফুটার বাটন]
```

**মূল নিয়ম:** UP পাথের প্রতিটা স্তরে অন্তত একটা ফোকাসেবল এলিমেন্ট থাকতে হবে —
একটা স্তরে কোনো ফোকাসেবল না থাকলে Android ফোকাস সেই স্তর **স্কিপ** করে না বরং
আটকে যেতে পারে বা ভুল দিকে যেতে পারে।

---

## ২. এই প্যাচে ঠিক করা ফাঁক (fix-এর আগের অবস্থা)

| # | ফাঁক | ফাইল | ফিক্স |
|---|------|------|-------|
| 1 | HeroStrip-এর Pressable-এ `focusable` প্রপ নেই → TV-তে স্ট্রিপ সম্পূর্ণ নন-ইন্টারঅ্যাকটিভ, UP পাথ ভেঙে যায় | `src/components/HeroStrip.tsx` | `focusable={isTv}` + `onFocus/onBlur`-চালিত রিং |
| 2 | HeroStrip-এ `tvFocusRing` স্টাইল শর্তহীন বসানো → ফোকাস না থাকলেও সব মিনিতে 3px রিং দেখাত | `src/components/HeroStrip.tsx` | রিং এখন ফোকাস-ড্রিভেন, blur-এ transparent (layout shift নেই) |
| 3 | Hero active card-এ ৩টা Pressable (poster/title/play) → ফোকাস ভেতরে পিং-পং করত | `src/components/HeroStrip.tsx` | title নন-ফোকাসেবল; poster→play দুই-স্টপ |
| 4 | FriendsActivityRow-এর ২টা Pressable-ও ফোকাসেবল নয় → স্কিপ/আটকানো | `src/components/FriendsActivityRow.tsx` | শেয়ার্ড `TvFocusable` (`ui/TvFocusable.tsx`) |
| 5 | ProviderDrawer সম্পূর্ণ নন-ফোকাসেবল + ক্লোজ বাটনই নেই → TV-তে খুললে আটকে যাওয়া | `src/components/ProviderDrawer.tsx` | আইটেম + নতুন "বন্ধ করুন" বাটন TvFocusable; বাটনে `hasTVPreferredFocus` |
| 6 | Hero menu বাটন ও ProfileAvatarChip নন-ফোকাসেবল → drawer/profile সার্কিট অগম্য | `src/components/Hero.tsx`, `src/components/ProfileSwitcher.tsx` | উভয়েই TvFocusable (menu-র রিং heroColor-এ) |
| 7 | ProfileSwitcherModal-এর সব অ্যাকশন (login/avatar/edit-badge/footer) নন-ফোকাসেবল → chip ফোকাসেবল হলেও মডাল অচল | `src/components/ProfileSwitcher.tsx` | সব অ্যাকশন TvFocusable; গেস্ট-অবস্থায় লগইন বাটনে `hasTVPreferredFocus` |

---

## ৩. ম্যানুয়াল টেস্ট কেস

প্রতিটা কেসে প্রথমে Home-এ থাকতে হবে, ট্যাব ফোকাস **না-ও** থাকতে পারে।

### A. UP-ট্রাভার্সাল (নিচ থেকে উপরে)
| কেস | শুরু | অ্যাকশন | প্রত্যাশিত ফলাফল |
|-----|------|---------|------------------|
| A1 | প্রথম slider-এর কোনো পোস্টার | UP | ContinueWatching row-তে ফোকাস (রিং) |
| A2 | ContinueWatching কার্ড | UP | HeroStrip-এ ফোকাস — mini-তে রিং বা active card-এ poster/play |
| A3 | HeroStrip mini | UP | Top bar-এর কোনো ট্যাবে রিং (সাধারণত সক্রিয় ট্যাবের দিকে) |
| A4 | HeroStrip active card | UP × ২ | poster/play → top bar |
| A5 | FriendsActivityRow chip | UP | ContinueWatching-এ ফোকাস, তারপর A2-পাথ |
| A6 | যেকোনো কনটেন্ট ফোকাস | BACK | Top bar-এর সক্রিয় ট্যাবে রিং (back-to-focus) |
| A7 | Top bar ফোকাসড | DOWN | আগের কনটেন্টে ফোকাস ফেরে |
| A8 | Hero এলাকায় ফোকাস | UP | profile chip বা menu বাটনে রিং (দুটোই এখন ফোকাসেবল) |
| A9 | menu বাটনে OK | — | ProviderDrawer খোলে; **"বন্ধ করুন" বাটনে স্বয়ংক্রিয় ফোকাস** |
| A10 | Drawer খোলা | DOWN | প্রোভাইডার আইটেমে রিং; সক্রিয় আইটেমে ✓ চিহ্ন |
| A11 | ভিন্ন প্রোভাইডারে OK | — | প্রোভাইডার সেট + drawer বন্ধ; হোম রিফ্রেশ |
| A12 | Drawer-এর "বন্ধ করুন"-এ OK | — | Drawer বন্ধ; ফোকাস কনটেন্টে ফেরে |
| A13 | profile chip-এ OK | — | "কে দেখছে?" মডাল খোলে (গেস্ট হলে লগইন বাটনে ফোকাস) |
| A14 | মডালে অ্যাভাটারে OK | — | প্রোফাইল সুইচ + মডাল বন্ধ; edit-badge আলাদা ফোকাস-স্টপ |
| A15 | মডাল খোলা অবস্থায় BACK | — | মডাল বন্ধ (`onRequestClose`); ফোকাস chip-এ ফেরা উচিত |

### B. Top bar থেকে ট্যাব বদল
| কেস | অ্যাকশন | প্রত্যাশিত |
|-----|---------|-----------|
| B1 | LEFT/RIGHT | ট্যাব-টু-ট্যাব রিং সরে; কোনো স্ক্রিন বদল নয় |
| B2 | সক্রিয় ট্যাবে OK | স্ট্যাক popToTop (আগের আচরণ) |
| B3 | ভিন্ন ট্যাবে OK | ট্যাব সুইচ; কনটেন্ট এলাকায় ফোকাস স্বয়ংক্রিয় যায় কি না নোট করো |
| B4 | ট্যাব সুইচের পরে BACK | আগের ট্যাবে ফোকাস ফেরে (নন-রুট পেজে স্ট্যাক-পপ আগে) |

### C. রিগ্রেশন (গার্ড)
| কেস | অ্যাকশন | প্রত্যাশিত |
|-----|---------|-----------|
| C1 | Home-এ DOWN × N | সব রো ভেদ করে স্ক্রল করে নিচে পৌঁছায় |
| C2 | HeroStrip mini-তে OK | মিনিটা active হয় (onSelect), Info নয় |
| C3 | active card-এ OK | Info স্ক্রিন খোলে |
| C4 | Friends chip-এ OK | বন্ধুর দেখা কনটেন্টের Info খোলে |
| C5 | মোবাইল | কোনো ভিজ্যুয়াল/আচরণ বদল নেই (রিং/focusable শুধু isTV) |
| C6 | ফোকাস-লুপ টেস্ট | UP/DOWN ২০ বার চাপা — এক জায়গায় আটকে থাকে না, ভুল স্ক্রিনে যায় না |

### D. অন্যান্য স্ক্রিনের BACK (top bar থাকায় বদলানো আচরণ)
| কেস | শুরু | BACK | প্রত্যাশিত |
|-----|------|------|-----------|
| D1 | Search ফলাফল | BACK | top bar ফোকাস (Home-এর মতোই) |
| D2 | WatchList | BACK | top bar ফোকাস |
| D3 | Downloads | BACK | top bar ফোকাস |
| D4 | Settings (রুট) | BACK | top bar ফোকাস |
| D5 | Settings → Friends (সাব-পেজ) | BACK | Settings রুটে পপ — **top bar ফোকাস নয়** |
| D6 | Info/Player (রুট স্ট্যাক) | BACK | স্ক্রিন পপ; তারপর Home-এ A6 প্রযোজ্য |

---

## ৪. অটোমেটেড যাচাই (কমান্ড)

```bash
cd /c/Users/NeiL/Downloads/CineBD
# ১. টাইপচেক (src/ এ এরর শূন্য হতে হবে)
npx tsc --noEmit 2>&1 | grep -cE "^src/"
# ২. ফোকাস-প্যাটার্ন অডিট: UP-পাথের স্তরগুলোতে focusable আছে কি না
grep -n "focusable" src/components/HeroStrip.tsx src/components/FriendsActivityRow.tsx src/components/MediaPosterCard.tsx
# ৩. ট্যাব-বার back-handler আছে কি না
grep -n "hardwareBackPress" src/components/navigation/StreamingTabBar.tsx
```

প্রত্যাশিত: (১) = 0; (২) প্রতিটা ফাইলে `focusable={isTv}`/`focusable` লাইন দেখায়; (৩) back-handler লাইন দেখায়।

---

## ৫. পরিচিত সীমাবদ্ধতা / ফলো-আপ

- ~~Hero overlay ও ProviderDrawer নন-ফোকাসেবল~~ → ঠিক হয়েছে (A8–A15): drawer-এ ক্লোজ বাটন যোগ হয়েছে (initial focus), profile মডালের সব অ্যাকশন ফোকাসেবল। শেয়ার্ড র‍্যাপার: `src/components/ui/TvFocusable.tsx`।
- B3-তে ট্যাব-সুইচের পরে ফোকাস যেখানে যায় (bar-এই থাকে) — এটা RN ট্রাভার্সালের স্বাভাবিক আচরণ; চাইলে পরে স্ক্রিনের প্রথম এলিমেন্টে `hasTVPreferredFocus` দিয়ে নামানো যাবে।
- `FriendsActivityRow` শুধু লগইন+বন্ধু থাকলে রেন্ডার হয় — ফাঁকা স্টেটে A5 প্রযোজ্য নয়।
- Drawer-এর "বন্ধ করুন" বাটন শুধু TV-তে রেন্ডার হয় — টাচ ডিভাইসে অপরিবর্তিত (swipe-বন্ধ)।
- প্রোফাইল মডালের ব্যাকড্রপ-প্রেস (বাইরে চাপলে বন্ধ) নন-ফোকাসেবল রাখা হয়েছে ইচ্ছাকৃতভাবে — BACK (A15) সেই কাজই করে।
