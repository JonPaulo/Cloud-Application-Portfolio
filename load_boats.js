
const LOAD_BOAT = "Load_Boat";
const LOADS = 'Loads';
const BOATS = "Boats";
const USERS = 'Users';

const CLIENT_ID = 'Xet163M2T0BWadprW3WGxlnoDIHf9bLw';
const CLIENT_SECRET = 'Mu_osBdNKxY8fJ3vh0KHGno0Xl2KV3m0qeX-VRT11PTacVz0bRXYS-XWwvSqFVXe';
const DOMAIN = 'dev-rf93icrq.us.auth0.com';

const ds = require('./datastore');
const datastore = ds.datastore;

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const jwt_decode = require('jwt-decode');

const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),

    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
});

const display_owner = function display_owner(token) {
    const decoded = jwt_decode(token.access_token);
    return decoded.sub;
}

const get_load = async function get_load(id) {
    var key = datastore.key([LOADS, parseInt(id, 10)]);
    return await datastore.get(key);
}

const get_boat = async function get_boat(id) {
    var key = datastore.key([BOATS, parseInt(id, 10)]);
    return await datastore.get(key);
}

const get_boat_assigned_to_load = async function get_boat_assigned_to_load(load_id) {
    var key = datastore.key([LOAD_BOAT, parseInt(load_id, 10)]);
    return await datastore.get(key);
}

const remove_load_boat_relationship = function remove_load_boat_relationship(load_id) {
    const key = datastore.key([LOAD_BOAT, parseInt(load_id, 10)]);
    return datastore.delete(key);
}

const remove_load_from_boat = async function remove_load_from_boat(load_id) {
    return get_boat_assigned_to_load(load_id).then(async boat => {
        // Only remove if there is a relationship
        if (boat[0] != undefined) {
            var boat_details = await get_boat(boat[0].boat_id);

            // Find load inside the boat and filter it out
            const updated_data = boat_details[0].loads.filter(load => load.id !== load_id);
            boat_details[0].loads = updated_data;

            // Update the boat's data
            var key = datastore.key([BOATS, parseInt(boat[0].boat_id, 10)]);
            return datastore.save({ "key": key, "data": boat_details[0] });
        }
        else {
            return;
        }
    });
};


const remove_all_loads_from_boat = function remove_all_loads_from_boat(boat_id) {
    return get_boat(boat_id).then(async boat => {
        if (boat[0] != null) {
            if (boat[0].loads.length > 0) {
                for (load of boat[0].loads) {
                    await remove_load_from_boat(load.id);
                    remove_load_boat_relationship(load.id);
                }
            }
            return 204;
        } else {
            return 404;
        }
    });
};

const put_load_to_boat = async function put_load_to_boat(boat_id, load_id, owner) {
    const boat = await get_boat(boat_id);
    const boat_exists = (boat[0] != null);
    let load_already_assigned;

    // Make sure that boat exists in the first place
    if (boat_exists) {
        return get_load(load_id).then(async load => {
            // If load doesn't exist, return 404
            if (load[0] == null) {
                return [404, { "Error": "The specified boat and/or load does not exist" }];
            }
            // Validate ownership
            if (!(load[0].owner === boat[0].owner && boat[0].owner === owner)) {
                return [403, { "Error": 'Unauthorized Request' }];
            }

            // Verify that load has not been assigned yet
            const load_not_in_boat = boat[0].loads.find(load => load.id === load_id) == undefined;
            var relationship_key = datastore.key([LOAD_BOAT, parseInt(load_id, 10)]);
            const load_boat_status = await datastore.get(relationship_key);

            // If load_boat relationship exists, set to true
            if (load_boat_status[0] != undefined && load_boat_status[0].boat_id != undefined) {
                load_already_assigned = true;
            } else {
                load_already_assigned = false;
            }
            
            // If load isn't in the boat & the load hasn't been assigned yet, assign it to the boat
            if (load_not_in_boat && !load_already_assigned) {
                return datastore.save({ "key": relationship_key, "data": { 'boat_id': boat_id, 'owner': owner } }).then(() => {
                    var key = datastore.key([BOATS, parseInt(boat_id, 10)]);
                    boat[0].loads.push({ "id": load_id });
                    return datastore.save({ "key": key, "data": boat[0] }).then(() => {
                        return 204;
                    });
                });
            } else {
                return [403, { "Error": "The load has already been assigned to a boat" }];
            }
        });
    } else {
        return [404, { "Error": "The specified boat and/or load does not exist" }];
    }
}

module.exports.get_load = get_load;
module.exports.get_boat = get_boat;
module.exports.BOATS = BOATS;
module.exports.LOADS = LOADS;
module.exports.LOAD_BOAT = LOAD_BOAT;
module.exports.put_load_to_boat = put_load_to_boat;
module.exports.get_boat_assigned_to_load = get_boat_assigned_to_load;
module.exports.remove_load_from_boat = remove_load_from_boat;
module.exports.remove_load_boat_relationship = remove_load_boat_relationship;
module.exports.remove_all_loads_from_boat = remove_all_loads_from_boat;

module.exports.checkJwt = checkJwt;
module.exports.DOMAIN = DOMAIN;
module.exports.CLIENT_ID = CLIENT_ID;
module.exports.CLIENT_SECRET = CLIENT_SECRET;
module.exports.USERS = USERS;
module.exports.display_owner = display_owner;