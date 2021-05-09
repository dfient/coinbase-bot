#!/usr/bin/env node

/*

*** TRADE (BOT) ***

Automated limit, stoploss and target trade system
Executes a single trade, either at limit or market price

./trade --help for instructions

EXAMPLES

./trade limit -l 10000 -b 10 -s 10.0 -t 2.5
> Places limit order at EUR 10.000 with budget of 10 EUR (calculates order size), stoploss at 10% and target at 2.5%

./trade market -b 10 -s 10.0 -t 2.5
> Places buy order immediately at market price, stoploss at 10% and target at 2.5%

Hint: You can cancel the stoploss order using Coinbase app or web and bot will continue running until target reached
without loss protection. If you also kill the bot, you essentially have a HODL.

Hint: Use screen to make sure this continues to run if you loose your terminal connection,
alternatively schedule jobs using at or chron

*/

const logtool = require('./logger');
var logger = require('./logger').log;

var tools = require('./tools');
var coinbase = require('./coinbase');
var clc = require('cli-color');
const yargs = require('yargs');
const twilio = require('./twilio');
const APIKeys = require('./apikeys');
const { abort } = require('process');
const math = require('mathjs');
fs = require('fs');

var g_commandLineHandled = false; // set to true when command line handled, so not to output --help hint message

async function waitTilOrderFilled(orderId)
{
	// Following order to see when it is filled
	do 
	{
		filled = await coinbase.checkIfOrderFilled(orderId); // this will not throw, but lie on the result and return not filled
		if ( filled )
			return true;
		
		await tools.sleep(250);
	} 
	while( true );
}

async function _calculateTradeResult(buyOrderId, sellOrderId)
{
	logger.trace({buyOrderId, sellOrderId}, "_calculateTradeResult");
		
	await tools.sleep(250); // very rudely avoid rate limit problems here as we make two private calls and often after another status check
	var buyOrder = await coinbase.getPrivateClient().getOrder(buyOrderId);
	logger.trace(buyOrder, "Buy Order details");
	
	await tools.sleep(250); // very rudely avoid rate limit problems here as we make two private calls and often after another status check
	var sellOrder = await coinbase.getPrivateClient().getOrder(sellOrderId);
	logger.trace(sellOrder, "Sell Order details");


	var res = {
		fees: parseFloat(sellOrder.fill_fees) + parseFloat(buyOrder.fill_fees),
		result: (sellOrder.price * sellOrder.filled_size) - (buyOrder.price * buyOrder.filled_size)
	};
	
	logger.trace(res, "Order price difference %d", res.result-res.fees);
	return res;
}

