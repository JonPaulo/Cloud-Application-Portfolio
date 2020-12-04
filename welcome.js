const express = require('express');
const bodyParser = require('body-parser');

const ejs = require('ejs');
const request = require('request');

const app = express();

app.enable('trust proxy');

const router = express.Router();
// router.use(bodyParser.json());

const ds = require('./datastore');
const datastore = ds.datastore;


const lb = require('./load_boats.js');
const CLIENT_ID = lb.CLIENT_ID;
const CLIENT_SECRET = lb.CLIENT_SECRET;
const DOMAIN = lb.DOMAIN;
const USERS = lb.USERS;
const display_owner = lb.display_owner;


function save_user(email, user_id) {
    var key = datastore.key(USERS);
    const data = { 'email': email, 'user_id': user_id };
    return datastore.save({ "key": key, "data": data }).then(() => {
        return data;
    });
}

function get_users() {
    const q = datastore.createQuery(USERS);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(ds.fromDatastore);
    });
}

/* ------------- Begin Controller Functions ------------- */

// Start Page
router.get('/', function (req, res) {
    return res.render(__dirname + '/views/welcome.ejs');
});

// Get Users
router.get('/users', function (req, res) {
    const accepts = req.accepts('application/json');
    if (!accepts) {
        return res.status(406).send('Format not acceptable. \'application/json\' required');
    } 
    get_users().then((users) => {
        res.status(200).json(users);
    });
});

// Return token info on web page
router.post('/login', function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    var options = {
        method: 'POST',
        url: `https://${DOMAIN}/oauth/token`,
        headers: { 'content-type': 'application/json' },
        body:
        {
            grant_type: 'password',
            username: username,
            password: password,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET
        },
        json: true
    };
    request(options, (error, response, body) => {
        if (error) {
            res.status(500).send(error);
        } else if (body.error === 'invalid_grant') {
            return res.status(400).render(__dirname + '/views/error.ejs', { error: body.error, policy: body.error_description });
        } else {
            return res.render(__dirname + '/views/userinfo.ejs', { access_token: body.access_token, user_id: display_owner(body) });
        }
    });
});

// Redirect sign-up info
router.post('/signup', function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    var options = {
        method: 'POST',
        url: `https://${DOMAIN}/dbconnections/signup`,
        headers: { 'content-type': 'application/json' },
        body:
        {
            email: username,
            password: password,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            connection: 'Username-Password-Authentication',
        },
        json: true
    };
    console.log('/signup activated');
    request(options, (error, response, body) => {
        if (error) {
            res.status(500).send(error);
        } else if (body.error === 'invalid_grant') {
            return res.status(400).render(__dirname + '/views/error.ejs', { error: body.error, policy: body.error_description });
        } else {
            console.log('body 1');
            console.log(body);
            const email = body.email;
            // Redirect to display token
            const username = req.body.username;
            const password = req.body.password;
            var options = {
                method: 'POST',
                url: `https://${DOMAIN}/oauth/token`,
                headers: { 'content-type': 'application/json' },
                body:
                {
                    grant_type: 'password',
                    username: username,
                    password: password,
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET
                },
                json: true
            };
            request(options, (error, response, body) => {
                if (error) {
                    res.status(500).send(error);
                } else {
                    const user_id = display_owner(body);
                    save_user(email, user_id);
                    return res.render(__dirname + '/views/userinfo.ejs', { access_token: body.access_token, user_id: user_id });
                }
            });
        }
    });
});

/* ------------- End Controller Functions ------------- */

module.exports = router;