require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const flash = require('connect-flash');
const path = require('path');
const http = require('http');                     
const { Server } = require('socket.io');          

const User = require('./models/User');
const Admin = require('./models/Admin');
const skillsRouter = require('./routes/skills');
const swapRoutes = require('./routes/swaps');
const methodOverride = require('method-override');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);           
const io = new Server(server);                     

// Middleware to inject io instance into all requests
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Expose logged-in user and flash messages to all views
app.use((req, res, next) => {
  res.locals.user = req.user;
  res.locals.messages = req.flash ? req.flash() : {};
  next();
});

// ======================
// 1. MIDDLEWARE SETUP
// ======================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(flash());

// ======================
// 2. SESSION CONFIG
// ======================
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ======================
// 3. PASSPORT INIT
// ======================
app.use(passport.initialize());
app.use(passport.session());

// ======================
// 4. DATABASE CONNECTION
// ======================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

// ======================
// 5. AUTH STRATEGIES
// ======================

// Local Strategy for Users
passport.use('user-local', new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      const sanitizedEmail = email.toLowerCase().trim();
      const user = await User.findOne({ email: sanitizedEmail }).select('+password');
      if (!user) return done(null, false, { message: 'User not found' });
      if (!user.password) return done(null, false, { message: 'Password not set. Use Google login.' });
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password' });
      }
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// Local Strategy for Admins
passport.use('admin-local', new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
    try {
      const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
      if (!admin) {
        return done(null, false, { message: 'Admin not found' });
      }
      const isMatch = await admin.comparePassword(password);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password' });
      }
      return done(null, admin);
    } catch (err) {
      return done(err);
    }
  }
));

// Serialize/Deserialize
passport.serializeUser((user, done) => {
  done(null, {
    id: user.id,
    type: user instanceof Admin ? 'admin' : 'user',
    role: user.role
  });
});

passport.deserializeUser(async (obj, done) => {
  try {
    const Model = obj.type === 'admin' ? Admin : User;
    const user = await Model.findById(obj.id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || "/auth/google/callback",
  passReqToCallback: true,
  proxy: true
}, async (req, accessToken, refreshToken, profile, done) => {
  try {
    if (!profile.emails?.[0]?.value) {
      throw new Error('Email permission not granted');
    }

    const email = profile.emails[0].value;
    const existingUser = await User.findOne({ 
      $or: [{ email }, { googleId: profile.id }]
    });

    if (existingUser) {
      if (!existingUser.googleId) {
        existingUser.googleId = profile.id;
        await existingUser.save();
      }
      return done(null, existingUser);
    }

    const baseUsername = profile.displayName 
      ? profile.displayName.replace(/\s+/g, '_').toLowerCase()
      : email.split('@')[0];
    
    let username = baseUsername;
    let counter = 1;

    while (await User.exists({ username })) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const newUser = await User.create({
      googleId: profile.id,
      username,
      name: profile.displayName || email.split('@')[0],
      email,
      isVerified: true
    });

    done(null, newUser);
  } catch (err) {
    done(err);
  }
}));

// ======================
// 6. SOCKET.IO EVENTS
// ======================
io.on('connection', (socket) => {
  console.log('🟢 New client connected:', socket.id);

  socket.on('joinRoom', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined their room`);
  });

  // WebRTC signaling (legacy handlers)
  socket.on('webrtc-offer', ({ toUserId, offer }) => {
    if (toUserId && offer) socket.to(toUserId).emit('webrtc-offer', { fromSocketId: socket.id, offer });
  });
  socket.on('webrtc-answer', ({ toUserId, answer }) => {
    if (toUserId && answer) socket.to(toUserId).emit('webrtc-answer', { fromSocketId: socket.id, answer });
  });
  socket.on('webrtc-ice-candidate', ({ toUserId, candidate }) => {
    if (toUserId && candidate) socket.to(toUserId).emit('webrtc-ice-candidate', { fromSocketId: socket.id, candidate });
  });

  // WebRTC signaling (frontend v2 payloads used by chat.ejs)
  socket.on('webrtc-offer', (payload) => {
    const { to, from, swapId, sdp } = payload || {};
    if (to && sdp) {
      socket.to(to).emit('webrtc-offer', { to, from, swapId, sdp });
    }
  });
  socket.on('webrtc-answer', (payload) => {
    const { to, from, swapId, sdp } = payload || {};
    if (to && sdp) {
      socket.to(to).emit('webrtc-answer', { to, from, swapId, sdp });
    }
  });
  socket.on('webrtc-ice', (payload) => {
    const { to, from, swapId, candidate } = payload || {};
    if (to && candidate) {
      socket.to(to).emit('webrtc-ice', { to, from, swapId, candidate });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Client disconnected:', socket.id);
  });
});

// ======================
// 7. ROUTES
// ======================
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use(methodOverride('_method'));

// Web Routes
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/skills', skillsRouter);

// API Routes
app.use('/api/swaps', swapRoutes);

// ======================
// 8. ERROR HANDLING
// ======================
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const errorMessage = process.env.NODE_ENV === 'development' 
    ? err.message 
    : 'Something went wrong!';
  if (req.accepts('json')) {
    return res.status(500).json({ error: errorMessage });
  }
  res.status(500).render('error', { 
    error: errorMessage,
    user: req.user
  });
});

// ======================
// 9. CATCH-ALL ROUTE
// ======================
app.get('*', (req, res) => {
  res.redirect('/');
});

// ======================
// 10. SERVER START
// ======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
   Server running at:
   Local:   http://localhost:${PORT}
   Admin:   http://localhost:${PORT}/admin/login
  `);
});
