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

Module:         Logging module for coinbase-bot using pino module

Description:    Used by server.js, trade.js, prices.js and their submodules

Usage:

  Use .log to write to the logfile.

  Modules can change the log file name by calling setLogFileName. Submodules
  must have an equivalent function otherwise they will continue writing to the
  default log file (log.json).

  By convention, it should look like this:

      module.exports.updateLogger = function(central_log) 
      {
        logger = central_log.child({module:'<MODULENAMEHERE>'});
        logger.info("<MODULENAMEHERE> logger initialized");
      }

  Entry point modules that change the log file name is responsible for
  calling each submodule's updateLogger(...) to cascade the change.
  
*/
const path = require('path');
const pino = require('pino');
var logger = require('pino')( path.resolve( path.dirname( require.main.filename ), 'log.json' ) );

module.exports.log = logger;

module.exports.setLogFileName = ((fileName) =>
{
    if ( fileName.indexOf('/') == -1 )
      fileName = path.resolve( path.dirname( require.main.filename ), fileName );

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