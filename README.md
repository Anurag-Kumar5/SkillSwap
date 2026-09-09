# SkillSwap 🔄

**SkillSwap** is a peer-to-peer skill exchange platform designed to help users teach the skills they have and learn the skills they want, all without tuition fees. Connect, swap skills, and grow together!

![SkillSwap Platform](https://img.shields.io/badge/Status-Active-success)
![Node.js](https://img.shields.io/badge/Node.js-v18+-339933?logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-Backend-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?logo=mongodb&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-Real--Time-010101?logo=socket.io&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-Video_Calls-333333?logo=webrtc&logoColor=white)

---

## ✨ Features

- **Authentication System**: Traditional Email/Password signup and Google OAuth via Passport.js.
- **Skill Discovery**: Browse and filter users by categories (Tech, Music, Art, Language, etc.).
- **Real-Time Chat & Video Calls**: Fully functional real-time messaging and peer-to-peer WebRTC video calling embedded directly in the browser.
- **Modern SaaS Interface**: Clean, premium, fully responsive UI with dark mode support.
- **Gamification**: Earn XP points, level up, and rank on the global leaderboard.
- **Review System**: Leave feedback and star ratings for your exchange partners.
- **Live Notifications**: Get instantly notified about new swap requests, accepted swaps, and incoming messages.
- **Admin Dashboard**: Manage users and view platform analytics.

## 🛠️ Tech Stack

- **Frontend**: HTML5, EJS templating, Vanilla CSS (Custom Design System), Bootstrap 5 (Grid/JS components).
- **Backend**: Node.js, Express.js.
- **Database**: MongoDB (Mongoose ORM).
- **Real-time & Video**: Socket.io, WebRTC (SimplePeer).
- **Authentication**: Passport.js (Local Strategy & Google OAuth2.0).

## 🚀 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [MongoDB](https://www.mongodb.com/) installed on your machine.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Anurag-Kumar5/SkillSwap.git
   cd SkillSwap
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Create a `.env` file in the root directory and add the following keys:
   ```env
   PORT=3000
   MONGO_URI=your_mongodb_connection_string
   SESSION_SECRET=your_session_secret
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## 🎨 UI / UX Redesign
The frontend features a completely bespoke, professional CSS design system built from the ground up:
- **`design-system.css`**: Core design tokens (Inter typography, carefully crafted color palettes, modern shadow elevations).
- **`components.css`**: Reusable premium UI elements (glassmorphism cards, customized inputs, badges, and avatars).
- **`layout.css`**: Scalable grid configurations and layout shells.
- **`responsive.css`**: Fluid constraints for mobile, tablet, and desktop viewing.

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check out the [issues page](https://github.com/Anurag-Kumar5/SkillSwap/issues).

## 📝 License
This project is open-source and available under the [MIT License](LICENSE).