async function tradebot(priceLimit, size, stopLossPrice, sellAtPrice, product, productInfo = null)
{
	// Check that we have the info we need

	if ( product == null || product == "" ) throw new Error("Product cannot be null or empty");
	
	if ( productInfo == null )
	{
		logger.trace("Caller did not submit productinfo. Possible improvement.");
		productInfo = await coinbase.getProductInfo( product );
	}


	// Buy initial position with limit, wait for order to be fulfilled
	
	console.log(new Date().toISOString(), "Placing buy order at", priceLimit);
	logger.debug({limit:priceLimit,size:size}, 'Placing initial limit buy order');
	var buyTime = new Date();
	var buyOrderId = await coinbase.buyLimitPrice(priceLimit, size, product); // note this can throw
	logger.info({limit:priceLimit,size:size,orderId:buyOrderId}, 'Buy order placed.')
	
	
	// Now wait for the initial limit order to fill
	
	logger.info("Waiting for order to fill");
	console.log("Waiting for order to fill."); // note we need to monitor and show market price here
	//await waitTilOrderFilled(buyOrderId); // will not throw
	
	{
		var hiWatermark = 0.0, loWatermark = 2000000000;
		var didPrint = false;

		while(true)
		{
			// TODO: Replace with lookup of order status from redis (with fallback to live api)
			var limitOrderStatus = await coinbase.checkIfOrderDone( buyOrderId );
			if ( limitOrderStatus.done && limitOrderStatus.status == "canceled" )
			{
				// order has been cancelled in the ui, abort our process
				console.log("Order has been cancelled by other user/process, stopping.");
				return 0;
			}
			else if ( limitOrderStatus.done && limitOrderStatus.status == "filled" )
			{
				// order has filled, proceed with stoploss and take profit
				break;
			}
		
			didPrint = true;

			var marketprice = await coinbase.getMarketAskPrice(product);
			marketprice < loWatermark ? loWatermark = marketprice : null;
			marketprice > hiWatermark ? hiWatermark = marketprice : null;
			
			var distance = marketprice - priceLimit;
			percentDiff = (1 - (marketprice/priceLimit)) * 100;
			
			process.stdout.write(clc.erase.line);
			process.stdout.write(clc.move.lineBegin);
			process.stdout.write('Market price: ' + marketprice.toFixed( productInfo.x_quote_precision ) + ' ');
			process.stdout.write(marketprice > priceLimit ? ' (Distance: ' + clc.green(percentDiff.toFixed( 5 ) + '%') + clc.blue(' €' + distance.toFixed( productInfo.x_quote_precision )) + ') ' : '');
			process.stdout.write('[Hi: ' + hiWatermark.toFixed( productInfo.x_quote_precision ) + ' Lo: ' + loWatermark.toFixed( productInfo.x_quote_precision ) + ']');
			// IMPROVEMENT: Pick right currency symbol above based on product
			
			await tools.sleep(250); // rate limit private call to checkIfOrderFilled
		}

		if ( didPrint )
			process.stdout.write('\n');
	}
	
	
	var fulfillTime = new Date();
	logger.info({orderId:buyOrderId}, "Order fulfilled.");
	console.log(new Date().toISOString(), "Order fulfilled after", ((((fulfillTime.getTime() - buyTime.getTime()) / 1000) / 60) / 60).toFixed(2), "hours.");
	
	
	// Order is filled, now place stop loss order
	
	logger.debug({stoploss:stopLossPrice}, "Placing stoploss order");
	console.log( "Placing stop loss order at", stopLossPrice.toFixed( productInfo.x_quote_precision ) );
	var stopLossOrderId = await coinbase.setLossProtection(stopLossPrice, size, product); // this can throw, leaving us at risk for loss!
	logger.info({orderId:stopLossOrderId}, "Stoploss order placed.")
	
	
	// Monitor price, sell at gain or at deadline
	
	console.log("Watching market, selling at", sellAtPrice.toFixed( productInfo.x_quote_precision ) );
	
	var count = 0;
	var marketPrice = await coinbase.getMarketBidPrice( product ); // will not throw, but lie and return last market price or 0 if very first call
	var hiWatermark = marketPrice;
	var loWatermark = marketPrice;
	var didPrintTickers = false;

	do {
		// IMPROVEMENT: Move marketPrice update to the end of the loop, we're calling twice "in a row" in first iteration
		marketPrice = await coinbase.getMarketBidPrice(product); // will not throw, but lie and return last market price;
		
		if (marketPrice > hiWatermark) {
			hiWatermark = marketPrice;
			logger.trace({highWatermark: hiWatermark}, "New high watermark.");
		}
		
		if (marketPrice < loWatermark) {
			loWatermark = marketPrice;
			logger.trace({lowWatermark: loWatermark}, "New low watermark.");
		}
		
		// check if we should sell
		// unlikely but with very quick large price changes the stop order may trigger while we enter here
		// this will fail selling at target (and we should have an exception at cancelOrder)
		// need to investigate this more
		if ( marketPrice >= sellAtPrice )
		{
			if ( didPrintTickers ) process.stdout.write('\n');

			logger.info("Goal reached, cancelling stoploss order.");
			console.log(new Date().toISOString(), "Goal reached, cancelling stoploss order", stopLossOrderId);
			var result = await coinbase.cancelOrder(stopLossOrderId); // will not throw, but retry (in infinite loop if continues failing)
			
			logger.info({marketPrice: marketPrice}, "Placing sell order at market price.");
			console.log(new Date().toISOString(), "Placing sell order at market price", marketPrice.toFixed( productInfo.x_quote_precision ) );
			var sellOrderId = await coinbase.sellAtPrice(marketPrice, size, product); // will throw, potentially leaving us without gain and no stop order (possible loss)
			logger.info({orderId: sellOrderId}, "Sell order placed, waiting for order to fill.");
			
			// Weakness: If we got a very short spike, we may now be requesting a price market is not willing to pay
			// We could post the sell order at market price, and get the best possible price
			// or we can abort after a few seconds and try again later
			await waitTilOrderFilled(sellOrderId); // will not throw
			logger.info("Sell order has filled.");
			console.log(new Date().toISOString(), "Sell order has filled.");

			var res = await _calculateTradeResult(buyOrderId, sellOrderId);
			await twilio.sendTextMessageAsync(`${product} trade completed at target ${sellAtPrice}. Budget ${(priceLimit*size).toFixed( productInfo.x_quote_precision )} (Limit ${priceLimit}; Size ${size}). Result: ${(res.result - res.fees).toFixed( productInfo.x_quote_precision )}`);
			
			return res.result - res.fees;
		}
		
		// check if stoploss is fulfilled, if so abort
		logger.trace("Checking if stoploss order has filled."); // too verbose
		var stopLossOrderFilled = await coinbase.checkIfOrderFilled(stopLossOrderId); // will not throw, but lie on result
		if ( stopLossOrderFilled )
		{
			if ( didPrintTickers ) process.stdout.write('\n');

			logger.info("Stoploss order filled, aborting further trading. Godspeed.");
			console.log(new Date().toISOString(), "Stop loss triggered, aborting further trading.");

			var res = await _calculateTradeResult(buyOrderId, stopLossOrderId);
			await twilio.sendTextMessageAsync(`${product} trade aborted by stoploss ${stopLossPrice}. Budget ${(priceLimit*size).toFixed( productInfo.x_quote_precision )} (Limit ${priceLimit}; Size ${size}). Result: ${(res.result - res.fees).toFixed( productInfo.x_quote_precision )}`);

			return res.result - res.fees;
		}
		
		if (++count % 4) // for performance reasons, only update console every ~1 seconds
		{
			didPrintTickers = true;

			percentDiff = (1 - (marketPrice/priceLimit)) * 100;
			
			process.stdout.write(clc.erase.line);
			process.stdout.write(clc.move.lineBegin);
			process.stdout.write('Market price: ' + marketPrice.toFixed( productInfo.x_quote_precision ));
			process.stdout.write(marketPrice > priceLimit ? clc.green(' (Up ' + percentDiff.toFixed( 5 ) + '%)') : clc.red(' (Down ' + percentDiff.toFixed( 5 ) + '%)'));
			
			var distance = sellAtPrice - marketPrice;
			process.stdout.write(' [Hi: ' + hiWatermark.toFixed( productInfo.x_quote_precision ) + ' Lo: ' + loWatermark.toFixed( productInfo.x_quote_precision ) + ' Distance: ' + distance.toFixed( productInfo.x_quote_precision ) + ']');
		}
		
		await tools.sleep(250); // sleep to throttle api calls, we can make 4 every second, we should be very safe with this when latency considered
		
	} while( true );
}

async function _commonTradeProc(argv, limitPrice)
{
	logger.trace({argv, limitPrice}, '_commonTradeProc');
	
	// Global variables to initialize our trade
	// Refactor and move these to main
	
	const buyingPrice = limitPrice;
	const budget = argv.budget;
	const stopLossPrcnt = argv.stoploss;
	const takeGainsPrcnt = argv.target;

	const productInfo = await coinbase.getProductInfo(argv.product);
	const coins = Number( (budget / buyingPrice).toFixed( tools.countDecimals( productInfo.base_increment ) ) );
	
	logger.info({ price: buyingPrice, size: coins, budget: budget, stopLoss: stopLossPrcnt, target: takeGainsPrcnt, product: argv.product}, "Buying");
	console.log( "Buying", coins, argv.product, "at", buyingPrice, "EUR (Budget:", budget, "EUR )" );

	const minSize = parseFloat( productInfo.base_min_size );
	if ( coins < minSize )
		throw new Error(`Budget is too low, minimum size for ${argv.product} is ${minSize}`);
	
	var stopLossPrice = buyingPrice - (buyingPrice * stopLossPrcnt / 100);
	var sellAtPrice = buyingPrice + (buyingPrice * takeGainsPrcnt / 100);
	
	stopLossPrice = Number( stopLossPrice.toFixed( productInfo.x_quote_precision ) );
	sellAtPrice = Number( sellAtPrice.toFixed( productInfo.x_quote_precision ) );
	
	console.log( "Stop loss:", stopLossPrice, "EUR, Target:", sellAtPrice, "EUR.");
	logger.info({stopLossPrice:stopLossPrice, targetPrice:sellAtPrice}, "Stoploss and target prices.");
	
	var result = await tradebot(buyingPrice, coins, stopLossPrice, sellAtPrice, argv.product);
	logger.info({net:result}, "Trade completed.")
	console.log("Trade completed at", new Date().toISOString(), "with result:", result.toFixed(2));
}

async function limitTrade(argv)
{
	await _commonTradeProc(argv, argv.limit);
}

