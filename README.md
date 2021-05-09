# coinbase trading bot

Bot to assist with trading on Coinbase.

This is a semi-automatic trading bot, improving the capabilities of Coinbase Pro. It is a command line tool based on Node.js, Redis, and Postgres. Developed and tested on Ubuntu linux.

1. Monitor multiple products and get buy signals via SMS to your phone
1. Place OCO (one cancels other) orders: Cancels stoploss and replaces with buy at target price
1. Automate trading, e.g. buy every morning at 7 and sell at set target %
1. Downloads price (ticker) history to PostgreSQL for local analysis
1. Framework for auto-trading, e.g. using exponential moving averages or other signals

This is very much work in progress, and requires quite high technical proficiency to be useful, but I am posting here to 
make this available and gather community feedback and input. Star or Watch to get updates.

No AI, just rules and very quick trading while you sleep or do something else.


### Requirements

* Coinbase Pro account and API Keys
* Linux server. For lowest latency place server in Amazon US East N. Virginia (us-east-1) region.
* Redis
* Postgres
* Twilio Account for SMS notifications


### Components

|Script|Description|
|---|---|
|server.js|Monitors tickers, orders, and products and publishes information through Redis cache and pub/sub. Must be running. Start with `node server.js --safe`|
|trade.js|Execute trade with take profit and stoploss, monitor products for tradability, auto-trade with your own algo (requires coding). Run `node trade.js --help` for instructions.|
|prices.js|Fetches price history and stores in postgres for analysis. Run `node price.js --help` for instructions.|


### Getting started

1. Rename `apikeys_template.js` to `apikeys.js` and fill in missing details.
2. Make sure redis and postgres is installed; use `./schema/pricehistory.psql` to setup the db schema
3. Start `node server.js safe` to digest the websocket feed from coinbase
4. Use `node trade.js --help` to understand options, e.g. try `node trade.js limit XLM-EUR --limit 0.01 --budget 10.00 --target 1.0 --stoploss 0.5 --verbose --disable-sms`
5. Try `node trade.js monitor --help` to get sms messages when assets are tradeable (see hint on algo below)
6. Monitor console output and log*.json for details.

_Hint:_ Use screen to make sure your stuff runs when you disconnect your terminal.

_Hint:_ Use cron or at to schedule e.g. price sync or trading

_Hint:_ Read the source code before using `auto` mode. Implement your algorithm, the provided one catches falling knives. Abstractions coming to make this easier, consider highly experimental at this time.



### Notes

Currently the tools do not optimize for Coinbase's maker/taker fee structure. This is to avoid risk - by placing the stoploss order at the exchange and replacing with sell order when market price reaches price target. This effectively makes every sell order a taker order, incurring higher fees at Coinbase. Considering future optimizations here, so that both limit buy and target sell orders have higher chances of becoming maker orders - giving you 0% fees at volumes > $50M/30 days.

If trades fail, the system aborts with unhandled exceptions. Many regularly called functions have failbacks to handle e.g. connection issues or the like. Monitor log files using your preferred system and keep Coinbase app on you to clean up asap. Nice hint is to follow your bot using the exchange web interface or mobile app. You can manually cancel stoploss orders, effectively turning buy into HODL until target is reached.

There is currently an issue with linebreaks, new version is underway with fixes. Also adding signatures for commits.


### Contributing

Small or big, all contributions are welcome. Simply submit PRs.

Want to keep me running this project? Coffee keeps me awake, coding away. Litecoin (LTC) donations welcome to MT51Zx5i6iPm13ikJM7taPctRxungu4BP3.


### Use at your own risk

This project comes with _*zero warranties*_. Use at your own risk and with funds you can afford to lose, also due to technical errors like bugs, hickups, system faults, upgrades, iaas failures, lightning strikes, act of god. This system is designed for speed+performance, not with high availability/redundancy in mind.

The system is not 'in-a-box', and needs experienced administrators caring for the system to keep it live. If you don't know what this is, please don't use this project. I recommend skimming the source files; if you do not fully understand what it takes to maintain the system then please walk away now.


### License

This project is released under the MIT License. Copyright 2021 dfient@protonmail.ch.


### Questions

Questions, ideas, feedback? Check out Issues and Wiki here at GitHub first, email at dfient@protonmail.ch for direct contact, optionally encrypted with [my PGP key](https://gist.github.com/dfient/ee3c204f9d4fb1aab17536a530639ded).
