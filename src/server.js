require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const database = require('./database');

const app = express();
const PORT = process.env.PORT;

const lessMiddleware = require('less-middleware');

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(lessMiddleware(path.join(__dirname, '../public')));
app.use(express.static(path.join(__dirname, '../public')));
app.use(session({
    secret: 'secret-key', // In production, use a secure random string
    resave: false,
    saveUninitialized: false
}));

// View Engine
const { engine } = require('express-handlebars');
const helpers = require('./helpers');

app.engine('handlebars', engine({
    helpers: helpers,
    defaultLayout: false, // We will use partials manualy for now to match the EJS structure
}));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, '../views'));

// Make user available to all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

const authRoutes = require('./routes/auth');

const indexRoutes = require('./routes/index');

// Routes
app.use('/', authRoutes);
app.use('/', indexRoutes);


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