async function marketTrade(argv)
{
	logger.trace('marketTrade, retrieving market price');
	var marketPrice = await coinbase.getMarketAskPrice( argv.product );
	await _commonTradeProc(argv, marketPrice);
}

async function autoTrade( argv )
{
	logger.info(argv, "Starting autotrade");

	var budget = argv.budget;
	console.log("Autotrading budget", budget.toFixed(2));
	
	var totalTrades = 0;
	var winTrades = 0, lossTrades = 0;

	// argv.ignoreTrend
	// argv.reinvestProfits

	// TODO: We need a pullback mechanism on failed trades (stoploss), e.g. wait a number of minutes?
	// Also, we don't want to lock ourselves to a trade that never seems to go in? Timeout for trades? Pull out of position after n minutes?

	await analyzeAndMonitorProducts( argv, async function (product, ticker) 
	{
		logger.info({ product : product.product, ticker : ticker }, "Starting autotrade of " + product.product);
		console.log( "Starting trade of", product.product );


		// Lookup product information, needed for precision and min quantity

		const productInfo = await coinbase.getProductInfo( product.product );
		const basePrecision = tools.countDecimals( productInfo.base_increment );
		const quotePrecision = tools.countDecimals( productInfo.quote_increment );
		const minimumPurchase = productInfo.min_market_funds;
		const minSize = parseFloat( productInfo.base_min_size );


		// Check if product can be traded

		if ( productInfo.cancel_only || productInfo.trading_disabled || productInfo.status != "online" )
		{
			// product cannot be traded, return
			logger.warn( "%s cannot be traded.", product.product );
			console.log( product.product, "trading is disabled." );
			return false;
		}


		// Check if budget is big enough
		
		if ( budget < minimumPurchase )
		{
			logger.warn( "%s cannot be traded, budget %d is below minimum %d", product.product, budget, minimumPurchase );
			console.log( "Budget", budget, "is below minimum purchase", minimumPurchase, "for", product.product );
			return false;
		}


		// Calculate target and stoploss prices

		const stopLossPrice = Number( Number( ticker.ask - (ticker.ask * argv.stoploss / 100) ).toFixed( quotePrecision ) );
		const sellAtPrice = Number( Number( ticker.ask + (ticker.ask * argv.target / 100) ).toFixed( quotePrecision ) );


		// Check precision and minimum quantity, forfeit trade if budget is too low
		
		const coins = Number( Number( budget / ticker.ask ).toFixed( basePrecision ) );
		
		if ( coins < minSize )
		{
			logger.warn(`Budget is too low, minimum size for ${argv.product} is ${minSize}`);
			console.log(`Budget is too low, minimum size for ${argv.product} is ${minSize}`);
			return false;
		}


		// Notify admin of trade start

		if ( !argv.disableSms )
		{
			var msg = `Autotrading ${product.product} at ${ticker.ask.toFixed(4)}, budget ${budget.toFixed(2)} for ${coins.toFixed(4)} coins. Target ${sellAtPrice.toFixed(2)}, stoploss at ${stopLossPrice.toFixed(2)}.`;
			await twilio.sendTextMessageAsync( msg );
		}


		// Start the tradebot

		// await tools.sleep(50000);
		// console.log( "Fake trade of", product.product, "completed." );
		// return false;

		try
		{
			var result = await tradebot( ticker.ask, coins, stopLossPrice, sellAtPrice, product.product, productInfo );
			console.log("Trade completed at", new Date().toISOString(), "with result:", result.toFixed(2));
			logger.info({net:result}, "Autotrade completed.");
		}
		catch( er )
		{
			logger.error( er, "Exception while executing tradebot" );
			// we may have lost a trade now, and therefore have a lower budget
			// is the safest to just stop the entire thingy now?
			// we do not have exception handling around buy and sell orders, so
			// e.g. a sell order attempt while connection issues will fail and stop the thingy
			// we must signal to our callers that this is irreparable?
			// send sms to admin? notify something is really wrong?
			// the tradebot could take an object as input and store order status there,
			// that would give us insight into what is wrong, e.g. know we have an open trade,
			// failed selling, etc.

			er.bitbotUnrecoverableSituation = true;
			throw er;
		}


		// Adjust the budget

		totalTrades++;
		if ( result < 0 )
		{
			lossTrades++;
			budget += result;
		}
		else
		{
			winTrades++;
			
			if ( argv.reinvestProfits )
				budget += result;
		}

		logger.info({ budget : budget }, "Updated budget");

		// Console information
		
		console.log("Updated budget is", budget.toFixed(2));
		console.log("No of trades", totalTrades, "Wins", winTrades, "Loss", lossTrades);

		return true;
	});
}

async function monitor( argv )
{
	logger.info(argv, "Starting monitor");
	console.log("Monitoring markets.", argv.disableSms ? "" : "Notifying via SMS on tradeable products.");
	console.log("Ticker granularity:", argv.granularity);
	console.log("Press Ctrl-C to stop.");

	// Do not send not more than 1 notification per granularity period
	var lastNotificationStore = {};

	await analyzeAndMonitorProducts( argv, async function (product, ticker) 
	{
		const currentTime = new Date();
		const thisNotificationPeriodStart = new Date( currentTime.getTime() - currentTime.getTime() % ( argv.granularity * 1000 ) );

		var lastNotification = lastNotificationStore[ product.product ];
		if ( lastNotification == null || lastNotification < thisNotificationPeriodStart )
		{
			var msg = product.product + " is tradeable at " + ticker.ask.toFixed(2);

			var target = ticker.ask + (ticker.ask * argv.target / 100);
			var stoploss = ticker.ask - (ticker.ask * argv.stoploss / 100);

			msg += " (Target " + target.toFixed(2) + ", Stoploss " + stoploss.toFixed(2) + ")";

			if ( !argv.disableSms )
				await twilio.sendTextMessageAsync( msg );

			lastNotificationStore[ product.product ] = new Date();

			console.log( new Date().toLocaleString(), msg );
		}

		return false;
	});
}

