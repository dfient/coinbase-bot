/*

COINBASE-BOT

MIT License

Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

--

Module:         Wrapper module for Twilio API to send SMS notifications.

Description:    Used by trade.js to notify admin of trades and signals.

Dependencies:	Configuration in apikeys.js

Notes:          This module has a circuit breaker to avoid excessive
                charges by Twilio + automatic refill of account balance.
                It will stop sending messages is more than >50 messages
                is sent in one hour.

*/



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
        body: `${message} + (${new Date().toLocaleString()})`,
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
        body: `${message} + (${new Date().toLocaleString()})`,
    })
    .then(message => { 
        logger.debug(message.sid, "Twilio sms sent.");
    })
    .catch(error => {
        logger.error(error, "Failed sending twilio message '%s'", message);
    });
}