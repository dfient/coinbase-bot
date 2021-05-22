#!/usr/bin/env node

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

Module:         Maintains connection to the Coinbase websocket feed and
                publishes the information to coinbase-bot modules through
				Redis and Postgres.

Description:    This module is an entrypoint module meant to be called by users
                of the application.

				'trade.js' depends on this module to be running to function
				properly (this lets us overcome api throttling restrictions at
				Coinbase).

Usage:          Run './server.js --safe' to start the server.

                Use screen or set up as a daemon to ensure it stays up.

Notes:			This module is reaching a point where it needs some major
                refactoring both for readability and maintainabilily, and most
				importantly to ensure we keep separation of concerns and reduce
				impact of possible bugs/crashes (position management especially).

				IMPROVEMENT: With positions we're introducing more complexity in this 
				module. We should ideally just post messages to redis, and let 
				another subscriber handle the gory details of talking to the database.

				IMPROVEMENT: We're doing multiple writes to the redis cache for
				some messages. Operations to redis can be grouped together, this
				is a possible performance improvement at the cost of readability.
				Suited for a later stage in the process as we stabilize.

				IMPROVEMENT: Currently using sets for orders:open and orders:completed.
				We're checking order status through order:<orderid>.status (hash),
				but if we check using :open or :completed we should change this to a
				sorted set for performance. DISCUSSION: The module that handles
				updates to positions can use either orders:completed or the orderfeed.

				IMPROVEMENT: We should publish information about positions changing
				to make the system easily extendible.

Weakness:		We may lose messages for a variety of reasons, local crashes,
                connection problems, or coinbase faults. Coinbase sends a sequence
				number that we should track. The critical part here is order
				management. We have open orders listed in redis orders:open
				and on start of the server we should use the private api to
				check the status of all of these, then manually trigger completed
				actions for each of them.

*/

const logtool = require('./logger');
var logger = logtool.log;

const tools = require('./tools');
const clc = require('cli-color');
const yargs = require('yargs');
const redis = require('./rediswrapper');
const pgw = require('./pgwrapper');
const { spawn } = require('child_process');

var coinbase = require('./coinbase');
const positions = require('./positions');

const CoinbasePro = require('coinbase-pro');
var APIKeys = require('./apikeys');
const { boolean } = require('yargs');

const MAX_SILENT_TIME_SEC = 90;
var lastMessageReceived = new Date();  // used to check heartbeat received and connection is good



main();



async function main()
{
	parseCommandLine();
}



function parseCommandLine()
{
    const argv = yargs
	.command('start', 'Start the server modules and monitor for failure', {
        // budget: {
        //     description: 'the amount of money to buy for',
        //     alias: 'b',
        //     type: 'number',
        //     demandOption : true
        },
		(yargs) => { setupLogging(yargs); startServerProcesses(yargs) }
    )
	.command(
		'get-ticker', 
		'[DEPRECATED] Display ticker information <product>. Use trade.js get-ticker instead.', 
		(yargs) => {
		   yargs.positional('product', {
			description: 'the product to display ticker for, e.g. EUR-BTC',
			type: 'string'
		   })
		   .option('raw', {
			   description: 'Output raw data (json), default is human readable',
			   type: 'boolean',
			   default: false
		   })
		},
		(yargs) => { setupLogging(yargs); displayTicker(yargs) }
    )
	.command('exchange-connector', false, {
        // budget: {
        //     description: 'the amount of money to buy for',
        //     alias: 'b',
        //     type: 'number',
        //     demandOption : true
        },
		(yargs) => { setupLogging(yargs); startExchangeConnection(yargs) }
    )
	.command('position-manager', false, {
        // budget: {
        //     description: 'the amount of money to buy for',
        //     alias: 'b',
        //     type: 'number',
        //     demandOption : true
        },
		(yargs) => { setupLogging(yargs); startPositionManager(yargs) }
    )
	.option('verbose', {
		description: 'Enable verbose logging',
		type: 'boolean',
		default: false
	})
	.option('logfilename', {
		description: 'Choose alternate log file name',
		type: 'string'
	})
    .help()
    .alias('help', 'h')
	.alias('start', 'safe')
    .argv;

    return argv;
}