async function analyzeAndMonitorProducts(argv, triggerFunction)
{
	var analysis_options = getAnalysisArguments( argv );
	var analysis = await _analyzeAll( analysis_options );
	var tradeableProducts = filterTradeableProducts( analysis );
	var nextCandleTime = new Date( analysis_options.timeEnd.getTime() + (analysis_options.granularity * 1000 * 2) + 1 ); // give it one second after period close. enough?

	printProductStatus( analysis );
	printTradeableProducts( tradeableProducts );
	
	var tickCache = {}; // used to track if the ticker has changed since last notification (do not trigger every time)

	while( true )
	{
		

		// Check market price and see if we should enter a trade

		for ( product of tradeableProducts )
		{
			var ticker;

			try
			{
				ticker = await coinbase.getTicker( product.product, false, false );
			}
			catch( e )
			{
				logger.error( e, "Can not get updated ticker." );
				
				// TODO: Figure out what to do when this happens, how long do we ignore?
				await tools.sleep( 500 ); // sleep and see if error disappears
				
				continue;
			}

			// !!! (3/3)
			//
			// This is a key section of the code and part of our algo. (We should really abstract
			// and centralize algo decisions). We now evaluate the sum of _calculateTickerTrends (the evaluation part of analysis)
			// and _analyzeProduct (the decision part of analysis) and finally decide on the .trade_now with the current
			// ticker information
			//
			if ( ticker.ask < product.ticker[ product.ticker.length - 1].ema1 )
			{
				// this will trigger VERY frequently, let us only trigger if the ticker is different from last time

				var lastTicker = tickCache[ product.product ];
				if ( lastTicker && lastTicker.ask == ticker.ask )
					continue;

				tickCache[ product.product ] = ticker;

				// handle the tick

				logger.info( product.product + " triggered, price below ema1 at " + ticker.ask.toFixed(2) );

				if ( triggerFunction )
				{
					try
					{
						var res = await triggerFunction( product, ticker );

						// Trades typically take longer than a single candle to complete
						// therefore check how much time has progressed and break if necessary

						if ( new Date() > nextCandleTime )
							break; // break the for loop - TODO: test
						
					}
					catch( e )
					{
						// we must abort if this happens?
						// modules may add bitbotUnrecoverableSituation to indicate a must stop operation
						// possibly use this to keep e.g. running after e.g. events related to connection issues?
						// for now, safest to just exit the entire thingy to avoid damage

						logger.error( {exception : e, ticker : ticker }, "Exception in trigger function." );

						if ( !argv.disableSms )
						{
							const mode = argv._[0];
							var msg = `Unexpected error in bitbot ${mode}. Aborting.`;
							if ( e.bitbotUnrecoverableSituation && mode == "auto" )
								msg = `Unexpected and irrecoverable error in bitbot auto trade. Check coinbase.`;

							try { await twilio.sendTextMessageAsync( msg ); } catch( e ) { null; }
						}

						process.exit(1);
					}
				}
			}
		}
		
		// Check if our analysis is outdated
		
		if ( new Date() > nextCandleTime ) 
		{
			console.log("Product analysis is outdated, starting new price analysis.");

			// Time to update our analysis
			analysis_options = getAnalysisArguments( argv ); // do this to reset timeStart and timeEnd
			analysis = await _analyzeAll( analysis_options );
			tradeableProducts = filterTradeableProducts( analysis );
			nextCandleTime = new Date( analysis_options.timeEnd.getTime() + (analysis_options.granularity * 1000 * 2) + 1 ); // give it one second after period close. enough?

			printProductStatus( analysis );
			printTradeableProducts( tradeableProducts );
		}
		else
		{
			await tools.sleep( 250 ); // just keep our rate sensible
		}
	}
}

async function _analyzeAll( options )
{
	var all_analysis = [];

	for ( product of APIKeys.TRADING_PRODUCTS )
	{
		options.product = product;

		var analysis = await _analyzeProduct( options );
		analysis.product = options.product;

		all_analysis.push( analysis );

		await tools.sleep( 250 ); // keep our public api rate reasonable (until we switch to postgres for price history)
	}

	// Sort according to volatility, prioritizing highly volatile products (placing them first in the array will increase chance of early match)
	all_analysis.sort( (lhs, rhs) => { return lhs.stdev_volatility > rhs.stdev_volatility ? -1 : 1; } )

	return all_analysis;
}

function filterTradeableProducts( analysis_array )
{
	var new_array = [];

	for ( analysis of analysis_array )
	{
		if ( analysis.decision.tradeable )
			new_array.push( analysis );
	}

	return new_array;
}

function printTradeableProducts( analysis_array )
{
	var tradeableProducts = [];
	for ( a of analysis_array ) { tradeableProducts.push( a.product ); }

	if ( tradeableProducts.length > 0 )
		console.log( "Tradeable products", tradeableProducts );
	else
		console.log( "No tradeable products." );
}

function printProductStatus( analysis_array )
{
	console.log( "Product status at", new Date().toLocaleString() );

	for ( analysis of analysis_array )
	{
		var log = clc.green('🟩 ', analysis.product, " ");

		if ( !analysis.decision.tradeable )
			log= clc.red('🟥 ', analysis.product, " ");

		if ( !analysis.evaluation.sufficient_volatility )
			log += "❌ Volatility.";
		else 
			log += "✔️ Volatility.";

		if ( !analysis.evaluation.ema_allows_trading )
			log += "❌ Trend.";
		else
			log += "✔️ Trend";
		
		if ( !analysis.evaluation.price_allows_trading )
			log += "❌ Price.";
		else
			log += "✔️ Price.";

		console.log( log );
	}
}

async function prices(argv)
{
	var analysis = getAnalysisArguments(argv);
	var evaluation = await _analyzeProduct( analysis );
	var productInfo = await coinbase.getProductInfo( analysis.product );
	
	if ( argv.raw )
	{
		console.log( { ticker: evaluation.ticker } );
	}
	else
	{
		const zeroPad = (num, places) => String(num).padStart(places, '0');

		console.log( "# Price history for", analysis.product, "at", analysis.time.toLocaleString().replace(',',' '));
		console.log( "# Timespan:", analysis.timeStart.toLocaleString().replace(',',' '), "to", analysis.timeEnd.toLocaleString().replace(',',' ') + " with Granularity", analysis.granularity);
		console.log( "# Low avg", evaluation.low_avg.toFixed(2), "Hi avg", evaluation.high_avg.toFixed(2), "Hi/Lo Diff", evaluation.high_low_diff.toFixed(4) + "%" );
		console.log( "# Open avg", evaluation.open_avg.toFixed(2), "Close avg", evaluation.close_avg.toFixed(2), "O/C Diff", evaluation.open_close_diff.toFixed(4) + "%" );
		console.log( "# Volume avg", evaluation.volume_avg.toFixed(2) + ' (' + Number(evaluation.volume_avg * evaluation.close_avg).toFixed(2) + tools.getCurrencySymbolFromProduct(analysis.product) + ')');
		console.log( "# SMA", analysis.sma_periods, "EMA1", analysis.ema1_periods, "EMA2", analysis.ema2_periods);
		console.log( "" );
		console.log("period,datetime,volume,open,high,low,close,price_avg,close_moving_avg,lo_moving_avg,hi_moving_avg,ema1,ema2");

		var period = 0;
		for ( tick of evaluation.ticker )
		{
			var csv_line = ++period
							+','+tick.time.getFullYear()+'-'+zeroPad(tick.time.getMonth()+1,2)+'-'+zeroPad(tick.time.getDate(),2)
							+' '+zeroPad(tick.time.getHours(),2)
							+':'+zeroPad(tick.time.getMinutes(),2)
							+':'+zeroPad(tick.time.getSeconds(),2)
							+','+tick.volume.toFixed(2)					
							+','+tick.open.toFixed( productInfo.x_quote_precision )
							+','+tick.high.toFixed( productInfo.x_quote_precision )
							+','+tick.low.toFixed( productInfo.x_quote_precision )
							+','+tick.close.toFixed( productInfo.x_quote_precision )
							+','+tick.price_avg.toFixed( productInfo.x_quote_precision )
							+','+(tick.close_sma == null ? "" : tick.close_sma.toFixed( productInfo.x_quote_precision ))
							+','+(tick.low_sma == null ? "" : tick.low_sma.toFixed( productInfo.x_quote_precision ))
							+','+(tick.high_sma == null ? "" : tick.high_sma.toFixed( productInfo.x_quote_precision ))
							+','+(tick.ema1 == null ? "" : tick.ema1.toFixed( productInfo.x_quote_precision ))
							+','+(tick.ema2 == null ? "" : tick.ema2.toFixed( productInfo.x_quote_precision ));

			console.log( csv_line );
		}
	}
}

