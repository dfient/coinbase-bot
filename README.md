# coinbase-bot

Bot to assist with trading on Coinbase.

This is a semi-automatic trading bot, improving the capabilities of Coinbase Pro.

1. Monitor multiple products and get buy signals via SMS to your phone
1. Place OCO (one cancels other) orders: Cancels stoploss and replaces with buy at target price
1. Automate trading, e.g. buy every morning at 7 and sell at set target %
1. Downloads price (ticker) history to Postgres for local analysis
1. Framework for auto-trading, e.g. using exponential moving averages or other signals

This is very much work in progress, and requires quite high technical proficiency to be useful, but I am posting here to 
make this available and gather community feedback and input. Currently I am reorganizing the code, commenting and making
this more viable for open source and others, will be back with updates in few days. Star or Watch to get updates.

### Requirements

1. Linux server, dev and test on Ubuntu
1. Node.js, Redis, and Postgres installed locally
1. Twilio account for notifications
1. Coinbase Pro account and api keys
1. Command line experience and quite a bit of technical proficiency

For lowest latency to Coinbase servers place your server in Amazon US East N. Virginia (us-east-1) region.

### Components

|Script|Description|
|---|---|
|server.js|Monitors tickers, orders, and products and publishes information through Redis cache and pub/sub. Must be running. Start with `node server.js --safe`|
|trade.js|Execute trade with take profit and stoploss, monitor products for tradability, auto-trade with your own algo (requires coding). Run `node trade.js --help` for instructions.|
|prices.js|Fetches price history and stores in postgres for analysis. Run `node price.js --help` for instructions.|

### License

Will be released under a flexible open source license.

### Questions

Questions, ideas, feedback? Check out Issues and Wiki here at GitHub first, email at dfient@protonmail.ch for direct contact. (Releasing this under pseudonym.)
