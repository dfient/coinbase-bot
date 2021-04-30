const APIKeys = require("./apikeys");
var logger = require('./logger').log.child({module:'twilio'});


//
// After burning through 50$ in a second, this is a failsafe
// to protect your twilio budget from bugs. It makes sure we
// simply do not send more messages if we pass a certain amount
// in a short time (50 per hour atm)
//

const MAX_MESSAGES_PER_INTERVAL = 50;
const INTERVAL_LENGTH_MS = 60 * 60 * 1000; // one hour

var capacityCircuit = [];

function circuitCheck()
{
    // empty array of items older than INTERVAL_LENGTH_MS

    var intervalAgo = new Date().getTime() - INTERVAL_LENGTH_MS;
    while ( capacityCircuit.length && capacityCircuit[ 0 ] < intervalAgo )
        capacityCircuit.shift();

    // if below max, add this time and go back
    if ( capacityCircuit.length < MAX_MESSAGES_PER_INTERVAL )
    {
        capacityCircuit.push( new Date().getTime() );
        return true;
    }

    // we're at capacity
    return false;
}

//
// When --verbose or --logfilename is used we must update loggers
// Inititalization will still write to log.json but after this call we may send
// stuff somewhere else
//

module.exports.updateLogger = function(central_log) 
{
  logger = central_log.child({module:'twilio'});
  logger.info("twilio logger initialized");
}


//
// Send text message, this is pure and simple, and configuration must happen
// in the apikeys.js file, we cannot support multiple recipients or fancy stuff
//
// But we have to versions, one for async await and one that just does its work
//

module.exports.sendTextMessage = function(message) 
{
    if ( !circuitCheck() ) return false; // just a failsafe so we don't spend $$$ on twilio

    const client = require('twilio')(APIKeys.TWILIO_SID, APIKeys.TWILIO_TOKEN);

    logger.trace(message, "Sending text message");

    client.messages
    .create({
        to: APIKeys.SMS_TO_NUMBER,
        from: APIKeys.SMS_FROM_NUMBER,
        body: message,
    })
    .then(message => { 
        logger.debug(message.sid, "Twilio sms sent.");
    })
    .catch(error => {
        logger.error(error, "Failed sending twilio message '%s'", message);
    });
}

module.exports.sendTextMessageAsync = async function(message) 
{
    if ( !circuitCheck() ) return false; // just a failsafe so we don't spend $$$ on twilio

    const client = require('twilio')(APIKeys.TWILIO_SID, APIKeys.TWILIO_TOKEN);

    logger.trace(message, "Sending text message");

    return client.messages
    .create({
        to: APIKeys.SMS_TO_NUMBER,
        from: APIKeys.SMS_FROM_NUMBER,
        body: message,
    })
    .then(message => { 
        logger.debug(message.sid, "Twilio sms sent.");
    })
    .catch(error => {
        logger.error(error, "Failed sending twilio message '%s'", message);
    });
}