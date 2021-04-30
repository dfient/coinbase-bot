const pino = require('pino');
var logger = require('pino')('./log.json');

module.exports.log = logger;

module.exports.setLogFileName = ((fileName) =>
{
    log = logger = pino(pino.destination(fileName));
    return logger;
});

module.exports.setLogToConsole = ( () => 
{
    log = logger = pino();
    return logger;
});

// module.exports.getPino = ( () => 
// {
//     return pino;
// });