async function analyzeAll( argv )
{
	for ( product of APIKeys.TRADING_PRODUCTS )
	{
		argv.product = product;
		await analyze( argv );
	}
}

async function analyze(argv)
{
	// Handle special command product=all

	var productsToAnalyze = [];

	if ( argv.product == "all" )
		productsToAnalyze = APIKeys.TRADING_PRODUCTS;
	else
		productsToAnalyze.push( argv.product );

		
	// Loop around products to analyze

	for ( product of productsToAnalyze )
	{
		argv.product = product;
	
		// Gather our arguments and save for later use (?)

		var analysis = getAnalysisArguments(argv);
		var result = await _analyzeProduct( analysis );
		
		if ( argv.raw )
		{
			delete result.ticker;
			console.log( { options:analysis, result:result } );
		}
		else
		{
			console.log( clc.yellow( "Product", analysis.product, "analysed at", analysis.time.toLocaleString() ) );
			console.log( "Timespan", analysis.timeSpanDays, "days (" + analysis.timeStart.toLocaleString() + ' - ' + analysis.timeEnd.toLocaleString() + ')' );
			console.log( "Granularity", analysis.granularity, "Minimum volatility", analysis.min_volatility);
			console.log( "Low avg", result.low_avg.toFixed(2), "Hi avg", result.high_avg.toFixed(2), "Hi/Lo Diff", result.high_low_diff.toFixed(4) + "%" );
			console.log( "Open avg", result.open_avg.toFixed(2), "Close avg", result.close_avg.toFixed(2), "O/C Diff", result.open_close_diff.toFixed(4) + "%" );
			console.log( "Hi/Low StdDev", result.stdev_hilow.toFixed(4), "which is", result.stdev_volatility.toFixed(2) + '% of avg(close).');
			console.log( "Volume avg", result.volume_avg.toFixed(2) + ' (' + Number(result.volume_avg * result.close_avg).toFixed(2) + tools.getCurrencySymbolFromProduct(analysis.product) + ')');
			console.log( "Current price", analysis.market_price.toFixed(2) + tools.getCurrencySymbolFromProduct(analysis.product) );

			if ( result.decision.trade_now )
			{
				var takeprofit = Number(analysis.market_price + (analysis.market_price * analysis.min_volatility / 100)).toFixed(2);
				var stoploss = Number(analysis.market_price - (analysis.market_price * argv.stoploss / 100)).toFixed(2);

				console.log( clc.green('🟩 Trade now'), "T/P:", takeprofit, "S/L:", stoploss );
			}
			else
			{
				var reason = "";
				if ( !result.evaluation.sufficient_volatility )
					reason += "❌ Insufficient volatility.";
				else 
					reason += "✔️ Sufficient volatility.";

				if ( !analysis.ignore_ema_trend )
				{
					if ( !result.evaluation.ema_allows_trading )
						reason += "❌ Negative trend.";
					else
						reason += "✔️ Positive trend";
				}
				else
				{
					reason += "⬜ Trend ignored.";
				}
				
				if ( !result.evaluation.price_allows_trading )
					reason += "❌ Market price too high.";
				else
					reason += "✔️ Market price.";

				console.log( clc.red('🟥 Do not trade.'), reason );
			}
		}
	}
}

async function _analyzeProduct(analysis)
{
	// Get prices and ticks and transform into easier format for us coders

	analysis.market_price = (await coinbase.getTicker( analysis.product, false, true )).ask;

	var res = await coinbase.getPublicClient().getProductHistoricRates(analysis.product, { start: analysis.timeStart, end: analysis.timeEnd, granularity: analysis.granularity });
	res.sort( (lhs, rhs) => { return lhs[0] < rhs[0] ? -1 : 1; } )
	var ticks = [];
	res.forEach( (e) => {
		ticks.push( {
			time: new Date(e[0]*1000),
			low: e[1],
			high: e[2],
			open: e[3],
			close: e[4],
			volume: e[5]
		} );
	});

	
	// Loop ticks and calculate lo, hi sma and ema12 and 26
	
	var eval_results = _calculateTickerTrends(analysis, ticks);


	
	// !!! (2/3)
	//
	// This is a key section of the code; based on the evaluations we have done in _calculateTickerTrends
	// we are making the final decision on whether the product is tradeable
	// and if this is a good time to enter a trade
	//
	// You probably want your own algorithm here
	// See _calculateTickerTrends for a description of the sample algo
	//
	// Finally, in monitor or auto mode, the final decision on .trade_now is done with incoming tickers
	//
	// TODO: Implement in interface before open sourcing, and always return NO to trades
	//

	eval_results.decision = {};

	eval_results.decision.tradeable = false;
	if ( eval_results.evaluation.sufficient_volatility && (analysis.ignore_ema_trend || eval_results.evaluation.ema_allows_trading) )
		eval_results.decision.tradeable = true;

	eval_results.decision.trade_now = false;
	if ( eval_results.evaluation.sufficient_volatility && eval_results.evaluation.price_allows_trading && (analysis.ignore_ema_trend || eval_results.evaluation.ema_allows_trading) )
		eval_results.decision.trade_now = true;

	logger.info({ options: analysis, result : eval_results }, "Analysis of " + analysis.product);
	eval_results.ticker = ticks;

	return eval_results;
}

