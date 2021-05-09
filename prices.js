#!/usr/bin/env node

const tools = require('./tools');
const clc = require('cli-color');
const logger = require('./logger').log;
const yargs = require('yargs');
var coinbase = require('./coinbase');
const { Client } = require('pg');
var APIKeys = require('./apikeys');

main();


async function main()
{
	handleCommandLine();
}


function handleCommandLine()
{
    const argv = yargs
    .command('sync <product>', 'Sync prices to postgres database', (yargs) => {
        yargs.positional('product', {
			description: 'The product to display price history for, e.g. BTC-EUR',
			type: 'string'
		})
		.option('granularity', {                      // 1m 5m  15m 1h   6h    24h
			description: 'Granularity for price history [60|300|900|3600|21600|86400]',
			alias: 'g',
			type: 'number',
			default: 900
		})
		.option('startDate', {                      // 1m 5m  15m 1h   6h    24h
			description: 'Start date to sync if no entries exist',
			alias: 'd',
			type: 'string',
			default: '2019-1-1'
		})
        },
		(yargs) => { 
			const defaultStartDate = new Date( new Date(yargs.startDate).getTime() - (yargs.granularity * 1000));
			syncPrices( yargs.product, yargs.granularity, defaultStartDate);
		}
    )
	.command('syncall', 'Sync all prices to postgres database', (yargs) => {
		yargs.option('granularity', {                      // 1m 5m  15m 1h   6h    24h
			description: 'Granularity for price history [60|300|900|3600|21600|86400]',
			alias: 'g',
			type: 'number',
			default: 900
		})
        },
		(yargs) => { syncAllPrices(yargs.granularity) }
    )
	.option('verbose', {
		alias: 'v',
		description: 'Enable verbose logging',
		type: 'boolean',
	})
    .help()
    .alias('help', 'h')
    .argv;

    return argv;
}

async function syncAllPrices(granularity)
{
	const DEFAULT_START_DATE = new Date( new Date(2019,1-1,1).getTime() - (granularity * 1000));

	const products = ['BTC-EUR', 'ETH-EUR', 'LTC-EUR', 'ADA-EUR', 'LINK-EUR', 'SUSHI-EUR'];
	
	for ( const product of products )
		await syncPrices(product, granularity, DEFAULT_START_DATE);
}

async function syncPrices(product, granularity, defaultStartDate)
{
	// const DEFAULT_HISTORY_DAYS = 5;
	// const DEFAULT_START_DATE = new Date( new Date().getTime() - 1000 * 60 * 60 * 24 * DEFAULT_HISTORY_DAYS ); //new Date(2019,12-1,31,23,45)
	
	const client = new Client( APIKeys.POSTGRES_SETTINGS );
	await client.connect();

	const res = await client.query('select lastentry from syncstatus where product = $1 and granularity = $2', [product, granularity] );

	var lastEntryTime = res.rowCount > 0 ? new Date(res.rows[0].lastentry) : defaultStartDate;
	console.log( res.rowCount > 0 ? "Last entry for " + product + " is " + lastEntryTime : "No previous entries for " + product)

	var lastNewRecordTime = await syncPriceHistory(client, product, lastEntryTime, granularity);

	await client.query(  res.rowCount > 0 ? "update syncstatus set lastentry = $2 where product = $1 and granularity = $3" : "insert into syncstatus(product, lastentry, granularity) values($1,$2,$3)", [product, lastNewRecordTime, granularity] );

	await client.end();
}

async function syncPriceHistory(client, product, lastEntryTime, granularity)
{
	const COINBASE_MAX_RECORDS_PER_APICALL = 300;

	var currentTime = new Date(); // haha it is current not for long ;) must not include the very last period, which may be incomplete
	currentTime = new Date(currentTime.getTime() - currentTime.getTime() % ( granularity * 1000 ) - ( granularity * 1000 ) );
	console.log(currentTime);

	var startDate = null, endDate = null, last_record_time = null;

	do
	{
		startDate = new Date( lastEntryTime.getTime() + (granularity * 1000) );
		endDate = new Date( Math.min(startDate.getTime() + (granularity * 1000 * COINBASE_MAX_RECORDS_PER_APICALL), currentTime.getTime()) );
		
		if ( startDate > endDate ) // nothing more to do
			return lastEntryTime;

		console.log( "Syncing price history for", product, "since", startDate, "until", endDate );
		lastEntryTime = await getPriceHistoryAndWriteToDatabase(client, product, startDate, endDate, granularity);
	}
	while ( endDate < currentTime );

	return lastEntryTime;
}

async function getPriceHistoryAndWriteToDatabase(client, product, startDate, endDate, granularity)
{
	var prices = await getPriceHistory(product,  startDate, endDate, granularity);

	for (const entry of prices) 
	{
		if ( entry.time < startDate ) throw new Error("Record received is older than one we have in our system.");

		await client.query( 
			"INSERT INTO pricehistory(product,time,open,high,low,close,volume,granularity) VALUES($1,$2,$3,$4,$5,$6,$7,$8);",
			[
				product,
				entry.time,
				entry.open,
				entry.high,
				entry.low,
				entry.close,
				entry.volume,
				granularity
			]);
	};

	return prices.length ? prices[prices.length-1].time : endDate; // if no records found, return enddate so we can try again
}

var lastApiCall = null;
async function getPriceHistory(product, startDate, endDate, granularity)
{
	const MIN_TIME_BETWEEN_PUBLIC_API_CALLS = 333;

	if ( lastApiCall != null )
	{
		var timeSinceLastCall = new Date().getTime() - lastApiCall.getTime();
		if ( timeSinceLastCall < MIN_TIME_BETWEEN_PUBLIC_API_CALLS )
		{
			console.log("API throttling", MIN_TIME_BETWEEN_PUBLIC_API_CALLS - timeSinceLastCall);
			await tools.sleep( MIN_TIME_BETWEEN_PUBLIC_API_CALLS - timeSinceLastCall );
		}
	}

	var priceArray = await coinbase.getPublicClient().getProductHistoricRates(product, { start: startDate, end: endDate, granularity: granularity });
	lastApiCall = new Date();
	
	priceArray.sort( (lhs, rhs) => { return lhs[0] < rhs[0] ? -1 : 1; } )

	var res = [];
	
	priceArray.forEach( (e) => {
		var tick = {
			time: new Date(e[0]*1000),
			low: e[1],
			high: e[2],
			open: e[3],
			close: e[4],
			volume: e[5]
		};

		res.push(tick);
	});

	
	return res;
}

