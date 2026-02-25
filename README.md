# 🏋️ Iron Track - Workout Tracker PWA

A Progressive Web App for tracking workouts with cloud sync, multi-user support, and offline capabilities. Log sets, reps, and weight for any exercise, track your progress over time, and access your data from any device.

https://justdumbrobots.github.io/IronTracker/

## ✨ Features

### 🔐 Multi-User Authentication
- Email/password signup and login
- Google authentication
- Secure user data isolation
- Cloud sync across all devices

### 💪 Workout Tracking
- **Multi-day workout plans** - Create programs with multiple workout days (Push/Pull/Legs, Upper/Lower, etc.)
- **Smart set logging** - Previous performance displayed for progressive overload
- **Auto rest timer** - 2-minute countdown with vibration alerts
- **Exercise library** - 30+ pre-loaded exercises + add your own
- **Workout rotation** - Automatically cycles through workout days in sequence

### 📊 Progress Analytics
- Total workout count and volume
- Weekly workout frequency
- Personal records (PRs) for all exercises
- Volume trend chart
- Complete workout history

### 📱 Progressive Web App
- **Installable** - Add to home screen on iOS, Android, and Desktop
- **Offline mode** - Works without internet after first load
- **Fast loading** - Cached assets for instant startup
- **Responsive design** - Optimized for mobile use in the gym

## 🚀 Live Demo

https://justdumbrobots.github.io/IronTracker/

## 🛠️ Tech Stack

- **Frontend:** Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Authentication:** Firebase Authentication
- **Database:** Cloud Firestore (NoSQL)
- **PWA:** Service Workers, Web App Manifest
- **Hosting:** GitHub Pages
- **UI:** Custom CSS with CSS Variables (no frameworks)

## 🎯 Usage

### Create an Account
1. Open the app
2. Click **"Sign up"**
3. Enter email and password
4. Or use **"Sign in with Google"**

### Create a Workout Plan
1. Go to **Plans** tab
2. Click **"+ New Plan"**
3. Add workout days (e.g., "Push Day", "Pull Day", "Leg Day")
4. Add exercises to each day with sets and target reps
5. Click **"Save Plan"**

### Start a Workout
1. Go to **Workout** tab
2. Select your plan (if not already selected)
3. Click **"▶ Start Workout"**
4. Enter weight and reps for each set
5. Click **"✓ Complete"** after each set
6. Rest timer starts automatically
7. Click **"Finish Workout"** when done

### Track Progress
1. Go to **Progress** tab
2. View total workouts, volume, and PRs
3. See volume trend chart
4. Review workout history

### Add Custom Exercises
1. When creating/editing a plan
2. Type exercise name in the input field
3. Click **"New Exercise"** button
4. Exercise is added to your library for future use

## 🗂️ Project Structure
```
iron-track/
├── index.html              # Main HTML structure
├── styles.css              # All styling (CSS variables)
├── app.js                  # Main application logic
├── firebase-config.js      # Firebase configuration
├── service-worker.js       # PWA offline functionality
├── manifest.json           # PWA manifest
├── icons/                  # App icons
│   ├── icon-192.png
│   └── icon-512.png
└── README.md              # This file
```

## 🔒 Security & Privacy

- ✅ **User data isolation** - Each user can only access their own data
- ✅ **Secure authentication** - Handled by Firebase Authentication
- ✅ **HTTPS only** - All connections encrypted
- ✅ **No analytics** - No tracking or data collection
- ✅ **Open source** - Audit the code yourself

## 🌐 Browser Support

| Browser | Version |
|---------|---------|
| Chrome  | 90+     |
| Safari  | 14+     |
| Firefox | 88+     |
| Edge    | 90+     |

## 🐛 Troubleshooting

### Loading screen stuck
- Check browser console (F12) for errors
- Verify `firebase-config.js` has real values (not placeholders)
- Ensure Firebase Authentication is enabled
- Ensure Firestore database is created

### "Unauthorized domain" error
- Add your GitHub Pages domain to Firebase authorized domains
- Go to Firebase Console → Authentication → Settings → Authorized domains

### Google sign-in not working
- Verify Google authentication is enabled in Firebase
- Add domain to authorized domains (see above)
- Email/password should still work

### Workout data not syncing
- Check internet connection
- Verify you're logged in
- Check browser console for Firebase errors
- Verify Firestore rules are published

## 🤝 Contributing

Contributions welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 Future Enhancements

- [ ] Export workout data to CSV
- [ ] Body weight tracking
- [ ] Exercise video library
- [ ] Custom rest timer durations per exercise
- [ ] Workout templates marketplace
- [ ] Social features (share workouts)
- [ ] Progress photos
- [ ] Plate calculator
- [ ] Dark/light theme toggle


## 🙏 Acknowledgments

- Firebase for authentication and database
- Google Fonts (Barlow Condensed, Work Sans)
- GitHub Pages for hosting

## 📧 Contact

Justin - justdumbrobots@gmail.com


Project Link: https://justdumbrobots.github.io/IronTracker/

---

**Built with 💪 for gains**

*No frameworks • No dependencies • Pure vanilla JavaScript*