function _calculateTickerTrends(analysis, ticks)
{
	var count = 0;
	var loSum = 0;
	var hiSum = 0;
	var openSum = 0;
	var closeSum = 0;
	var volSum = 0;
	//var csv = "period,datetime,volume,open,high,low,close,avg,lo_moving_avg,hi_moving_avg,ema12,ema26\n";

	var loStack = []; // keep last n of lo price
	var hiStack = []; // keep last n of hi price
	var closeStack = []; // keep last n of close price

	var open = [], low = [], high = [], close = [], hilow = []; // for stdev

	// ema
	// var timePeriods = (argv.days * 86400) / argv.granularity;
	// if ( timePeriods != res.length ) throw new Error('Time period calculation is off.');
	// console.log('Time periods:', timePeriods, '(Control:', res.length+')', 'EMA Weighted Multiplier:', Number(weightedMultiplier).toFixed(5));
	const periodsEma1 = analysis.ema1_periods;
	var lastPeriodEma1 = 0.0;

	const periodsEma2 = analysis.ema2_periods;
	var lastPeriodEma2 = 0.0;

	var period = 0;

	ticks.forEach( (tick) => 
	{
		count++;

		// adds to calculate total period averages

		loSum +=  tick.low;
		hiSum += tick.high;
		openSum += tick.open;
		closeSum += tick.close;
		volSum += tick.volume;

		// keep for standard deviation calculation
		open.push( tick.open );
		low.push( tick.low );
		high.push( tick.high );
		close.push( tick.close );

		hilow.push( tick.low );
		hilow.push( tick.high );

		// average for this period

		tick.price_avg = (tick.low+tick.high) / 2;


		// calculcate low and high simple moving average

		var loMovAvg = 0;
		loStack.push(tick.low);
		loStack.length > analysis.sma_periods ? loStack.shift() : null;
		loStack.forEach( (val) => { loMovAvg += val; });
		tick.low_sma = loStack.length >= analysis.sma_periods ? loMovAvg / loStack.length : null;

		var hiMovAvg = 0;
		hiStack.push(tick.high);
		hiStack.length > analysis.sma_periods ? hiStack.shift() : null;
		hiStack.forEach( (val) => { hiMovAvg += val; });
		tick.high_sma = hiStack.length >= analysis.sma_periods ? hiMovAvg / hiStack.length : null;

		var closeMovAvg = 0;
		closeStack.push(tick.close);
		closeStack.length > analysis.sma_periods ? closeStack.shift() : null;
		closeStack.forEach( (val) => { closeMovAvg += val; });
		tick.close_sma = closeStack.length >= analysis.sma_periods ? closeMovAvg / closeStack.length : null;

		
		// calculate exponential moving averages
		// we're doing this on average price, should we move to close prices?

			
		if ( count < periodsEma1 + 1 )
		{
			tick.ema1 = null;
		}	
		else
		{
			if ( lastPeriodEma1 == 0.0 )
				lastPeriodEma1 = (closeMovAvg / closeStack.length);

			const weightedMultiplier = 2 / ( periodsEma1 + 1 );
			tick.ema1 = (tick.close * weightedMultiplier) + (lastPeriodEma1 * ( 1 - weightedMultiplier));
			lastPeriodEma1 = tick.ema1;
		}

		if ( count < periodsEma2 + 1 )
		{
			tick.ema2 = null;
		}
		else
		{
			if ( lastPeriodEma2 == 0.0 )
				lastPeriodEma2 = (closeMovAvg / closeStack.length);

			var ema2_weighted_multiplier = 2 / ( periodsEma2 + 1 );
			tick.ema2 = (tick.close * ema2_weighted_multiplier) + (lastPeriodEma2 * ( 1 - ema2_weighted_multiplier));
			lastPeriodEma2 = tick.ema2;
		}
	});
	
	var loAvg = loSum / count;
	var hiAvg = hiSum / count;
	var openAvg = openSum / count;
	var closeAvg = closeSum / count;
	var volAvg = volSum / count;
	var avgDiff = -(1-(closeAvg/openAvg))*100;
	var diffHiLow = -(1-(hiAvg/loAvg))*100;

	var result = {
		open_avg : openAvg,
		high_avg : hiAvg,
		low_avg : loAvg,
		close_avg : closeAvg,
		volume_avg : volAvg,
		open_close_diff : avgDiff,
		high_low_diff : diffHiLow,
		stdev_open : math.std(open),
		stdev_low : math.std(low),
		stdev_high : math.std(high),
		stdev_close : math.std(close),
		stdev_hilow : math.std(hilow),
		stdev_volatility : (math.std(hilow) / closeAvg) * 100
	};

	// !!! (1/3)
	//
	// This is a key section of the code; based on the calculations we have done above
	// we are making evaluations on whether the product is tradeable
	//
	// Also see similar section in _analyzeProduct, where the final decision is made!
	//
	// This is where you would want to express your algorithm. The very simple and
	// probably not profitable algoritm below does:
	//
	// 		1. Standard deviation across low, high as % of avg close. Must be above --volatility argument (to ensure large enough swings)
	//		2. Exponential moving average 1 (ema1) >= ema2 for last two ticks - indicating positive trend
	//		3. Market price at or below ema1
	//
	// Another potential algorithm is to use ema1 crossing over to upside of ema2, going long (coinbase does not let you go short atm)
	//
	// The price_allows_trading is based on market price *at the time* of analysis, e.g. when using ./trade.js analyze in CLI
	// When auto or monitor modes run, this is evaluated towards incoming tickers
	//

	result.evaluation = {};

	result.evaluation.sufficient_volatility = result.stdev_volatility > analysis.min_volatility ? true : false;

	result.evaluation.ema_allows_trading = false;
	if ( ticks[ ticks.length - 2 ].ema1 >= ticks[ ticks.length - 2 ].ema2 && ticks[ ticks.length - 1 ].ema1 >= ticks[ ticks.length - 1 ].ema2 )
		result.evaluation.ema_allows_trading = true;
	
	result.evaluation.price_allows_trading = analysis.market_price < ticks[ ticks.length - 1 ].ema1 ? true : false;

	return result;
}