function setupLogging(argv)
{
	if ( argv.logfilename != null )
	{
		if ( argv.logfilename == 'console' )
			logger = logtool.setLogToConsole();
		else
			logger = logtool.setLogFileName(argv.logfilename);
	}
	else
	{
		logger = logtool.setLogFileName("log_server.json");
	}
	
	logger.level = argv.verbose ? 'trace' : 'debug';
	logger.info('Starting bitbot server.js, loglevel: ' + logger.level);

	coinbase.updateLogger( logger );
}



async function displayTicker( yargs )
{
	//
	// This was included early as a test function, and has no real value now that the system has stabilized
	// and the same function is available through trade.js get-ticker. The difference between the two is that
	// this one has no fallback to api if the redis key has expired.
	// 
	// Will be removed from future versions
	//

	try 
	{
		var product = yargs._[1];

		// Retrieving from redis, requiring that server is running or this is stale

		const redisClient = redis.getRedisClientSingleton();
		var tickerJson = await redisClient.getAsync( 'ticker.' + product );
		if ( tickerJson == null )
		{
			console.log('Ticker not found, is server running?');
			exit( 1 );
		}
		
		var data = JSON.parse(tickerJson);
		var msgTime = Date.parse(data.time);

		// See assumptions.md
		// 900 seconds max for ticker, IMPROVEMENT use global constant, see coinbase.getTicker and ticker message handler above
		if ( new Date() - msgTime > 900 * 1000 ) 
		{
			console.error("Note! Ticker outdated, is server running?");
		}

		if ( yargs.raw )
			console.log(data);
		else
			console.log(product, "Bid:", data.best_bid, "Ask:", data.best_ask, "Spread:", (Math.abs(data.best_bid - data.best_ask)).toFixed(2), "Timestamp:", data.time);
	} 
	catch (error) 
	{
		throw error;	
	}
	finally 
	{
		redis.closeRedisSingleton();
	}
	
}



async function startServerProcesses(yargs)
{
	console.log("Starting server and child processes. Press Ctrl-C to exit.");

	// while( true )
	// {
	// 	var exChild = spawn('node', ["./server.js", "exchange-connector"] );
	// 	console.log("Server running as pid:", exChild.pid);

	// 	var stopped = false;
	// 	exChild.on('exit', function(code) {
	// 		console.log('Child process stopped, restarting.');
	// 		stopped = true;
	// 	});

	// 	exChild.stdout.on('data', (data) => {
	// 		process.stdout.write('XC: ' + data);
	// 	});

	// 	while( !stopped )
	// 		await tools.sleep(1000);
	// }

	var positions_manager = null;
	var restart_positions_manager = true;

	var exchange_connector = null;
	var restart_exchange_connector = true;

	while( true )
	{

		if ( restart_positions_manager )
		{
			restart_positions_manager = false;

			positions_manager = spawn('node', ["./server.js", "position-manager"] );
			console.log("Positions Manager (PM) running as pid:", positions_manager.pid);

			positions_manager.on('exit', function( code ) {
				console.log('Position Manager stopped, restarting.');
				restart_positions_manager = true;
			});
			
			positions_manager.stdout.on('data', (data) => {
				process.stdout.write('PM: ' + data);
			});
		}

		// We start the exchange connector last to make sure subscribers are able to
		// receive messages once we're connected to the exchange

		if ( restart_exchange_connector )
		{
			restart_exchange_connector = false;

			exchange_connector = spawn('node', ["./server.js", "exchange-connector"] );
			console.log("Exchange Connector (EX) running as pid:", exchange_connector.pid);

			exchange_connector.on('exit', function( code ) {
				console.log('Exchange Connector stopped, restarting.');
				restart_exchange_connector = true;
			});

			exchange_connector.stdout.on('data', (data) => {
				process.stdout.write('XC: ' + data);
			});
		}
		
		await tools.sleep( 1000 );
	}
}



