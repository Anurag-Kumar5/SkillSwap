module.exports = {
  /**
   * Middleware to protect routes for authenticated users only
   * Redirects to login page if not authenticated
   */
  ensureAuthenticated: (req, res, next) => {
  // Allow static files
  if (req.path.startsWith('/public/') || req.path === '/favicon.ico') {
    return next();
  }

  // If authenticated, proceed
  if (req.isAuthenticated()) {
    return next();
  }

  // Store intended URL for redirect after login
  if (!['/login', '/signup', '/auth/google'].includes(req.originalUrl)) {
    req.session.returnTo = req.originalUrl;
  }

  //  If the request is expecting JSON (API), send JSON instead of redirect
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  //  Otherwise, redirect as usual
  req.flash('error', 'Please log in to access this page');
  return res.redirect('/login');
},

  /**
   * Middleware to protect routes for guests only
   * Redirects to profile if already authenticated
   */
  ensureGuest: (req, res, next) => {
    // Allow access to static files
    if (req.path.startsWith('/public/') || req.path === '/favicon.ico') {
      return next();
    }

    if (!req.isAuthenticated()) {
      return next();
    }

    // Only redirect to profile if coming from auth pages
    const referer = req.get('Referer');
    if (referer && ['/login', '/signup'].some(path => referer.includes(path))) {
      req.flash('info', 'You are already logged in');
      return res.redirect('/profile');
    }
    
    return next(); // Allow access to auth pages even when logged in
  },

  /**
   * Middleware to check admin privileges
   * Redirects to home if not admin
   */
  ensureAdmin: (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === 'admin') {
      return next();
    }
    
    // Don't flash error if not authenticated (ensureAuthenticated will handle it)
    if (req.isAuthenticated()) {
      req.flash('error', 'Admin privileges required');
    }
    return res.redirect('/');
  },

  /**
   * Middleware to store the returnTo URL in session
   */
  storeReturnTo: (req, res, next) => {
    // Clear returnTo after successful login to prevent loops
    if (req.session.returnTo && req.path === '/profile') {
      delete req.session.returnTo;
    }
    
    if (req.session.returnTo) {
      res.locals.returnTo = req.session.returnTo;
    }
    return next();
  }
};