function getAnalysisArguments(argv)
{
	// until we use postgres data source for prices, we can only request 300 tickers
	// we must cap based on granularity

	var currentTime = new Date();
	var timeEnd = new Date(currentTime.getTime() - currentTime.getTime() % ( argv.granularity * 1000 ) - ( argv.granularity * 1000 ) );
	var timeStart = new Date( timeEnd.getTime() - (1000 * 60 * 60 * 24 * argv.days) );
	var maxTime = new Date( timeEnd.getTime() - (argv.granularity * 1000 * 300) );

	if ( timeStart < maxTime )
	{
		timeStart = maxTime;

		console.log("Price analysis period is too long, capping start time to", timeStart.toLocaleString());
		logger.warn("Analysis period exceeds 300 ticks, capping to" + timeStart.toISOString());
	}

	var analysis = {
		time : new Date(),
		product : argv.product,
		timeSpanDays : argv.days,
		timeStart : timeStart,
		timeEnd : timeEnd,
		granularity : argv.granularity,
		sma_periods : argv.movavgperiods,
		ema1_periods : argv.ema1periods,
		ema2_periods : argv.ema2periods,
		min_volatility : argv.volatility,
		ignore_ema_trend : argv.ignoreTrend
	};

	logger.trace(analysis, "Analysis options");
	return analysis;
}

async function productInfo(argv)
{
	try
	{
		console.log( await coinbase.getProductInfo(argv.product) );
	}
	catch ( e )
	{
		console.log( e );
		// if ( e.response.statusCode == 404 )
		// 	console.log( 'Product not found.' );
		// else
		// 	throw e;
	}
}

async function getOrder(argv)
{
	try 
	{
		console.log( await coinbase.getPrivateClient().getOrder(argv.orderid) );
	} 
	catch ( e ) 
	{
		if ( e.response.statusCode == 404 )
			console.log( 'Order not found.' );
		else
			throw e;
	}
}

async function getTicker(argv)
{
	var ticker = await coinbase.getTicker(argv.product);
	ticker.x_client_time = new Date();
	ticker.x_time_diff_ms = ticker.x_client_time - new Date(ticker.time);

	if ( !argv.raw )
	{
		var spread = ticker.ask - ticker.bid;
		var diff = spread / ticker.price * 100;

		console.log( clc.yellow( "Product", argv.product ), "at", new Date().toLocaleString() );
		console.log( "Bid:", clc.green( ticker.bid ), "Ask:", clc.red( ticker.ask ), "Spread", spread.toFixed(2), "(" + diff.toFixed(4) + "%)" );
		console.log( "Volume", ticker.volume.toFixed(2), "(" + Number(ticker.volume*ticker.price).toFixed(2) + tools.getCurrencySymbolFromProduct(ticker.product_id) + ")" );

	}
	else
	{
		console.log( ticker );
	}
}