/* ********************************************************************

   EXCHANGE CONNECTION SUBPROCESS

   This process is managed by 'server.js start'. It connects to the
   Coinbase websocket and subscribes to product, ticker, order
   channels and notifies our other processes through redis
   pubsub and keys.

   It is critical that this process is running. We have a circuit
   breaker that fires if we have no new messages for X seconds
   and then abort the process - we can therefore not have any longrunning
   tasks in this - just message pushing. Our parent (./server.js start)
   will restart us if we exit.

*/



async function startExchangeConnection(yargs)
{
	try
	{
		const redisServer = redis.getRedisClientSingleton();
		websocket = coinbaseListener(redisServer);

		setInterval( checkExchangeConnectionHeartbeat, 10000 );

		console.log('Exchange Connector running. (Press Ctrl-C to quit.)');
		await tools.keypress();

		websocket.disconnect();

		console.log('Exchange Connector stopped.');
	}
	finally
	{
		redis.closeRedisSingleton();
	}
}



function checkExchangeConnectionHeartbeat()
{
	var currentTime = new Date();
	var timeSinceLastMessage = currentTime.getTime() - lastMessageReceived.getTime();

	if ( timeSinceLastMessage > MAX_SILENT_TIME_SEC * 1000 )
	{
		 console.log("Heartbeat stopped, aborting server. Time since last message:", timeSinceLastMessage);
		 logger.error({ lastMessage: lastMessageReceived, timeSince: timeSinceLastMessage }, "Heartbeat stopped, aborting server.");

		process.abort();
	}
}



async function coinbaseListener(redisServer)
{
	const websocket = new CoinbasePro.WebsocketClient( APIKeys.TRADING_PRODUCTS, 'wss://ws-feed.pro.coinbase.com',
		{
			key: APIKeys.API_KEY,
			secret: APIKeys.API_SECRET,
			passphrase: APIKeys.API_PASS
		},
		{
			channels: [ 'ticker', 'user', 'status' ] //, 'level2' ]
		}
	);

	websocket.on('message', (data) => {
		handleCoinbaseMessage(data, redisServer);
	});

	return websocket;
}



