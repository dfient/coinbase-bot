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

Module:         Wrapper for Coinbase API, providing e.g. order validation
                and uses the Redis cache to avoid api throttling limits
                on Coinbase.

Description: 

  This lib is designed to improve readability of the trading algorithms and bots
  that use the coinbase api.
  
  Atm the project is also so fragile that we are taking a few shortcuts here
  in terms of stability. E.g. returning last market price should the api call to get
  fresh data fail, or assuming a deal is not filled if the api call to check fails.
  
  You have to read the code to see how this works for now, this system must move to an
  event publisher-consumer model in order to support multiple trades and reliability anyway.
  
  Some methods should retry, others need more refactoring to avoid e.g. double orders
  being submitted while using retry mechanisms. Some just ignore errors and therefore fail.

  See individual exported functions for information.

*/


var APIKeys = require('./apikeys');
var tools = require('./tools');
var rediswrapper = require('./rediswrapper')
const { v4: uuidv4 } = require('uuid');

var logger = require('./logger').log.child({module:'coinbase'});
logger.info('coinbase initializing');

const CoinbasePro = require('coinbase-pro');
const publicClient = new CoinbasePro.PublicClient();
const privateClient = new CoinbasePro.AuthenticatedClient(APIKeys.API_KEY, APIKeys.API_SECRET, APIKeys.API_PASS, APIKeys.API_URL);

module.exports.updateLogger = function(central_log) 
{
  logger = central_log.child({module:'coinbase'});
  logger.info("coinbase logger initialized");

  rediswrapper.updateLogger( central_log );
}

module.exports.getPublicClient = function() 
{
  return publicClient;
}

module.exports.getPrivateClient = function()
{
  return privateClient;
}

module.exports.checkSandbox = async function() 
{
  if ( APIKeys.API_URL.indexOf('sandbox') > 0 )
  {
    console.log("WARNING: ---RUNNING IN SANDBOX MODE - NO REAL TRADING ---");
    logger.warn('Running in sandbox mode, no real trading.');
  }
  else
  {
    logger.info('Running in production mode.');
  }
}

module.exports.buyLimitPrice = async function( buyPrice, buySize, productId = 'BTC-EUR' ) 
{
	const productInfo = await this.getProductInfo( productId );
	var res = await this.buyLimitPriceEx( buyPrice, buySize, productInfo );
	return res.order_data.id;
}

module.exports.buyLimitPriceEx = async function( buyPrice, buySize, productInfo, clientId = null )
{
	// validate purchase
	
	if ( buySize < productInfo.base_min_size )
	{
		logger.error( { size: buySize, product: productInfo }, "Size is too small for product.");
		throw new Error("Size is too small.");
	}


	// setup the buy parameters, we're sending sizes as strings tailored to product precision
	// NOTE: This means you may be buying for less than our input due to rounding (down).
	
	
	const buyParams = {
		price: Number( buyPrice ).toFixed( productInfo.x_quote_precision ),
		size: Number( buySize ).toFixed( productInfo.x_base_precision ),
		type: 'limit',
		product_id: productInfo.id,
		client_oid: clientId != null ? clientId : uuidv4()
	};
	
	logger.trace(buyParams, "Placing limit buy order");
	
	var order = await privateClient.buy( buyParams );
	logger.info(order, 'Order placed');
	
	order.settled ? logger.info('Order settled immediately.') : logger.info('Order pending.');
	
	var res = {
		client_id: buyParams.client_oid,
		order_params: buyParams,
		order_data: order
	};

	return res;
}

module.exports.buyMarketPrice = async function(budget, productId = 'BTC-EUR') 
{
  var productInfo = await this.getProductInfo( productId );
  var result = await this.buyMarketPriceEx( budget, productInfo );
  return result.order_data.id;
}

