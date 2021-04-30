#!/usr/bin/env node

const logtool = require('./logger');
var logger = logtool.log;

const tools = require('./tools');
const clc = require('cli-color');
const yargs = require('yargs');
const redis = require('redis');
const { spawn } = require('child_process');

var coinbase = require('./coinbase');

const CoinbasePro = require('coinbase-pro');
var APIKeys = require('./apikeys');
const { boolean } = require('yargs');


const MAX_SILENT_TIME_SEC = 90;
var lastMessageReceived = new Date();  // used to check heartbeat received and connection is good



async function handleCoinbaseMessage(data, redisServer)
{
	// We must handle the heartbeats; if no heartbeat received in 10 seconds, we must restart the server
	// and somehow sync up on our orders on start

	lastMessageReceived = new Date(); // used to check heartbeat received and connection is good

	if ( data.type == 'heartbeat' ) // but don't process these
		return;


	// push message on for generic consumption

	data.x_server_time = new Date();
	redisServer.publish(data.type, JSON.stringify(data)); // not sure if we need this? but nice for dev and debug.


	// specific handling of messages

	if  ( data.type == 'ticker' )
	{
		const TICKER_TTL_SECONDS = 120; // TODO: Must be set to something else?

		redisServer.set('ticker.' + data.product_id, JSON.stringify(data), 'EX', TICKER_TTL_SECONDS);
		redisServer.publish('tickerfeed', JSON.stringify(data));
	}
	else if ( data.type == 'l2update')
	{
		null;
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
	// When the order is done, either cancelled or filled, we should also push
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
			redisServer.set('clientid:' + data.client_oid, data.order_id);
		}


		// Store last order status and add to set which is order history

		const record_id = 'order:' + data.order_id;
		redisServer.sadd( record_id + ':history', JSON.stringify(data));


		// Mark as open order

		redisServer.sadd( "orders:open", data.order_id );

		
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
		redisServer.sadd( record_id + ':history', JSON.stringify(data) );

		
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
			redisServer.set('clientid:' + data.client_oid, data.order_id);
		}

		
		// Add this event to the order history
		
		const record_id = 'order:' + data.order_id;
		redisServer.sadd( record_id + ':history', JSON.stringify(data) );


		// Mark as open order

		redisServer.sadd( "orders:open", data.order_id );


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

		if ( data.user_id == data.taker_user_id )
		{
			redisServer.sadd('order:' + data.taker_order_id + ':history', JSON.stringify( data ));
			
			console.log("Match taker", data.product_id, "size", data.size, "price", data.price, "fee", data.taker_fee_rate, `(${data.taker_order_id})`);
		}
		else
		{
			redisServer.sadd('order:' + data.maker_order_id + ':history', JSON.stringify( data ));

			console.log("Match maker", data.product_id, "size", data.size, "price", data.price, "fee", data.maker_fee_rate, `(${data.maker_order_id})`);
		}

	}
	else if ( data.type == 'done' )
	{
		// cancelled stoploss order
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
		
		redisServer.set( record_id + ':status', data.reason );
		

		// Add this event to the order history
		
		redisServer.sadd( record_id + ':history', JSON.stringify(data) );
		
		
		// Remove from list of open orders, move to completed and publish

		redisServer.smove( "orders:open", "orders:completed", data.order_id );
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

function checkHeartbeat()
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

async function startServer(yargs)
{
	const redisServer = redis.createClient();
	redisServer.on("error", (error) => {
		logger.error(error, "Redis error");
	});

	websocket = coinbaseListener(redisServer);

	setInterval( checkHeartbeat, 10000 );

	console.log('Server running. Press Ctrl-C to abort.');
	await tools.keypress();

	websocket.disconnect();
	redisServer.end();

	console.log('Server stopped.');
}

async function wrapServer(yargs)
{
	console.log("Starting server as child process. Press Ctrl-C to exit.");

	while( true )
	{
		var child = spawn('node', ["./server.js", "start"] );
		console.log("Server running as pid:", child.pid);

		var stopped = false;
		child.on('exit', function(code) {
			console.log('Child process stopped, restarting.');
			stopped = true;
		});

		child.stdout.on('data', (data) => {
			process.stdout.write('Child: ' + data);
		});

		while( !stopped )
			await tools.sleep(1000);
	}
}

async function displayTicker( yargs )
{
	var product = yargs._[1];

	// Retrieving from redis, requiring that server is running or this is stale

	const redisClient = redis.createClient();
	redisClient.get('ticker.' + product, (err, tickerJson) => {
		if ( tickerJson == null )
		{
			console.log('Ticker not found, is server running?');
		}
		else
		{
			var data = JSON.parse(tickerJson);

			var msgTime = Date.parse(data.time);
			if ( new Date() - msgTime > 20 * 1000 ) // 20 seconds max for ticker
			{
				logger.warn(data, "Ticker outdated, is server running?");
				console.error("Note! Ticker outdated, is server running?");
			}

			if ( yargs.raw )
			{
				console.log(data);
			}
			else
			{
				console.log(product, "Bid:", data.best_bid, "Ask:", data.best_ask, "Spread:", (Math.abs(data.best_bid - data.best_ask)).toFixed(2), "Timestamp:", data.time);
			}
		}

		redisClient.end(true);
	});
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

function parseCommandLine()
{
    const argv = yargs
    .command('start', 'Start the server', {
        // budget: {
        //     description: 'the amount of money to buy for',
        //     alias: 'b',
        //     type: 'number',
        //     demandOption : true
        },
		(yargs) => { setupLogging(yargs); startServer(yargs) }
    )
	.command('safe', 'Run the server as child process and restart on failure', {
        // budget: {
        //     description: 'the amount of money to buy for',
        //     alias: 'b',
        //     type: 'number',
        //     demandOption : true
        },
		(yargs) => { setupLogging(yargs); wrapServer(yargs) }
    )
    .command(
		'ticker', 
		'Display ticker information <product>', 
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
	.option('verbose', {
		alias: 'v',
		description: 'Enable verbose logging',
		type: 'boolean',
		default: false
	})
	.option('logfilename', {
		description: 'Choose alternate log file name (default is log.json)',
		type: 'string'
	})
    .help()
    .alias('help', 'h')
    .argv;

    return argv;
}

async function main()
{
	parseCommandLine();
}

main();