async function handleCoinbaseMessage(data, redisServer)
{
	// IMPROVEMENT: This function has outgrown itself and needs refactoring, split each message
	// handler into functions and reuse parts for ie received and activate

	// We must handle the heartbeats; if no heartbeat received in 10 seconds, we must restart the server
	// and somehow sync up on our orders on start

	lastMessageReceived = new Date(); // used to check heartbeat received and connection is good

	if ( data.type == 'heartbeat' ) // but don't process these
		return;


	// push message on for generic consumption

	data.x_server_time = new Date();
	
	// IMPROVEMENT: We do not need this full stream, but it can be nice for extensibility
	// and custom development. Parameterize this, e.g. --full-stream to enable
	// We may need the L2 order book as well so this would be very verbose
	redisServer.publish("fullfeed", JSON.stringify(data)); 


	// specific handling of messages

	if  ( data.type == 'ticker' )
	{
		const TICKER_TTL_SECONDS = 60 * 15; // TODO: Must be set to something else?

		redisServer.set('ticker.' + data.product_id, JSON.stringify(data), 'EX', TICKER_TTL_SECONDS);
		redisServer.publish('tickerfeed', JSON.stringify(data));
	}
	else if ( data.type == 'l2update' || data.type == 'snapshot ')
	{
		// This will not trigger, we're not subscribing to l2updates atm
		// this can be changed in coinbaselistener()
		
		redisServer.set('level2:' + data.product_id, JSON.stringify(data));
	}
	else if ( data.type == 'subscriptions' )
	{
		null;
	}
	else if ( data.type == 'status' )
	{
		//logger.trace("Status update received");

		for ( product of data.products )
		{
			if ( APIKeys.TRADING_PRODUCTS.find( (e) => { return e === product.id; } ) == undefined )
				continue;

			product.x_server_time = new Date();

			// fix a difference in coinbase messages on rest api and feed, trading_disabled is not sent by default in feed
			if ( product.trading_disabled == null ) 
				product.trading_disabled = false;

			// TODO: Put product info into redis
			const PRODUCT_INFO_TTL_SECONDS = 60 * 60; // one hour
			redisServer.set('product.' + product.id, JSON.stringify(product), 'EX', PRODUCT_INFO_TTL_SECONDS);
			redisServer.publish('productfeed', JSON.stringify(product));
		}
	}
	// TODO: Maintain a single order view, combining the unique information in each
	// order message. This is order:<id> in redis. There is different information
	// in each step of the process, giving us status, fees, etc.
	// When the order is done, either canceled or filled, we should also push
	// it to postgres to store.
	else if ( data.type == 'received' )
	{
		// {
		// 	client_oid:'440adcde-8dd1-4965-dac4-f6cf858a59cc'
		// 	funds:'1.67124'
		// 	order_id:'d1a55558-203c-4008-aae3-157a3d76ded4'
		// 	order_type:'market'
		// 	product_id:'XLM-EUR'
		// 	profile_id:'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4'
		// 	sequence:2208732858
		// 	side:'buy'
		// 	time:'2021-04-27T08:52:46.932361Z'
		// 	type:'received'
		// 	user_id:'5aed28830f7c2f0189a7a12e'
		// 	x_server_time:'2021-04-27T08:52:46.996Z'
		// }
		// {
		// 	level: 10,
		// 	time: '2021-04-28T16:10:43.213879Z',
		// 	pid: 11441,
		// 	hostname: 'chfrenninor',
		// 	type: 'received',
		// 	side: 'buy',
		// 	product_id: 'XLM-EUR',
		// 	sequence: 2215289845,
		// 	profile_id: 'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4',
		// 	user_id: '5aed28830f7c2f0189a7a12e',
		// 	order_id: '53bc63ec-d706-4cb6-a03d-59e812e80d1a',
		// 	order_type: 'limit',
		// 	size: '1',
		// 	price: '0.400245',
		// 	client_oid: 'ebdee221-057f-4efd-84c4-b9b595afccc2',
		// 	x_server_time: '2021-04-28T16:11:15.682Z',
		// 	msg: 'Received order'
		// }

		logger.trace(data, "Received order");

		// Store mapping between client_id and order_id

		if ( data.client_oid && data.client_oid.length > 0 )
		{
			logger.trace( { client: data.client_oid, order: data.order_id }, 'Mapping client_id to order_id in redis.');
			redisServer.hset('cid:' + data.client_oid, 'order_id', data.order_id); // this is replacing the line above in work with positions
		}


		// Store last order status and add to set which is order history

		const record_id = 'order:' + data.order_id;
		redisServer.rpush( record_id + ':history', JSON.stringify(data));


		// Mark as open order

		redisServer.sadd( "orders:open", data.order_id );


		// Now that we have the order, we must make a connection betweent the order and the position
		// We don't know if the order has a matching position, so we must check this on cid:<clientid>[position]
		// order:<orderid>:position - value:position_name

		var position_name = await redisServer.hgetAsync('cid:' + data.client_oid, 'position');
		if ( position_name != null )
		{
			// Yes, this order is tracked by a position, let's create the mapping
			redisServer.hset( 'order:' + data.order_id, 'position', position_name );
		}

		
		// Console output

		if ( data.order_type == 'market' )
			console.log(`Received ${data.side} ${data.product_id} at market with funds ${data.funds} at ${data.time} (${data.order_id}).`);
		else
			console.log(`Received ${data.side} ${data.product_id} limit price ${data.price} * size ${data.size} at ${data.time} (${data.order_id}).`);

	}
	else if ( data.type == 'open' )
	{
		// open limit order
		// {
		// type: 'open',
		// side: 'sell',
		// product_id: 'XLM-EUR',
		// time: '2021-04-27T10:35:23.823229Z',
		// sequence: 2209106891,
		// profile_id: 'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4',
		// user_id: '5aed28830f7c2f0189a7a12e',
		// price: '0.4261',
		// order_id: '290ae103-d7c8-4cb3-9e0f-77e0d45491a5',
		// remaining_size: '2',
		// x_server_time: 2021-04-27T10:35:23.892Z
		// }

		logger.trace(data, "Order opened");

		
		// Add this event to the order history
		
		const record_id = 'order:' + data.order_id;
		redisServer.rpush( record_id + ':history', JSON.stringify(data) );

		
		// Console output

		console.log(`Order opened ${data.side} ${data.product_id}`, "remaining size", data.remaining_size, "price", data.price, `(${data.order_id})`);
	}
	else if ( data.type == 'activate' )
	{
		// activate stoploss
		// {
		// 	client_oid:'30fead49-b5d6-4e9b-c315-404e62911619'
		// 	limit_price:'0.1'
		// 	order_id:'07a26445-6e24-4296-b4f9-526c99a2a41a'
		// 	product_id:'XLM-EUR'
		// 	profile_id:'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4'
		// 	sequence:2208761441
		// 	side:'sell'
		// 	size:'2'
		// 	stop_price:'0.1'
		// 	stop_type:'loss'
		// 	time:'2021-04-27T09:01:01.234060Z'
		// 	type:'activate'
		// 	user_id:'5aed28830f7c2f0189a7a12e'
		// }
		
		logger.trace( data, 'Order activated' );

		// Store mapping between client_id and order_id

		if ( data.client_oid && data.client_oid.length > 0 )
		{
			logger.trace( { client: data.client_oid, order: data.order_id }, 'Mapping client_id to order_id in redis.');
			redisServer.hset('cid:' + data.client_oid, 'order_id', data.order_id); // this is replacing the line above in work with positions
		}

		
		// Add this event to the order history
		
		const record_id = 'order:' + data.order_id;
		redisServer.rpush( record_id + ':history', JSON.stringify(data) );


		// Mark as open order

		redisServer.sadd( "orders:open", data.order_id );


		// Now that we have the order, we must make a connection betweent the order and the position
		// We don't know if the order has a matching position, so we must check this on cid:<clientid>[position]
		// order:<orderid>:position - value:position_name

		var position_name = await redisServer.hgetAsync('cid:' + data.client_oid, 'position');
		if ( position_name != null )
		{
			// Yes, this order is tracked by a position, let's create the mapping
			redisServer.hset( 'order:' + data.order_id, 'position', position_name );
		}


		// Console output

		console.log("Order activated", data.product_id, "side", data.side, "size", data.size, "type", data.stop_type, "stop_price", data.stop_price, `(${data.order_id})` );
	}
	else if ( data.type == 'match' )
	{
		// Child: Match orders 84e06af8-6245-4f70-ba31-101be0bc1282 maker 531935b3-686c-4922-bbb4-5acc8a1ded5e
		// taker: {
		// type: 'match',
		// side: 'buy',
		// product_id: 'XLM-EUR',
		// time: '2021-04-27T04:57:39.667194Z',
		// sequence: 2207925740,
		// profile_id: 'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4',
		// user_id: '5aed28830f7c2f0189a7a12e',
		// trade_id: 3757854,
		// maker_order_id: '531935b3-686c-4922-bbb4-5acc8a1ded5e',
		// taker_order_id: '84e06af8-6245-4f70-ba31-101be0bc1282',
		// size: '25',
		// price: '0.41044',
		// taker_profile_id: 'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4',
		// taker_user_id: '5aed28830f7c2f0189a7a12e',
		// taker_fee_rate: '0.0035'
		// }
		// maker : {
		// 	type: 'match',
		// 	side: 'buy',
		// 	product_id: 'XLM-EUR',
		// 	time: '2021-04-28T19:47:26.738739Z',
		// 	sequence: 2216014114,
		// 	profile_id: 'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4',
		// 	user_id: '5aed28830f7c2f0189a7a12e',
		// 	trade_id: 3780990,
		// 	maker_order_id: 'f38896cc-af01-42d4-b619-9179b0cb74bc',
		// 	taker_order_id: 'e1c7025e-0438-4705-9341-16407f073728',
		// 	size: '2',
		// 	price: '0.4096',
		// 	maker_profile_id: 'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4',
		// 	maker_user_id: '5aed28830f7c2f0189a7a12e',
		// 	maker_fee_rate: '0.0035',
		//   }

		
		logger.trace( data, 'Order match.' );


		// Add the match to the order history
		var order_id = null;
		var fee = 0.0;

		if ( data.user_id == data.taker_user_id )
		{
			redisServer.rpush('order:' + data.taker_order_id + ':history', JSON.stringify( data ));
			
			console.log("Match taker", data.product_id, "size", data.size, "price", data.price, "fee", data.taker_fee_rate, `(${data.taker_order_id})`);

			fee = data.taker_fee_rate;
			order_id = data.taker_order_id;
		}
		else
		{
			redisServer.rpush('order:' + data.maker_order_id + ':history', JSON.stringify( data ));

			console.log("Match maker", data.product_id, "size", data.size, "price", data.price, "fee", data.maker_fee_rate, `(${data.maker_order_id})`);

			fee = data.maker_fee_rate;
			order_id = data.maker_order_id;
		}

		// Update the order with match information, as we can have multiple match messages for larger orders,
		// we increment the values. Note: We may submit a market order for €1, but executed value can be less
		// This will affect budget maintenance in auto trading mode. Ie if minimum size of base is 1 and
		// price is <1€, the executed value will be equal to the price of the product, i.e. 0.56555
		// So don't just multiple input parameters... ;)

		redisServer.hincrbyfloat('order:' + order_id, 'executed_size', data.size);
		redisServer.hincrbyfloat('order:' + order_id, 'executed_value', data.size * data.price);
		redisServer.hincrbyfloat('order:' + order_id, 'accumulated_fees', fee);
	}
	else if ( data.type == 'done' )
	{
		// canceled stoploss order
		// {
		// 	order_id:'07a26445-6e24-4296-b4f9-526c99a2a41a'
		// 	price:'0.1'
		// 	product_id:'XLM-EUR'
		// 	profile_id:'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4'
		// 	reason:'canceled'
		// 	remaining_size:'2'
		// 	sequence:2208767112
		// 	side:'sell'
		// 	time:'2021-04-27T09:02:24.099982Z'
		// 	type:'done'
		// 	user_id:'5aed28830f7c2f0189a7a12e'
		// 	x_server_time:'2021-04-27T09:02:24.163Z'
		// }
		// complete buy order (taker)
		// {
		// 	order_id:'d1a55558-203c-4008-aae3-157a3d76ded4'
		// 	product_id:'XLM-EUR'
		// 	profile_id:'c1d0e96e-5e6d-4613-ad1e-b1db3ee4fde4'
		// 	reason:'filled'
		// 	sequence:2208732860
		// 	side:'buy'
		// 	time:'2021-04-27T08:52:46.932361Z'
		// 	type:'done'
		// 	user_id:'5aed28830f7c2f0189a7a12e'
		// 	x_server_time:'2021-04-27T08:52:47.004Z'
		// }
		
		logger.trace( data, 'Order done.' );

		const record_id = 'order:' + data.order_id;

		// Set status of this order
		
		redisServer.hset( record_id, 'status', data.reason );
		

		// Add this event to the order history
		
		redisServer.rpush( record_id + ':history', JSON.stringify(data) );
		
		
		// Remove from list of open orders, move to completed and publish

		redisServer.smove( "orders:open", "orders:completed", data.order_id );
		

		// Publish that we have a completed order

		redisServer.publish( "orderfeed", data.order_id );


		console.log(`Order ${data.side} ${data.product_id} complete ${data.reason} (${data.order_id})`);
	}
	else
	{
		logger.warn(data, 'Unhandled message type');
		console.log('Unhandled message type', data.type);
		console.log(data);
	}


	// Publish our own heartbeat, clients can use this to check if server is running
	
	const SERVER_HEARTBEAT_TTL_SECONDS = 60;
	redisServer.set('server.heartbeat', new Date().toISOString(), 'EX', SERVER_HEARTBEAT_TTL_SECONDS);
}



