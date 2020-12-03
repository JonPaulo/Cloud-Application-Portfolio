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

const lb = require('./load_boats');
const get_boat = lb.get_boat;
const get_load = lb.get_load;
const get_boat_assigned_to_load = lb.get_boat_assigned_to_load;
const remove_load_boat_relationship = lb.remove_load_boat_relationship;
const LOADS = lb.LOADS;
const LOAD_BOAT = lb.LOAD_BOAT;
const remove_load_from_boat = lb.remove_load_from_boat;
const checkJwt = lb.checkJwt;

/* -------------            LOADS           ------------- */
/* ------------- Begin Load Model Functions ------------- */

function get_loads(owner, offset) {
    let q;
    if (offset != null) {
        q = datastore.createQuery(LOADS).limit(5).offset(offset);
    } else {
        q = datastore.createQuery(LOADS).limit(5);
    }

    return datastore.runQuery(q).then(async entities => {
        const count = await datastore.runQuery(datastore.createQuery(LOADS));
        entities[1].totalItems = count[0].length;
        return [entities[0].map(fromDatastore).filter(item => item.owner === owner), entities[1]];
    });
}

async function post_loads(weight, content, quantity, owner) {
    var key = datastore.key(LOADS);
    const new_load = { "weight": weight, "content": content, "quantity": quantity, "owner": owner };
    return datastore.save({ "key": key, "data": new_load }).then(() => {
        new_load.id = key.id;
        return new_load;
    });
}

function put_load(id, weight, content, quantity, owner) {
    const key = datastore.key([LOADS, parseInt(id, 10)]);
    const loads = { "weight": weight, "content": content, "quantity": quantity, "owner": owner };
    return datastore.save({ "key": key, "data": loads });
}

async function patch_load(id, body) {
    const key = datastore.key([LOADS, parseInt(id, 10)]);
    return get_load(id).then(async (load) => {
        if (body.content != null) {
            load[0].content = body.content;
        }
        if (body.quantity != null) {
            load[0].quantity = body.quantity;
        }
        if (body.weight != null) {
            load[0].weight = body.weight;
        }
        datastore.save({ "key": key, "data": load[0] });
        return load[0];
    });
}

function delete_load(id) {
    const key = datastore.key([LOADS, parseInt(id, 10)]);
    return datastore.delete(key);
}

/* ------------- End Load Model Functions ------------- */
/* ------------- Begin Controller Functions ------------- */

// POST - Create a new load
router.post('/', checkJwt, async function (req, res) {
    if (req.get('content-type') !== 'application/json') {
        res.status(415).send('Server only accepts application/json data.')
    } else if (!(req.body.weight != null & req.body.content != null & req.body.quantity != null)) {
        res.status(400).send({
            "Error": "The request object is missing at least one of the required attributes"
        });
    } else {
        post_loads(req.body.weight, req.body.content, req.body.quantity, req.user.sub)
            .then(load => {
                load.self = req.protocol + '://' + req.hostname + req.originalUrl + '/' + load.id;
                res.status(201).json(load);
            });
    }
});

// GET - View all loads
router.get('/', checkJwt, async function (req, res) {
    const accepts = req.accepts(['application/json', 'text/html']);
    if (!accepts) {
        return res.status(406).send('Not Acceptable');
    } else {
        var loads = await get_loads(req.user.sub, req.query.offset);
        for (const load of loads[0]) {
            load.self = req.protocol + '://' + req.hostname + '/loads/' + load.id;
            var id = await get_boat_assigned_to_load(load.id);
            // If a load has a carrier, add it to the JSON
            if (id[0] != undefined) {
                var boat = await get_boat(id[0].boat_id);
                const self = req.protocol + '://' + req.hostname + '/boats/' + id[0].boat_id;
                load.carrier = { "id": id[0].boat_id, "name": boat[0].name, "self": self };
            } else {
                load.carrier = null;
            }
        }
        if (loads[1].moreResults === 'MORE_RESULTS_AFTER_LIMIT') {
            const offset = (parseInt(req.query.offset)) || 0;
            loads[1].next = req.protocol + '://' + req.hostname + '/boats?offset=' + (offset + 5);
            // loads.push({ "next": req.protocol + '://' + req.hostname + '/loads?offset=' + (offset + 5) });
        }
        res.status(200).json(loads);
    }
});

