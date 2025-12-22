const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '../', envFile), quiet: true });

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const csurf = require('csurf');
const database = require('./database/database');

const app = express();
const PORT = process.env.PORT;

const lessMiddleware = require('less-middleware');

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://js.stripe.com", "https://*.stripe.com"],
            "img-src": ["'self'", "data:", "https://*.stripe.com"],
            "frame-src": ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://*.stripe.com"],
            "connect-src": ["'self'", "https://api.stripe.com", "https://*.stripe.com"],
            "form-action": ["'self'", "https://checkout.stripe.com", "https://*.stripe.com"],
            "upgrade-insecure-requests": process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    // crossOriginEmbedderPolicy: { policy: "require-corp" }
    crossOriginEmbedderPolicy: false // Disable COEP if it causes issues with external resources like Stripe
}));

// Set Cross-Origin-Resource-Policy for local assets to satisfy COEP
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
});
app.use(bodyParser.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'production') {
    app.use(lessMiddleware(path.join(__dirname, '../styles'), {
        dest: path.join(__dirname, '../public')
    }));
}
app.use(express.static(path.join(__dirname, '../public')));

// Session Configuration
const sessionConfig = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
};

if (process.env.NODE_ENV === 'production') {
    const MySQLStore = require('express-mysql-session')(session);
    sessionConfig.store = new MySQLStore({ 
        // express-mysql-session can use the existing mariadb pool if it supports standard pool interface
        // If not, we might need to pass connection details. 
        // Trying with pool first.
    }, database.pool);
}

app.use(session(sessionConfig));

// CSRF Protection
const csrfProtection = process.env.NODE_ENV === 'test' 
    ? (req, res, next) => { req.csrfToken = () => 'test-token'; next(); }
    : csurf();

app.use((req, res, next) => {
    csrfProtection(req, res, (err) => {
        if (err && err.code === 'EBADCSRF') {
            console.error('CSRF validation failed');
            console.error('Method:', req.method);
            console.error('URL:', req.url);
            console.error('Session ID:', req.sessionID);
            console.error('Session User:', req.session && req.session.user ? req.session.user.username : 'No session');
            console.error('Body has _csrf:', req.body && '_csrf' in req.body);
            // Don't log the full token/secret for security, but check existence
        }
        next(err);
    });
});

// View Engine
const { engine } = require('express-handlebars');
const helpers = require('./helpers');

app.engine('handlebars', engine({
    helpers: helpers,
    defaultLayout: false, // We will use partials manualy for now to match the EJS structure
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, '../views'));

// Make user and CSRF token available to all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    res.locals.csrfToken = req.csrfToken();
    next();
});

const homeRoutes = require('./routes/home');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const promotedRoutes = require('./routes/promoted');
const jobRoutes = require('./routes/jobs');
const userRoutes = require('./routes/users');
const staticRoutes = require('./routes/static');

// Routes
app.use('/', homeRoutes);
app.use('/auth', authRoutes);
app.use('/post', postRoutes);
app.use('/promoted', promotedRoutes);
app.use('/job', jobRoutes);
app.use('/user', userRoutes);
app.use('/', staticRoutes);

// 404 Handler
app.use((req, res, next) => {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// Global Error Handler
app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status);

    // For API requests, return JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.json({ error: err.message });
    }

    const message = (process.env.NODE_ENV === 'production' && status >= 500) 
        ? 'An unexpected error occurred.' 
        : err.message;

    res.render('pages/common/error', {
        message: message,
        statusCode: status,
        title: 'Error'
    });
});



const startServer = () => {
    const server = app.listen(PORT, () => {
        const protocol = process.env.APP_PROTOCOL || 'http';
        const domain = process.env.APP_DOMAIN || 'localhost';
        console.log(`Server running on ${protocol}://${domain}:${PORT}`);
    });

    const gracefulShutdown = () => {
        console.log('Received kill signal, shutting down gracefully');
        
        const forceShutdownTimer = setTimeout(() => {
            console.error('Could not close connections in time, forcefully shutting down');
            process.exit(1);
        }, 10000);

        // Unref the timer so it doesn't prevent the process from exiting if everything else closes
        if (forceShutdownTimer.unref) forceShutdownTimer.unref();

        server.close(() => {
            console.log('Closed out remaining connections');
            database.close().then(() => {
                 console.log('Database pool closed');
                 clearTimeout(forceShutdownTimer);
                 process.exit(0);
            }).catch((err) => {
                 console.error('Error closing database pool', err);
                 clearTimeout(forceShutdownTimer);
                 process.exit(1);
            });
        });
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // Ensure listeners are removed when server closes to prevent leaks in tests
    const originalClose = server.close.bind(server);
    server.close = (cb) => {
        process.removeListener('SIGTERM', gracefulShutdown);
        process.removeListener('SIGINT', gracefulShutdown);
        return originalClose(cb);
    };

    return server;
};

if (require.main === module) {
    startServer();
}

app.startServer = startServer;

module.exports = app;