/* ********************************************************************

   POSITIONS MANAGER SUBPROCESS
   ./server.js positions-manager

   This process is also managed by 'server.js start'. It listens
   to messages from the exchange-connector and for orders that match
   a position, it updates the position in the database.

   It also handles auto-closing of positions based on the take_profit,
   stop_loss and close_at_time fields.

*/

var open_positions = [];

async function startPositionManager(yargs)
{
	var orderfeed = null;

	try
	{
		// Load open positions, we're tracking them for close_at_time, take-profit and stop-loss
		// IMPROVEMENT: Send redis pubsub msg when positions change to force immediate refresh over interval based
		
		pm_refresh_positions();

		setInterval( pm_refresh_positions, 30 * 1000 );


		// timer to check if any positions are set to be closed at specific time

		setInterval( pm_handle_timer, 1 * 1000 );
		
		
		// set up a pubsub listener for orders and tickers

		orderfeed = redis.getRedisClient();
		orderfeed.on("message", function( channel, message ) {
			if ( channel == 'orderfeed' )
			{
				pm_handle_order( message );
			}
			else if ( channel == 'tickerfeed' )
			{
				pm_handle_ticker( JSON.parse( message ) );
			}
		});

		orderfeed.subscribe('orderfeed', 'tickerfeed');
		
		console.log('Positions Manager running. (Press Ctrl-C to quit.)');
		await tools.keypress();

		orderfeed.close();
		orderfeed = null;
		
		console.log('Positions Manager stopped.');
	}
	finally
	{
		if ( orderfeed != null )
			orderfeed.quit();
	}
}