function parseCommandLine()
{
	const argv = yargs
	.command('limit <product>', 'Run a single limit buy trade, take profit and stop loss (one cancels other)', (yargs) => {
		yargs.positional('product', {
			description: 'The product to trade, e.g. BTC-EUR',
			type: 'string'
		})
		.option('budget', {
			description: 'the amount of money to buy for',
			alias: 'b',
			type: 'number',
			demandOption : true
		})
		.option('limit', {
			description: 'price limit',
			alias: 'l',
			type: 'number',
			demandOption : true
		})
		.option('stoploss', {
			description: 'percentage to set stoploss at',
			alias : 's',
			type: 'number',
			demandOption : true
		})
		.option('target', {
			description: 'percentage to set target price at',
			alias: 't',
			type: 'number',
			demandOption : true
		})
	})
	.command('market <product>', 'Run a single trade at market price, take profit and stop loss (one cancels other)', (yargs) => {
		yargs.positional('product', {
			description: 'The product to trade, e.g. BTC-EUR',
			type: 'string'
		})
		.option('budget', {
			description: 'the amount of money to buy for',
			alias: 'b',
			type: 'number',
			demandOption : true
		})
		.option('stoploss', {
			description: 'percentage to set stoploss at',
			alias : 's',
			type: 'number',
			demandOption : true
		})
		.option('target', {
			description: 'percentage to set target price at',
			alias: 't',
			type: 'number',
			demandOption : true
		})
	})
	.command('auto', 'Automated trading of multiple currencies', (yargs) => {
		// yargs.positional('product', {
		// 	description: 'The product to trade, e.g. BTC-EUR',
		// 	type: 'string'
		// })
		yargs.option('budget', {
			description: 'the amount of money to buy for',
			alias: 'b',
			type: 'number',
			demandOption : true
		})
		.option('reinvest-profits', {
			description: 'adjust budgets to reinvest accumulated profit',
			type: 'boolean',
			default: false
		})
		.option('target', {
			description: 'percentage to set target price at',
			alias: 't',
			type: 'number',
			demandOption : true
		})
		.option('stoploss', {
			description: 'percentage to set stoploss at',
			alias : 's',
			type: 'number',
			demandOption : true
		})
		.option('days', {
			description: 'Number of days to analyze price history for',
			alias: 'd',
			type: 'number',
			default: 10
		})
		.option('granularity', {                        // 1m 5m  15m 1h   6h    24h
			description: 'Time interval to get in seconds [60|300|900|3600|21600|86400]',
			alias: 'g',
			type: 'number',
			default: 86400
		})
		.option('movavgperiods', {
			description: 'Number of periods in moving averages',
			type: 'number',
			default: 10,
			alias: 'p'
		})
		.option('ema1periods', {
			description: 'Number of periods in exponential moving average 1',
			type: 'number',
			default: 12,
			alias: 'ema1'
		})
		.option('ema2periods', {
			description: 'Number of periods in exponential moving average 2',
			type: 'number',
			default: 26,
			alias: 'ema2'
		})
		.option('volatility', {
			description: 'Minimum volatility for trading, e.g. 2.0 (%)',
			type: 'number',
			default: 2.5
		})
		.option('ignore-trend', {
			description: 'Ignore ema1 vs ema2 trend indicator',
			type: 'boolean',
			default: false
		})
	})
	.command('monitor', 'Monitor multiple currencies, text message when tradeable', (yargs) => {
		yargs
		// .positional('product', {
		// 	description: 'The product to trade, e.g. BTC-EUR',
		// 	type: 'string'
		// })
		// .option('budget', {
		// 	description: 'the amount of money to buy for',
		// 	alias: 'b',
		// 	type: 'number',
		// 	demandOption : true
		// })
		// .option('reinvestprofits', {
		// 	description: 'adjust budgets to reinvest accumulated profit',
		// 	type: 'boolean',
		// 	default: false
		// })
		.option('target', {
			description: 'percentage to set target price at',
			alias: 't',
			type: 'number',
			demandOption : true
		})
		.option('stoploss', {
			description: 'percentage to set stoploss at',
			alias : 's',
			type: 'number',
			demandOption : true
		})
		.option('days', {
			description: 'Number of days to analyze price history for',
			alias: 'd',
			type: 'number',
			default: 10
		})
		.option('granularity', {                        // 1m 5m  15m 1h   6h    24h
			description: 'Time interval to get in seconds [60|300|900|3600|21600|86400]',
			alias: 'g',
			type: 'number',
			default: 86400
		})
		.option('movavgperiods', {
			description: 'Number of periods in moving averages',
			type: 'number',
			default: 10,
			alias: 'sma'
		})
		.option('ema1periods', {
			description: 'Number of periods in exponential moving average 1',
			type: 'number',
			default: 12,
			alias: 'ema1'
		})
		.option('ema2periods', {
			description: 'Number of periods in exponential moving average 2',
			type: 'number',
			default: 26,
			alias: 'ema2'
		})
		.option('volatility', {
			description: 'Minimum volatility for trading, e.g. 2.0 (%)',
			type: 'number',
			default: 2.5
		})
		.option('ignore-trend', {
			description: 'Ignore ema1 vs ema2 trend indicator',
			type: 'boolean',
			default: false
		})
		.option('disable-sms', {
			description: 'Do not send notifications via sms',
			type: 'boolean',
			default: false
		})
	})
	.command('ticker <product>', 'Display ticker information', (yargs) => {
		yargs.positional('product', {
			description: 'The product to display ticker for',
			type: 'string',
			default: 'BTC-EUR'
		})
		.option('raw', {
			description: 'Output raw (json) results, default is readable text',
			type: 'boolean',
			default: false
		})
	},
		function (yargs) { getTicker(yargs); g_commandLineHandled = true; }
	)
	.command('prices <product>', 'Display price history <product>', (yargs) => {
		yargs.positional('product', {
			description: 'The product to display price history for',
			type: 'string',
			default: 'BTC-EUR'
		})
		.option('days', {
			description: 'Number of days to get price history for',
			alias: 'd',
			type: 'number',
			default: 10
		})
		.option('granularity', {                        // 1m 5m  15m 1h   6h    24h
			description: 'Time interval to get in seconds [60|300|900|3600|21600|86400]',
			alias: 'g',
			type: 'number',
			default: 86400
		})
		.option('movavgperiods', {
			description: 'Number of periods in moving averages',
			type: 'number',
			default: 10,
			alias: 'sma'
		})
		.option('ema1periods', {
			description: 'Number of periods in exponential moving average 1',
			type: 'number',
			default: 12,
			alias: 'ema1'
		})
		.option('ema2periods', {
			description: 'Number of periods in exponential moving average 2',
			type: 'number',
			default: 26,
			alias: 'ema2'
		})
		.option('raw', {
			description: 'Output raw (json) results (default is csv)',
			type: 'boolean',
			default: false
		})
	},
		function (yargs) { prices(yargs); g_commandLineHandled = true; }
	)
	.command('analyze <product>', 'Analyze tradability for <product>', (yargs) => {
		yargs.positional('product', {
			description: 'The product to display price history for, e.g. BTC-EUR',
			type: 'string',
			default: 'BTC-EUR'
		})
		.option('days', {
			description: 'Number of days to analyze price history for',
			alias: 'd',
			type: 'number',
			default: 10
		})
		.option('granularity', {                        // 1m 5m  15m 1h   6h    24h
			description: 'Time interval to get in seconds [60|300|900|3600|21600|86400]',
			alias: 'g',
			type: 'number',
			default: 86400
		})
		.option('movavgperiods', {
			description: 'Number of periods in moving averages',
			type: 'number',
			default: 10,
			alias: 'p'
		})
		.option('ema1periods', {
			description: 'Number of periods in exponential moving average 1',
			type: 'number',
			default: 12,
			alias: 'ema1'
		})
		.option('ema2periods', {
			description: 'Number of periods in exponential moving average 2',
			type: 'number',
			default: 26,
			alias: 'ema2'
		})
		.option('volatility', {
			description: 'Minimum volatility for trading, e.g. 2.5 (%)',
			type: 'number',
			default: 2.5
		})
		.option('ignore-trend', {
			description: 'Ignore ema1 vs ema2 trend indicator',
			type: 'boolean',
			default: false
		})
		.option('stoploss', {
			description: 'Percentage to calculate stoploss, e.g. 9.75 (%)',
			type: 'number',
			default: 9.75,
			alias: 's'
		})
		.option('raw', {
			description: 'Output raw (json) results',
			type: 'boolean',
			default: false
		})
	},
		function (yargs) { analyze(yargs); g_commandLineHandled = true; }
	)
	.command('getorder <orderid>', 'Display detailed order information', (yargs) => {
		yargs.positional('orderid', {
			description: "The order id to look up",
			alias: 'o',
			type: 'string',
			demandOption: true
		})
	},
		function (yargs) { getOrder(yargs); g_commandLineHandled = true; }
	)
	.command('info <product>', 'Display product information', (yargs) => {
		yargs.positional('product', {
			description: "The product to look up, e.g. BTC-EUR",
			type: 'string',
			demandOption: true
		})
	},
		function (yargs) { productInfo(yargs); g_commandLineHandled = true; }
	)
	.option('verbose', {
		alias: 'v',
		description: 'Enable verbose logging',
		type: 'boolean',
	})
	.option('logfilename', {
		description: 'Specify logging file name, default is log.json',
		type: 'string',
	})
	.option('pause', {
		description: 'Pause when finished (press Enter to quit)',
		type: 'boolean',
	})
	.help()
	.alias('help', 'h')
	.argv;
	
	return argv;
}

async function main() 
{
	const argv = parseCommandLine();
	
	if ( argv.logfilename != null )
	{
		logger = logtool.setLogFileName(argv.logfilename);
		coinbase.updateLogger( logger );
		twilio.updateLogger( logger );
	}

	logger.level = argv.verbose ? 'trace' : 'debug';
	logger.info('Starting bitbot (trade.js), loglevel: ' + logger.level);
	await coinbase.checkSandbox();
	
	if ( argv._[0] == 'limit' )
	{
		await limitTrade(argv);
	}
	else if ( argv._[0] == 'market' )
	{
		await marketTrade(argv);
	}
	else if ( argv._[0] == 'auto' )
	{
		await autoTrade(argv);
	}
	else if ( argv._[0] == 'monitor' )
	{
		await monitor(argv);
	}
	else if (! g_commandLineHandled )
	{
		logger.trace("Missing command, returning help hint message.");
		console.log("Try", argv.$0, "--help for more information.");
		return;
	}
	
	if ( argv.pause )
	{
		console.log("Press Enter to exit.");
		await tools.keypress();
	}
}

main();