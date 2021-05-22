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

Module:         Postgres Wrapper, reference counted singleton for use 
                in trade.js and server.js

Description:    Sets up connection to the database using settings from
                apikeys.js

Usage:          const pgw = require('./pgwrapper')
                try { 
                    var m = pgw.getPostgresSingleton(); 
                    // ... 
                }
                finally { 
                    pgw.closePostgresSingleton();
                }

*/


var logger = require('./logger').log.child({module:'pgwrapper'});

const APIKeys = require("./apikeys");
const { Client } = require('pg');



var connection = null;
var refcount = 0;



module.exports.getPostgresSingleton = async function( ) 
{
    if ( connection != null )
    {
        refcount++;
        return connection;
    }
    
    connection = new Client( APIKeys.POSTGRES_SETTINGS );
	await connection.connect();

    refcount++;
    return connection;
}



module.exports.closePostgresSingleton = async function( )
{
    if  ( --refcount == 0 )
    {
        connection.end();
        connection = null;
    }
}