const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.enable('trust proxy');

const router = express.Router();
router.use(bodyParser.json());

const ds = require('./datastore');
const datastore = ds.datastore;
const fromDatastore = ds.fromDatastore;

const lb = require('./load_boats.js');
const get_boat_assigned_to_load = lb.get_boat_assigned_to_load;
const remove_load_from_boat = lb.remove_load_from_boat;
const remove_load_boat_relationship = lb.remove_load_boat_relationship;
const remove_all_loads_from_boat = lb.remove_all_loads_from_boat;
const get_load = lb.get_load;
const get_boat = lb.get_boat;
const BOATS = lb.BOATS;
const put_loads = lb.put_loads;
const checkJwt = lb.checkJwt;
const display_owner = lb.display_owner;

/* -------------            BOATS              ------------- */
/* ------------- Begin Boating Model Functions ------------- */
function post_boats(name, type, length, owner) {
    var key = datastore.key(BOATS);
    const new_boat = { "name": name, "type": type, "length": length, "owner": owner, "loads": [] };
    return datastore.save({ "key": key, "data": new_boat }).then(() => {
        new_boat.id = key.id;
        return new_boat;
    });
}

function get_boats(owner, offset) {
    let q;
    if (offset != null) {
        q = datastore.createQuery(BOATS).limit(6).offset(offset);
    } else {
        q = datastore.createQuery(BOATS).limit(6);
    }
    return datastore.runQuery(q).then((entities) => {
        return [entities[0].map(fromDatastore).filter(item => item.owner === owner), entities[1]];
    });
}

function put_boats(id, name, type, length) {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    const boats = { "name": name, "type": type, "length": length };
    return datastore.save({ "key": key, "data": boats });
}

async function patch_boats(id, body) {
    const key = datastore.key([BOATS, parseInt(id, 10)]);
    return get_boat(id).then(async (boat) => {
        for (var attribute in body) {
            boat[0][attribute] = body[attribute];
        }
        datastore.save({ "key": key, "data": boat[0] });
        return boat[0];
    });
}

function delete_boat(boat_id) {
    const key = datastore.key([BOATS, parseInt(boat_id, 10)]);
    return datastore.delete(key);

}

/* ------------- End Boating Model Functions ------------- */
/* ------------- Begin Controller Functions ------------- */

router.get('/', checkJwt, function (req, res) {
    get_boats(req.user.sub, req.query.offset).then((boats) => {
        for (const boat of boats[0]) {
            boat.self = req.protocol + '://' + req.hostname + '/boats/' + boat.id;
            if (boat.loads != null && boat.loads.length > 0) {
                boat.loads.forEach(load => {
                    load.self = req.protocol + '://' + req.hostname + '/loads/' + load.id;
                });
            }
        }
        if (boats[1].moreResults === 'MORE_RESULTS_AFTER_LIMIT') {
            const offset = (parseInt(req.query.offset)) || 0;
            boats[1].next = req.protocol + '://' + req.hostname + '/boats?offset=' + (offset + 6);
        }
        res.status(200).json(boats);
    });
});

router.get('/:id', function (req, res) {
    get_boat(req.params.id).then((boat) => {
        if (boat[0] != null) {
            boat[0].id = req.params.id;
            boat[0].self = req.protocol + '://' + req.hostname + req.originalUrl;
            if (boat[0].loads.length > 0) {
                boat[0].loads.forEach(load => {
                    load.self = req.protocol + '://' + req.hostname + '/loads/' + load.id;
                });
            }
            res.status(200).json(boat[0]);
        } else {
            res.status(404).json({ "Error": "No boat with this boat_id exists" });
        }
    }
    );
});



router.put('/:boat_id/loads/:load_id', function (req, res) {
    put_loads(req.params.boat_id, req.params.load_id)
        .then(response => {
            if (response == 404) {
                return res.status(404).json({
                    "Error": "The specified boat and/or load does not exist"
                });
            } else if (response == 204) {
                return res.status(204).end();
            } else if (response == 403) {
                return res.status(403).json({
                    "Error": "The load has already been assigned to a boat"
                });
            }
        });
});