module.exports.buyMarketPriceEx = async function( budget, productInfo, clientId = null )
{
  // This function does not have exception handling.
  // An error in placing the order may mean a loss of opportunity, but not loss
  // of funds, therefore we can leave the exception handling up to the caller?
  // Or still have a simple retry function? (Note: this is potential loss, incorrectly
  // placing multiple orders?)

  // Validate the buy order

  if ( budget < productInfo.min_market_funds )
  {
		logger.error( { budget: buyPrice * buySize, product: productInfo }, "Budget is too small.");
		throw new Error("Budget is too small.");
	}

  // IMPROVEMENT? Check if we have sufficient funds in the account before submitting order?

  const buyParams = {
    funds: Number( budget ).toFixed( productInfo.x_quote_precision ),
    type: 'market',
    product_id: productInfo.id,
		client_oid: clientId != null ? clientId : uuidv4()
  };

  logger.trace(buyParams, "Placing market buy order");

  var order = await privateClient.buy( buyParams );
  logger.info(order, 'Order placed.');

  order.settled ? logger.info('Order settled immediately, size ' + order.filled_size) : logger.info('Order pending.');

  var res = {
		client_id: buyParams.client_oid,
		order_params: buyParams,
		order_data: order
	};

	return res;
}

module.exports.buyMarketPriceBySize = async function(size, productId = 'BTC-EUR') 
{
  // This function does not have exception handling.
  // An error in placing the order may mean a loss of opportunity, but not loss
  // of funds, therefore we can leave the exception handling up to the caller?
  // Or still have a simple retry function? (Note: this is potential loss, incorrectly
  // placing multiple orders?)
  
  const buyParams = {
      size: size,
      type: 'market',
      product_id: productId,
  };

  logger.trace(buyParams, "Placing market buy order");
  
  var order = await privateClient.buy( buyParams );
  logger.info(order, 'Order placed.');

  order.settled ? logger.info('Order settled immediately.') : logger.info('Order pending.');
  
  return order.id;
}

module.exports.setLossProtection = async function(price, size, productId = 'BTC-EUR') 
{
  // This function needs exception handling. If the order cannot be placed
  // we need to retry the sell, guesstimating 3x with 500ms delay atm?
  // Then if not succeeding, we throw. Caller must then find a way to escalate.
  // Warning: possible loss of funds must influence exception handling
  
  const sellParams = {
    price: price, // EUR
    size: size, // BTC
    product_id: productId,
    stop: 'loss',
    stop_price: price
  };
  
  logger.trace(sellParams, "Placing stop loss order");
  
  var order = await privateClient.sell(sellParams);
  logger.info(order, "Stoploss order placed.");
  
  return order.id;
}

module.exports.sellAtPrice = async function(price, size, productId = 'BTC-EUR')
{
  // This function needs exception handling. If the order cannot be placed
  // we need to retry the sell, guesstimating 3x with 500ms delay atm?
  // Then if not succeeding, we throw. Caller must then find a way to escalate.
  // Warning: possible loss of funds must influence exception handling
  
  const sellParams = {
    price: price, // EUR
    size: size, // BTC
    product_id: productId
  }
  
  logger.trace(sellParams, "Placing limit sell order");
  
  var order = await privateClient.sell(sellParams);
  logger.info(order, "Limit sell order placed");
  
  return order.id;
}

module.exports.sellAtMarketPriceEx = async function( size, productInfo, clientId = null )
{
  // TODO: We should check if we have available funds to sell - not just in the account, but
  // considering any open positions (sell should not be able to interfere with positions)

  if ( size < productInfo.base_min_size )
    throw new Error("Size is too small.");
  

  const sellParams = {
    side: 'sell',
    type: 'market',
    product_id: productInfo.id,
    size: Number( size ).toFixed( productInfo.x_base_precision ),
    client_oid: clientId != null ? clientId : uuidv4()
  }
  
  
  logger.trace(sellParams, "Placing market sell order");
  var order = await privateClient.sell( sellParams );

  var res = {
		client_id: sellParams.client_oid,
		order_params: sellParams,
		order_data: order
	};

	return res;
}

