const router = module.exports = require('express').Router();
const bodyParser = require('body-parser');

router.use(bodyParser.json());
router.use(bodyParser.urlencoded({ extended: false }));

router.use('/boats', require('./boats'));
router.use('/loads', require('./loads'));
router.use('/', require('./welcome'));