async function pm_handle_order( order_id )
{
	console.log( "Handling order", order_id );

	/*
	    PSEUDOCODE:

	    Look up position from psql - find if we are in new or open mode
	    If in 'new' mode, we're here b/c buy order is complete
	        Lookup order_id hash in redis
	            set size = hash.executed_size
				set price = hash.executed_value / executed_size
		    Set buy_fees = hash.accumulated_fees
		    Set status = 'open'
			Set buy_fill_price = avg( order:history[type=match].price )
	    If in 'open' mode, we're here b/c sell order is complete
		    Lookup order_id hash in redis
			    set sell_fill_price = avg( order:history[type=match].price )
				set close_time = now()
				set result = hash.executed_value - (db.size*db.price) - (db.buy_fees + hash.accumulated_fees)
			Set status = 'closed'
	*/

	try
	{
		const pg = pgw.getPostgresSingleton(); // adds a refcount so we keep one connection for the entire msg proc
		const server = redis.getRedisClientSingleton();

		const order_info = await server.hgetallAsync( 'order:' + order_id );
		if ( order_info.position == null )
		{
			console.log("Order", order_id, "is not tracked by position, ignoring.");
			return;
		}

		const position_info = await positions.get( order_info.position );
		console.log("Order", order_id, "for position '" + order_info.position + "'.");

		if ( position_info.status == 'new' )
		{
			// Position has been opened

			if ( order_info.status == 'done' || order_info.status == 'filled' )
			{
				var size = order_info.executed_size;
				var price = order_info.executed_value / order_info.executed_size;
				var fees = order_info.accumulated_fees;

				await positions.updateOnCompletedBuy( order_info.position, size, price, fees );
			}
			else if ( order_info.status == 'canceled' )
			{
				await positions.updateOnCanceledBuy( order_info.position );
			}
		}
		else if ( position_info.status == 'open' )
		{
			// Position may be closing

			if ( order_info.status == 'done' || order_info.status == 'filled' )
			{
				var size = order_info.executed_size;
				var price = order_info.executed_value / order_info.executed_size;
				var fees = order_info.accumulated_fees;

				if ( order_info.executed_size != position_info.size )
				{
					console.log( "Closing position sell did not sell entire quantity.", size, "vs", position_info.size );
					logger.error( { order: order_info, position: position_info }, "Closing position sell did not sell entire quantity." );
				}

				var result = order_info.executed_value - (position_info.size * position_info.price);
				result -= position_info.buy_fees;
				result -= fees;

				await positions.updateOnCompletedSell( order_info.position, price, fees, result );
				
				console.log( "Sell order was completed with result", result.toFixed(2) );
			}
			else if ( order_info.status == 'canceled' )
			{
				console.log( "Sell order was canceled, position returning to open." );
				await positions.removeSellOrder( order_info.position );
			}
		}
	} 
	finally
	{
		redis.closeRedisSingleton();
		pgw.closePostgresSingleton();
	}
}