module.exports.sellAtLimitPriceEx = async function( size, price, productInfo, clientId = null )
{
  // TODO: We should check if we have available funds to sell - not just in the account, but
  // considering any open positions (sell should not be able to interfere with positions)

  if ( size < productInfo.base_min_size )
    throw new Error("Size is too small.");

  const sellParams = {
    side: 'sell',
    type: 'limit',
    product_id: productInfo.id,
    price: Number( price ).toFixed( productInfo.x_quote_precision ),
    size: Number( size ).toFixed( productInfo.x_base_precision ),
    client_oid: clientId != null ? clientId : uuidv4()
  }

  logger.trace(sellParams, "Placing limit sell order");
  var order = await privateClient.sell( sellParams );

  var res = {
		client_id: sellParams.client_oid,
		order_params: sellParams,
		order_data: order
	};

	return res;
}

module.exports.checkIfOrderFilled = async function(orderId, throwOnError = false) 
{
  // This is an extremely verbose function, called multiple times per second
  // Not trace logging in this atm, both to keep performance at optimum and avoid extremely
  // large log files

  try
  {
    var status = await this.checkOrderStatus( orderId );
    return status == "filled";
  }
  catch( e )
  {
    if ( throwOnError )
      throw e;

    return false;
  }
}

module.exports.checkIfOrderDone = async function(orderId, throwOnError = false) 
{
  // This is an extremely verbose function, called multiple times per second
  // Not trace logging in this atm, both to keep performance at optimum and avoid extremely
  // large log files

  try
  {
    var status = await this.checkOrderStatus( orderId );
    return { done: true, status: status };
  }
  catch( e )
  {
    if ( throwOnError )
      throw e;
      
    return { done: false };
  }
}

module.exports.checkOrderStatus = async function(orderId) // throws
{
  // This is an extremely verbose function, result of checkIfOrderFilled, called multiple times per second
  // Not trace logging in this atm, both to keep performance at optimum and avoid extremely
  // large log files

  var redisClient = null;
  
  try
  {
    redisClient = rediswrapper.getRedisClient();
    
    const record_id = "order:" + orderId;
    var status = await redisClient.hgetAsync( record_id, "status" );

    if ( status != null )
    {  
      return status;
    }
    else
    {
      // we could verify this: the order should be in the orders:open list in this case (in redis)
      return "open";
    }
  }
  catch(e)
  {
    // do we need a fallback to direct api here if redis fails? (exception handling)
    // if so, also handle 404 for stoploss/limit orders which means they are canceled?
    // var order = await privateClient.getOrder(orderId);
    // //logger.trace(order, 'Checking order status');
    // return order.settled;

    logger.error(e, "Exception while checking order status");
    throw e;
  }
  finally
  {
    if ( redisClient != null )
      redisClient.end(false);
  }
}

module.exports.cancelOrder = async function(orderId)
{
  // This function needs exception handling. If the order cannot be
  // canceled due to connection errors, we should have a retry scheme.
  
  while(true)
  {
    try{
      var res = await privateClient.cancelOrder(orderId);
      return res;
    }
    catch(e)
    {
      if ( e.response && e.response.statusCode == 404 ) // probably canceled interactively by admin?
      {
        logger.warn(e, "Order was not found, ignoring error.");
        return null;
      }  
      
      logger.error(e, "Cannot cancel order, unexpected error.");
      throw e;
    }
  }
}

module.exports.getMarketBidPrice = async function(productId = 'BTC-EUR')
{
  var bid = (await this.getTicker(productId)).bid;
  return bid;
}

module.exports.getMarketAskPrice = async function(productId = 'BTC-EUR')
{
  var ask = (await this.getTicker(productId)).ask;
  return ask;
}