// GET - View a load
router.get('/:id', checkJwt, function (req, res) {
    const accepts = req.accepts(['application/json', 'text/html']);
    if (!accepts) {
        return res.status(406).send('Not Acceptable');
    } else {
        get_load(req.params.id).then(load => {
            if (load[0] != null) {
                if (load[0].owner != req.user.sub) {
                    return res.status(403).send({ "Error": 'Unauthorized Request' });
                }
                load[0].id = req.params.id;
                load[0].self = req.protocol + '://' + req.hostname + req.originalUrl;
                get_boat_assigned_to_load(req.params.id).then(id => {
                    if (id[0] != undefined) {
                        get_boat(id[0].boat_id).then(boat => {
                            const self = req.protocol + '://' + req.hostname + '/boats/' + id[0].boat_id;
                            load[0].carrier = { "id": id[0].boat_id, "name": boat[0].name, "self": self };
                            res.status(200).json(load[0]);
                        });
                    } else {
                        load[0].carrier = null;
                        res.status(200).json(load[0]);
                    }
                });
            } else {
                res.status(404).json({ "Error": "No load with this load_id exists" });
            }
        });
    }
});

// PUT - Edit a load
router.put('/:id', checkJwt, function (req, res) {
    get_load(req.params.id).then(load => {
        if (load[0] == null) {
            res.status(404).json({ "Error": "No load with this load_id exists" });
        } else if (load[0].owner != req.user.sub) {
            res.status(403).send({ "Error": 'Unauthorized Request' });
        } else if (!(req.body.weight && req.body.content && req.body.quantity)) {
            res.status(400).send({
                "Error": "The request object is missing at least one of the required attributes"
            });
        } else {
            put_load(req.params.id, req.body.weight, req.body.content, req.body.quantity, req.user.sub)
                .then(res.status(200).end());
        }
    });
});

// PATCH - Edit a load
router.patch('/:id', checkJwt, function (req, res) {
    get_load(req.params.id).then(load => {
        if (load[0] == null) {
            res.status(404).json({ "Error": "No load with this load_id exists" });
        } else if (load[0].owner != req.user.sub) {
            res.status(403).send({ "Error": 'Unauthorized Request' });
        } else {
            patch_load(req.params.id, req.body).then(new_load => {
                new_load.id = req.params.id;
                new_load.self = req.protocol + '://' + req.hostname + req.originalUrl;
                res.status(200).json(new_load);
            });
        }
    });
});

// DELETE - Delete a load
router.delete('/:id', checkJwt, function (req, res) {
    get_load(req.params.id).then(async load => {
        if (load[0] == null) {
            res.status(404).json({ "Error": "No load with this load_id exists" });
        } else if (load[0].owner != req.user.sub) {
            res.status(403).send({ "Error": 'Unauthorized Request' });
        } else {
            remove_load_from_boat(req.params.id).then(() => {
                remove_load_boat_relationship(req.params.id);
                delete_load(req.params.id);
                res.status(204).end();
            });
        }
    });
});

// Disallow PUT or DELETE on root load URL
router.put('/', function (req, res) {
    return res.status(405).set("Allow", "GET, POST").send({ "Error": "PUT requests on the root load URL is not allowed." });
});

router.delete('/', function (req, res) {
    return res.status(405).set("Allow", "GET, POST").send({ "Error": "DELETE requests on the root load URL is not allowed." });
});


/* ------------- End Controller Functions ------------- */

module.exports = router;