async function pm_handle_ticker( ticker )
{
	// PSEUDOCODE: Manage a table of open positions with take_profit, stop_loss set
	// Evaluate the product and price vs these, then initiate closing of the position
	// if price>take_profit or price<stop_loss.

	//console.log( ticker );

	for ( position of open_positions )
	{
		if ( ticker.product_id != position.product )
			continue;

		if ( position.status == 'soft' )
		{
			// TODO: Check if we're in position to open a soft position
			// soft position := a buy order that is not placed with the exchange, but executed once market price
			// is correct, provided there is sufficient funds available in the account. This means we can 'buy the dip'
			// of the first product to dip, effectively hedging bets that could not be made on the exhange since a buy
			// order locks our funds. drawback is that we most certainly become a taker, which has higher fees
			// for high volume traders
		}
		else if ( position.status == 'open' )
		{
			// We're already selling this position

			if ( position.sell_order_id != null )
				continue;

			// Order is open, check if time to sell

			if ( position.take_profit && Number(position.take_profit) < Number(ticker.best_bid) )
			{
				// market price is higher than take_profit, sell
				console.log( "Position", position.name, "has reached take-profit level at", Number(ticker.best_bid).toFixed(2) );
				
				await pm_spawn_trade_market_sell( position.name );
				position.status = 'closed'; // artificial until we're updating the table from the database
			}

			if ( position.stop_loss && Number(ticker.best_bid) < Number(position.stop_loss) )
			{
				console.log( "Position", position.name, "has reached stop-loss level at", Number(ticker.best_bid).toFixed(2) );

				await pm_spawn_trade_market_sell( position.name );
				position.status = 'closed'; // artificial until we're updating the table from the database
			}
		}
	}
}