var lastTicker = {};
module.exports.getTicker = async function(productId = 'BTC-EUR', apifallback = true, cachefallback = true)
{
  const MAX_TICKER_AGE_BEFORE_API_LOOKUP_SECONDS = 60 * 15;

  var redisClient = null;
  
  try
  {
    redisClient = rediswrapper.getRedisClient();
    var tickerJson = await redisClient.getAsync('ticker.' + productId);
    var ticker = JSON.parse( tickerJson );
    
    
    if ( ticker )
    {
      var timediff = new Date().getTime() - new Date(ticker.time).getTime();
      
      if ( apifallback == false || timediff < (MAX_TICKER_AGE_BEFORE_API_LOOKUP_SECONDS * 1000) )
      {
        var newTicker = {
          trade_id : ticker.trade_id,
          price : parseFloat(ticker.price),
          size : parseFloat(ticker.last_size),
          time : new Date(ticker.time),
          bid : parseFloat(ticker.best_bid),
          ask : parseFloat(ticker.best_ask),
          volume : parseFloat(ticker.volume_24h),
          product_id : ticker.product_id
        };
        
        lastTicker[ productId ] = newTicker;
        return newTicker; 
      }
    }

    if ( ticker )
      logger.warn(newTicker, "Redis ticker >900s old, retrieving ticker from public api. Is server running?");
    else
      logger.warn(newTicker, "Redis ticker not found, retrieving ticker from public api. Is server running?");
    
    if ( apifallback )
    {
      ticker = await publicClient.getProductTicker( productId );
    
      ticker.ask = parseFloat(ticker.ask); // make sure this stuff supports arithmetics
      ticker.bid = parseFloat(ticker.bid);
      ticker.price = parseFloat(ticker.price);
      ticker.size = parseFloat(ticker.size);
      ticker.time = new Date(ticker.time);
      ticker.volume = parseFloat(ticker.volume);
      ticker.product_id = productId; // fix missing field product_id (part of websocket feed)
      
      lastTicker[ productId ] = ticker;
      return ticker;
    }

    throw new Error(`Ticker ${productId} is expired and apifallback==false`);

  }
  catch(e)
  { // TODO: Log the error here, we want this visible?
    if ( !cachefallback )
    {
      logger.error(e, "Cannot get ticker, cachefallback is false.");
      throw e;
    }
    else
    {
      logger.error(e, "Cannot get ticker, returning last known (client cached) ticker.");
      if ( lastTicker[ productId ] == null )
        throw e;
      
      return lastTicker[ productId ];
    }
  }
  finally
  {
    redisClient ? redisClient.end(false) : null;
  }
}

module.exports.getProductInfo = async function(productId)
{
  var redisClient = null;
  
  try
  {
    redisClient = rediswrapper.getRedisClient();
    var productJson = await redisClient.getAsync('product.' + productId);
    if ( productJson == null )
    {  
      productJson = await populateRedisWithProducts(redisClient, productId);
    }
    
    var product = JSON.parse( productJson );

    product.x_base_precision = tools.countDecimals( product.base_increment );
		product.x_quote_precision = tools.countDecimals( product.quote_increment );

    return product;
  }
  catch( e )
  {
    logger.error(e);
    throw e;
  }
  finally
  {
    redisClient ? redisClient.end(false) : null;
  }
  
}

async function populateRedisWithProducts(redisClient, productToReturn)
{
  var products = await publicClient.getProducts();
  var resultJson = null;
  
  for ( product of products )
  {
    const PRODUCT_INFO_TTL_SECONDS = 60 * 60; // one hour

    var key = 'product.' + product.id;
    var value = JSON.stringify( product );
    var ttl = PRODUCT_INFO_TTL_SECONDS;
    
    await redisClient.setAsync(key, value, 'EX', ttl);
    
    if ( product.id == productToReturn )
    resultJson = value;
  }
  
  return resultJson;
}

module.exports.getBaseCurrencyAccountInformation = async function ()
{
  // {
  //   id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  //   currency: 'EUR',
  //   balance: '1189.4281490823120000',
  //   hold: '501.7499999172112500',
  //   available: '687.67814916510075',
  //   profile_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  //   trading_enabled: true
  // }
  
  var accounts = await privateClient.getAccounts();
  
  for ( account of accounts )
  {
    if ( account.currency == APIKeys.BASE_CURRENCY )
      return account;
  }
  
  return null;
}

module.exports.getBaseCurrencyAccountAvailable = async function ()
{
  var account = await this.getBaseCurrencyAccountInformation();
  return account ? account.available : 0;
}