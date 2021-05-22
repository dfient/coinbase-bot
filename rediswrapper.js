/*

COINBASE BOT

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

Module:         Redis Wrapper, reference counted singleton for use 
                in trade.js and server.js

Description:    Sets up connection to the cache, assuming no authentication
                and cache on localhost

Usage:          const r = require('./rediswrapper')
                try { 
                    var m = r.getRedisClientSingleton(); 
                    // ... 
                }
                finally { 
                    r.closeRedisSingleton();
                }

*/


var logger = require('./logger').log.child({module:'rediswrapper'});
logger.info('rediswrapper initializing');

const bluebird = require('bluebird');

const redis = require('redis');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);



var redisClient = null;
var refcount = 0;



module.exports.getRedisClientSingleton = function() {
    if ( redisClient == null )
    {
        logger.debug("Initializing rediswrapper singleton");

        redisClient = redis.createClient();

        redisClient.on("error", (error) => {
            logger.error(error, "Rediswrapper caught error");
            throw error;
        });
    }

    refcount++;
    return redisClient;
}



module.exports.closeRedisSingleton = async function() {
    if ( redisClient != null )
    {
        await redisClient.quitAsync(  );
        redisClient = null;
    }
}



module.exports.getRedisClient = function() {
    logger.debug("Initializing rediswrapper instance");

    var redisClient = redis.createClient();

    redisClient.on("error", (error) => {
        logger.error(error, "Rediswrapper caught error");
        throw error;
    });

    return redisClient;
}



module.exports.updateLogger = function(central_log) 
{
  logger = central_log.child({module:'rediswrapper'});
  logger.info("rediswrapper logger initialized");
}