async function pm_handle_timer( )
{
	// PSEUDOCODE: Manage a table of open positions with close_at_time set
	// Check if current time > close_at_time, in which case we should initiate
	// closing of the position at market price.

	for ( position of open_positions )
	{
		if ( position.status == 'open' )
		{
			// we're artificially updating positions when we change them here as we wait for the main db to be updated

			if ( position.close_at_time && position.close_at_time < tools.now() )
			{
				console.log("Position", position.name, "set to close at", position.close_at_time.toLocaleString() );
				
				await pm_spawn_trade_market_sell( position.name );
				position.status = 'closed'; // the artificial update to avoid sending two sell orders
			}
		}
	}
}



async function pm_refresh_positions( )
{
	try
	{
		open_positions = await positions.list( 'open' );
	}
	catch( error )
	{
		logger.error( error, "Cannot update list of open positions (timer)" );
		open_positions = [];
	}
}



async function pm_spawn_trade_market_sell( position )
{
	var child = spawn('node', ["./trade.js", "close", position, "market" ] );
	
	child.stdout.on('data', (data) => {
		process.stdout.write('trade.js: ' + data);
	});

	var done = false;
	child.on('exit', function( code ) {
		done = true;
	});

	while (!done) await tools.sleep( 100 );

	console.log("Child trade.js completed.");
}