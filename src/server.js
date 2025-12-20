const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, '../', envFile) });

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const csurf = require('csurf');
const database = require('./database');

const app = express();
const PORT = process.env.PORT;

const lessMiddleware = require('less-middleware');

// Middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "'unsafe-inline'", "https://js.stripe.com"],
            "frame-src": ["'self'", "https://js.stripe.com"],
            "connect-src": ["'self'", "https://api.stripe.com"]
        }
    },
    crossOriginEmbedderPolicy: { policy: "require-corp" }
}));

// Set Cross-Origin-Resource-Policy for local assets to satisfy COEP
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
});
app.use(bodyParser.urlencoded({ extended: true }));
app.use(lessMiddleware(path.join(__dirname, '../styles'), {
    dest: path.join(__dirname, '../public')
}));
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

// CSRF Protection
const csrfProtection = csurf();
app.use(csrfProtection);

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

const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const promotedRoutes = require('./routes/promoted');
const jobRoutes = require('./routes/jobs');
const userRoutes = require('./routes/users');
const staticRoutes = require('./routes/static');

// Routes
app.use('/', authRoutes);
app.use('/', postRoutes);
app.use('/', promotedRoutes);
app.use('/', jobRoutes);
app.use('/', userRoutes);
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
    res.status(status);

    // For API requests, return JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        return res.json({ error: err.message });
    }

    res.render('pages/error', {
        message: err.message,
        statusCode: status,
        title: 'Error'
    });
});



const server = app.listen(PORT, () => {
    const protocol = process.env.APP_PROTOCOL || 'http';
    const domain = process.env.APP_DOMAIN || 'localhost';
    console.log(`Server running on ${protocol}://${domain}:${PORT}`);
});

const gracefulShutdown = () => {
    console.log('Received kill signal, shutting down gracefully');
    server.close(() => {
        console.log('Closed out remaining connections');
        database.close().then(() => {
             console.log('Database pool closed');
             process.exit(0);
        }).catch((err) => {
             console.error('Error closing database pool', err);
             process.exit(1);
        });
    });

    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
