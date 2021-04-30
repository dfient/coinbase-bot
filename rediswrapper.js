var logger = require('./logger').log.child({module:'rediswrapper'});
logger.info('rediswrapper initializing');

const bluebird = require('bluebird');

const redis = require('redis');
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

module.exports.updateLogger = function(central_log) 
{
  logger = central_log.child({module:'rediswrapper'});
  logger.info("rediswrapper logger initialized");
}

var redisClient = null;
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

    return redisClient;
}

module.exports.closeRedisSingleton = function() {
    if ( redisClient != null )
    {
        redisClient.end();
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