router.get('/:id/loads', function (req, res) {
    get_boat(req.params.id).then(async boat => {
        if (boat[0] != null) {
            var load_array = [];
            if (boat[0].loads.length > 0) {
                for (load of boat[0].loads) {
                    const load_content = await get_load(load.id);
                    const load_id = load.id;
                    load_content[0].id = load_id;
                    load_content[0].self = req.protocol + '://' + req.hostname + '/loads/' + load.id;
                    load_array.push(load_content[0]);
                }
            }
            res.status(200).json(load_array);
        } else {
            res.status(404).json({ "Error": "No boat with this boat_id exists" });
        }
    }
    );
});

// Create new boat
router.post('/', checkJwt, function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('Server only accepts application/json data.')
    } else if (!(req.body.name && req.body.type && req.body.length)) {
        res.status(400).send({
            "Error": "The request object is missing at least one of the required attributes"
        });
    } else {
        post_boats(req.body.name, req.body.type, req.body.length, req.user.sub).then(key => {
            res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/' + key.id);
            res.status(201).send('{ "id": ' + key.id + ' }')
        });
    }
    // console.log('/ posted new content');
    // console.log(req.user);
});

router.put('/:id', checkJwt, function (req, res) {
    get_boat(req.params.id).then(boat => {
        if (boat[0] == null) {
            res.status(404).json({ "Error": "No boat with this boat_id exists" });
        } else if (boat[0].owner != req.user.sub) {
            res.status(401).send({ "Error": 'Unauthorized Request' });
        } else if (!(req.body.name && req.body.type && req.body.length)) {
            res.status(400).send({
                "Error": "The request object is missing at least one of the required attributes"
            });
        } else {
            put_boats(req.params.id, req.body.name, req.body.type, req.body.length)
                .then(res.status(200).end());
        }
    });
});

router.patch('/:id', checkJwt, function (req, res) {
    get_boat(req.params.id).then(boat => {
        if (boat[0] == null) {
            res.status(404).json({ "Error": "No boat with this boat_id exists" });
        } else if (boat[0].owner != req.user.sub) {
            res.status(401).send({ "Error": 'Unauthorized Request' });
        } else {
            patch_boats(req.params.id, req.body).then(new_boat => {
                new_boat.id = req.params.id;
                new_boat.self = req.protocol + '://' + req.hostname + req.originalUrl;
                res.status(200).json(new_boat);
            });
        }
    });
});

router.delete('/:id', checkJwt, function (req, res) {
    get_boat(req.params.id).then(async boat => {
        if (boat[0] == null) {
            res.status(404).json({ "Error": "No boat with this boat_id exists" });
        } else if (boat[0].owner != req.user.sub) {
            res.status(401).send({ "Error": 'Unauthorized Request' });
        } else {
            remove_all_loads_from_boat(req.params.id).then(() => {
                delete_boat(req.params.id);
                res.status(204).end();
            });
        }
    });
});

// Only removes the load from the boat
router.delete('/:boat_id/loads/:load_id', checkJwt, function (req, res) {
    get_boat_assigned_to_load(req.params.load_id).then(async result => {
        if (result[0] === undefined) {
            res.status(404).json({ "Error": "No boat with this boat_id is carrying this load with this load_id" });
        } else if (result[0].owner != req.user.sub) {
            res.status(401).send({ "Error": 'Unauthorized Request' });
        } else {
            if (result[0].boat_id == req.params.boat_id) {
                // If load belongs to boat:
                await remove_load_from_boat(req.params.load_id);
                remove_load_boat_relationship(req.params.load_id);
                res.status(204).end();
            } else {
                // If load doesn't belong to boat:
                res.status(403).json({ "Error": "This boat is not carrying this load" });
            }
        }
    });
});


/* ------------- End Controller Functions ------------- */

module.exports = router;