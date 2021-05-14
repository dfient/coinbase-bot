# coinbase trading bot

Command-line tool to assist with trading on Coinbase, with experimental bot/algo functionality.

This tool is designed to improve the capabilities of Coinbase Pro, help you make profitable trades, and track your positions to make tax reporting easier.

This is very much work in progress, and requires quite high technical proficiency to be useful, but I am posting here to 
make this available and gather community feedback and input. Star or Watch to get updates.

No AI, just rules and very quick trading while you sleep or do something else.

Based on Node.js, Redis, and Postgres. Developed and tested on Ubuntu linux but should in thery work on PC and Mac too.



## Features

Few, but useful features at the moment:


1. Automate trading, e.g. buy every morning at 7 and sell at set target %
1. Place OCO (one cancels other) orders: Cancels stoploss and replaces with buy at target price
1. Monitor multiple products and get buy signals via SMS to your phone
1. Download price (ticker) history to PostgreSQL for local analysis
1. Framework for auto-trading, e.g. using exponential moving averages or other signals


### Monitoring tradability

The bot can watching the markets across multiple products and _let you know via a text message_ to your phone
when the price is at an acceptable level for a product that satisfied the "tradability" signals.

![Screnshot showing monitor of product tradability](https://github.com/dfient/coinbase-bot/raw/main/docs/img/monitoring-products.png "Screnshot showing monitor of product tradability")

Currently supported indicators are:

1. Volatility (standard deviation of low and high prices)
2. Trend (short exponential moving average (ema) is above long ema)


### Auto-trading

Auto-trade builds on the monitoring framework. This will start a trade when all signals fire, and take profit or stop loss at a certain percentage.
If multiple products hit the price target at the same time, it will take a position in the product with the highest volatility.

Important: The included algorithm is too weak and must be enhanced; add your own if you want to use `auto`. In most cases it "catches falling knives".
Future updates will have more signals and indicators and object oriented abstractions in the code to make implementing
your favorite algorithm easier (e.g. buying ema crossovers or similar).

I highly recommend using `monitor` and then manual technical analysis before acting on the signal manually (instead of `auto` mode).



## Coming: Alpha 2 version (soon to be released)

I'm working on the final steps of Alpha 2 with improvements across the board.

1. Track positions. Every opened position is tracked in the database with buy price (and later sell price). This builds a framework
   for easier tax reporting. Each position can have a target price and/or stop loss to be automatically closed if the market
   reaches the thresholds.
1. Command-line buy/sell (as opposted to trades that try to take profit and without tracking the position)
1. Improving stability, logging and error handling



### Working with positions

`./trade.js open market ADA-EUR --name my-first-cardano --budget 10` will buy ADA for €10 and hold.

`./trade.js list-positions open` will list all open positions and results according to current market price.

`./trade.js close market --name my-first-cardano` will close (sell) the position at market price.

`./trade.js panic --force` will close (sell) all open positions at market price.

You can also easily export your trade history and all results by using `./trade.js list-positions closed` and use the data to create your tax reports.

I recommend using positions over untracked buy/sell or the Coinbase UI, as you will get a much improved overview
of your current exposure in the market. It is especially useful if you trade multiple products.

List exports support pretty print (default), CSV and JSON with the `--csv` and `--raw` options.


## Planned: Alpha 3 version

Incorporating TA-Lib to enhance the `./trade.js analyze ADA-EUR` function with more signals and indicators. Building UI to monitor positions with easy
overview of important indicators; also making the `monitor` and `auto` (trading bot) modes easier to use to leverage advanced
indicators, plus a much improved technical architecture for durability.



## Requirements

* Coinbase Pro account and API Keys
* Linux server*. 
* Redis
* Postgres
* Twilio Account for SMS notifications



## Components

|Script|Description|
|---|---|
|server.js|Monitors tickers, orders, and products and publishes information through Redis cache and pub/sub. Must be running. Start with `node server.js --safe`|
|trade.js|Execute trade with take profit and stoploss, monitor products for tradability, auto-trade with your own algo (requires coding). Run `node trade.js --help` for instructions.|
|prices.js|Fetches price history and stores in postgres for analysis. Run `node price.js --help` for instructions.|



## Getting started

1. Rename `apikeys_template.js` to `apikeys.js` and fill in missing details.
2. Make sure redis and postgres is installed; use `./schema/pricehistory.psql` to setup the db schema
3. Start `node server.js safe` to digest the websocket feed from coinbase
4. Use `node trade.js --help` to understand options, e.g. try `node trade.js limit XLM-EUR --limit 0.01 --budget 10.00 --target 1.0 --stoploss 0.5 --verbose --disable-sms`
5. Try `node trade.js monitor --help` to get sms messages when assets are tradeable (see hint on algo below)
6. Monitor console output and log*.json for details.

_Hint:_ Use screen to make sure your stuff runs when you disconnect your terminal.

_Hint:_ Use cron or at to schedule e.g. price sync or trading

_Hint:_ Read the source code before using `auto` mode. Implement your algorithm, the provided one catches falling knives. Abstractions coming to make this easier, consider highly experimental at this time.



## Notes

Currently the tools do not optimize for Coinbase's maker/taker fee structure. This is to avoid risk - by placing the stoploss order at the exchange and replacing with sell order when market price reaches price target. This effectively makes every sell order a taker order, incurring higher fees at Coinbase. Considering future optimizations here, so that both limit buy and target sell orders have higher chances of becoming maker orders - giving you 0% fees at volumes > $50M/30 days.

If trades fail, the system aborts with unhandled exceptions. Many regularly called functions have failbacks to handle e.g. connection issues or the like. Monitor log files using your preferred system and keep Coinbase app on you to clean up asap. Nice hint is to follow your bot using the exchange web interface or mobile app. You can manually cancel stoploss orders, effectively turning buy into HODL until target is reached.

If you are using the auto or monitor modes, place your serer in Amazon US East N. Virginia (us-east-1) region for lowest possible latency.



## Contributing

Small or big, all contributions are welcome. Simply submit PRs.

Want to keep me running this project? Coffee keeps me awake, coding away. Litecoin (LTC) donations welcome to MT51Zx5i6iPm13ikJM7taPctRxungu4BP3.



## Use at your own risk

This project comes with _*zero warranties*_. Use at your own risk and with funds you can afford to lose, also due to technical errors like bugs, hickups, system faults, upgrades, iaas failures, lightning strikes, act of god. This system is designed for speed+performance, not with high availability/redundancy in mind.


The system is not 'in-a-box', and needs experienced administrators caring for the system to keep it live. If you don't know what this is, please don't use this project. I recommend skimming the source files; if you do not fully understand what it takes to maintain the system then please walk away now.



## License

This project is released under the MIT License. Copyright 2021 dfient@protonmail.ch.



## Questions

Questions, ideas, feedback? Check out Issues and Wiki here at GitHub first, email at dfient@protonmail.ch for direct contact, optionally encrypted with [my PGP key](https://gist.github.com/dfient/ee3c204f9d4fb1aab17536a530639ded).
