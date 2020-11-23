const express = require('express');
const app = express();

app.use('/', require('./index'), function (err, req, res, next) {
    if (req.method === 'POST' && err.name === 'UnauthorizedError') {
        res.status(401).send({ "Error": 'Invalid Token' });
    } else if (req.method === 'GET' && err.name === 'UnauthorizedError') {
        console.log('invalid token');
        res.status(401).send({ "Error": 'Invalid Token' });
    } else if (req.method === 'DELETE' && err.name === 'UnauthorizedError') {
        res.status(401).send({ "Error": 'Invalid Token' });
    }
});

app.use('/', express.static('public'));
app.set('view engine', 'ejs');
app.enable('trust proxy');


// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});