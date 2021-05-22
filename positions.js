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

Module:         Position management. A position is a buy,sell pair tracked
                in the postgres database table 'positions'.

Description:    This module is a nice mash of business and data layer logic
                and would benefit from refactoring once it reaches critical
                complexity (focus now is on getting to 'completeness'.)

                Used by trade.js and server.js in a tandem dance: Positons
                are opened in new state by trade.js, then server.js takes over
                and updates the record based on the buy order status.

                Later, trade.js can close the position, issuing the sell order.
                Again server.js takes over and updates the record when/if the
                order goes through.

                Server.js also responsible for orchestrating take-profit,
                stop-loss and close_at_time instructions on the position.

Schema:         See ./schema/positions.psql for table definition.

Usage:          See exported functions for usage information.

*/



// require('shortid').generate().toLowerCase()



var logger = require('./logger').log.child({module:'positions'});
const pgw = require('./pgwrapper');
const UserError = require('./usererror.js');



module.exports.create = async function( name, product, size, price ) 
{
  try
  {
    const sql = "insert into positions (status, create_time, name, product, size, price) values ($1, NOW(), $2, $3, $4, $5) returning id";

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, [ 'new', name, product, size, price ] );

    return res.rows[ 0 ].id;
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.updateWithBuyOrderId = async function( name, orderid ) 
{
  try
  {
    const sql = "update positions set buy_order_id = $1 where name = $2";

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, [ orderid, name ] );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.updateOnCompletedBuy = async function( name, size, price, fees ) 
{
  try
  {
    const sql = "update positions set status = 'open', size = $2, price = $3, buy_fees = $4, buy_fill_price = $3 where name = $1";
    const params = [ name, size, price, fees ];

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, params );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.updateOnCanceledBuy = async function( name ) 
{
  try
  {
    const sql = "update positions set status = 'aborted', close_time = NOW() where name = $1";
    const params = [ name ];

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, params );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.updateOnClosePositionWithoutBuyOrder = async function( name ) 
{
  try
  {
    const sql = "update positions set status = 'aborted', close_time = NOW() where name = $1";
    const params = [ name ];

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, params );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.updateOnCancelPositionWithBuyOrder = async function( name ) 
{
  try
  {
    const sql = "update positions set status = 'canceled', close_time = NOW() where name = $1";
    const params = [ name ];

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, params );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.updateWithSellOrder = async function( name, sell_order_id ) 
{
  try
  {
    const sql = "update positions set sell_order_id = $2 where name = $1";

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, [ name, sell_order_id ] );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.updateOnCompletedSell = async function( name, price, fees, result ) 
{
  try
  {
    const sql = "update positions set status = 'closed', sell_fill_price = $2, sell_fees = $3, result = $4, close_time = NOW() where name = $1";

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, [ name, price, fees, result ] );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.removeSellOrder = async function( name ) 
{
  try
  {
    const sql = "update positions set sell_order_id = null where name = $1";

    const client = await pgw.getPostgresSingleton();
    var res = await client.query( sql, [ name ] );
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.adjustSellTriggers = async function( name, takeProfit, stopLoss, closeAtTime ) 
{
  // NOTE: We allow null, true and actual values
  // If null, we do not alter the value in the database
  // If true, we reset the value in the database
  // If a value, we set that value in the db, replacing any existing value or null

  try
  {
    if ( takeProfit == null && stopLoss == null && closeAtTime == null )
      return;

    const client = await pgw.getPostgresSingleton();

    if ( takeProfit != null ) {
      if ( takeProfit == true )
        takeProfit = null;
      
      const sql_tp = "update positions set take_profit = $2 where name = $1;";
      var res = await client.query( sql_tp, [ name, takeProfit ] );
    }

    if ( stopLoss != null ) {
      if( stopLoss == true )
        stopLoss = null;
      
      const sql_sl = "update positions set stop_loss = $2 where name = $1;";
      var res = await client.query( sql_sl, [ name, stopLoss ] );
    }

    if ( closeAtTime != null ) {
      if ( closeAtTime == true )
        closeAtTime = null;
      
      const sql_cat = "update positions set close_at_time = $2 where name = $1;";
      var res = await client.query( sql_cat, [ name, closeAtTime ] );
    }
    
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.get = async function( name )
{
  try
  {
    const sql = "select * from positions where name = $1";
    const client = await pgw.getPostgresSingleton();
    
    var res = await client.query( sql, [ name ] );

    if ( res.rows.length == 0 )
      throw new UserError("The position can not be found.");

    return res.rows[ 0 ];
  }
  finally
  {
    pgw.closePostgresSingleton();
  }
}



module.exports.list = async function( filter = "all" ) 
{
    try
    {
        var query = "select * from positions";

        if ( filter == 'new' )
          query += " where status = 'new'";
        else if ( filter == 'open' )
          query += " where status = 'open'";
        else if ( filter == 'closed' )
          query += " where status = 'closed'";

        query += " order by id asc"

        const client = await pgw.getPostgresSingleton();
        var res = await client.query( query );
        return res.rows;
    }
    finally
    {
        pgw.closePostgresSingleton();
    }
    
}