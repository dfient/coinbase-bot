# coinbase trading bot

Command-line tool to assist with trading on Coinbase, with experimental bot/algo functionality.

This tool is designed to mitigate some weaknesses in Coinbase Pro, and add tools to help you make profitable trades, plus track your results to make tax reporting easier.

This is very much work in progress, and requires quite high technical proficiency to be useful, but I am posting here to make this available and gather community feedback and input. Star or Watch to get updates.

Based on Node.js, Redis, and Postgres. Developed and tested on Ubuntu Linux (but should in theory work on PC and Mac too if you install the right tools).



## Features

Currently available features in Alpha 1:


1. Automate trading, e.g. buy every morning at 7 for dollar cost averaging in or out of a crypto product
1. Place OCO (one cancels other) orders: Cancels stoploss and replaces with buy at target price. Coinbase Pro does not support OCO orders, this functionality makes it easier to successfully execute intraday or swing trade strategies.
1. Monitor multiple products' price and trend and get buy signals via SMS to your phone
1. Download price (ticker) history to PostgreSQL for local analysis e.g. in Excel, Tableau or PowerBI
1. Framework for auto-trading, e.g. using exponential moving averages or other signals

To learn all the options, run `./trade.js --help`.

Read the Getting Started section below before you execute any of the commands documented here in the Features section.


### Trading

```
  ./trade.js limit ADA-EUR --limit 1.0 --budget 10 --target 3.0 --stoploss 1.0
```

Will place an order for 10 ADA at €1 each. When (if) the order fills, the bot will place a stoploss order at the exchange at -1.0% (0.9€). If the price hits +3.0% (€1.03), the stoploss order will be cancelled and a sell (limit) order will be placed at 1.03.

You can also initiate the trade at market price, which means you start the trade immediately. Can be used e.g. with a crontab job to initiate an intraday strategy every morning at 7 AM:

```
  ./trade.js market ADA-EUR --budget 10 --target 3.0 --stoploss 1.0
```

This will buy ADA for €10, and use same stoploss and take profit rules as above.

Note: There is no guarantee that the take profit (limit) order finds a match, e.g. if the price spikes very momentarily. The bot does not have a fallback for this at the moment (a future version should let the order stay open for e.g. 2 minutes, then cancel it and replace the stop order).


### Monitoring for tradability

The bot can watch the markets across multiple products and let you know via a text message when the price is at an acceptable level for a product that satisfied the "tradability" signals.

```
  ./trade.js monitor all --volatility 2.5 --periods 10 --granularity 86400 --ema1 12 --ema2 26
```

The above command will monitor all products on daily candles, looking for products that swing 2.5% or more, and where the 12 day Exponential Moving Average (EMA) is above the 26 day EMA. If the price drops below the 12-day EMA, a buy signal is triggered.

Note: The product analysis is updated 1 second after a new period is closed. Prices are monitored continously using the websocket connection from Coinbase.

![Screnshot showing monitor of product tradability](https://github.com/dfient/coinbase-bot/raw/main/docs/img/monitoring-products.png "Screnshot showing monitor of product tradability")

Currently included indicators are:

1. Volatility (standard deviation of low and high prices)
2. Trend (short exponential moving average (ema) is above long ema)

Note: The current version is only watching the ticker feed for price updates, meaning it sets the price based on the last executed trade (and not the order book).

You can analyze any single product at any time using:

```
  ./trade.js analyze ADA-EUR --volatility 2.5 --ema1 12 --ema2 26 --periods 10 --granularity 86400
```

Note: `analyze`, `monitor`, and `auto` download live price data from Coinbase. There is a limitation of maximum 300 candles per api call, so --periods for these functions are limited to max 300 until a future version where candlestick data will be fetched from the postgres database for these functions.


### Auto-trading

Auto-trade builds on the monitoring framework, and will start a trade when the current market price is at or below the short EMA (default is 12 candles), and take profit or stop loss at a specified percentage.

```
./trade.js auto --volatility 2.5 --target 3.0 --stoploss 1.0 --periods 10 --granularity 86400 --ema1 12 --ema2 26 --budget 10 --reinvest-profits
```

The bot will only take one position at a time, spending the full budget (specified as a parameter and does not need to be your full account balance). If multiple products hit the price target at the same time, it will take a position in the product with the highest volatility.

__Important: The included algorithm is too weak and must be enhanced; in many cases it "catches falling knives". Edit the code and add your own algorithm if you want to use `auto`. Future updates will have more signals and indicators and object oriented abstractions in the code to make implementing your favorite algorithm easier (e.g. buying ema crossovers, using an RSI strategy, or similar).__

I highly recommend using `monitor` and then manual technical analysis before acting on the signal manually (instead of `auto` mode).



## Coming: Alpha 2 version (soon to be released)

I'm working on the final steps of Alpha 2 with several improvements across the codebase, and the following major features:

1. Track positions. Every opened position is tracked in the database with buy price (and later sell price). This builds a framework
   for easier tax reporting. Each position can have a target price and/or stop loss to be automatically closed if the market
   reaches the thresholds.
1. Command-line buy/sell (as opposted to trades that try to take profit and without tracking the position)
1. Improving stability, logging and error handling



### Working with positions

`./trade.js open market ADA-EUR --name my-first-cardano --budget 10` will buy ADA for €10 and hodl.

If --name is not specified, the bot will create a short unique identifier, e.g. `41xzipduq`

`./trade.js list-positions open` will list all open positions and results according to current market price.

`./trade.js close market --name my-first-cardano` will close (sell) the position at market price.

`./trade.js panic --force` will close (sell) all open positions at market price.

You can also easily export your trade history and all results by using `./trade.js list-positions closed` and use the data to create your tax reports.

I recommend using positions over untracked buy/sell or the Coinbase UI, as you will get a much improved overview of your current exposure in the market. It is especially useful if you trade multiple products.

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
* NodeJS
* Twilio Account for SMS notifications



## Components

|Script|Description|
|---|---|
|server.js|Monitors tickers, orders, and products and publishes information through Redis cache and pub/sub. Must be running. Start with `node server.js --safe`|
|trade.js|Execute trade with take profit and stoploss, monitor products for tradability, auto-trade with your own algo (requires coding). Run `node trade.js --help` for instructions.|
|prices.js|Fetches price history and stores in postgres for analysis. Run `node price.js --help` for instructions.|



## Getting started

1. Make sure redis, postgres, screen, and nodejs is installed
   ```
   sudo apt install redis
   sudo apt install postgres
   sudo apt install screen

   # install nvm and then node.js
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
   nvm install
   ```
1. Clone this repository and download dependencies (if you haven't already)
   ```
   git clone https://github.com/dfient/coinbase-bot.git
   cd ./coinbase-bot
   npm install
   ```
1. Create a database and setup the schema in postgres
   ```
   psql -c "create database coinbasebot"
   psql -d coinbasebot -f `./schema/pricehistory.psql`
   ```
1. Configure the system with api-keys, twilio and database settings
   ```
   cp apikeys_template.js apikeys.js
   nano apikeys.js
   ```
1. Give execute permissions to the scripts for convenience
   ```
   chmod +x server.js prices.js trade.js
   ```
1. Start the server to connect to Coinbase' websocket and cache info in Redis. The server must be running at all times.
   ```
   screen ./server.js safe
   # hit Ctrl-D A to disconnect from the screen and the app continues in the background.
   ```
   ./server.js accepts two parameters, `start` which just runs the server, and `safe` which starts the server as a child process, and watches for any abnormal exits/crashes and restarts the server to keep it going. Most users should use `safe`, advanced users may have better ways of doing this.
1. Learn how to use ./trade.js
   ```
   ./trade.js --help
   ```
1. Try your first trade with a very small budget
   ```
   ./trade.js limit XLM-EUR --limit 0.01 --budget 10.00 --target 0.01 --stoploss 0.01 --verbose --disable-sms
   ```
   This order will hit the target or the stoploss very soon. Due to fees, the trade will be unprofitable. (Most users must see gains >1.0% to get a profit due to fees.) When running with higher --target percentages, use `screen ./trade.js <options>` to enable the trade to run in the background for the hours or days or weeks the trade will take.

   There is currently no way to disable the stoploss, so watch out, set it high enough to avoid volatility forcing a loss.
1. Try analyzing a single product
   ```
   ./trade.js analyze XLM-EUR --periods 30 --granularity 86400
   ```
1. Set up monitoring of all your products on the minute candlesticks
   ```
   ./trade.js monitor --periods 100 --granularity 60 --disable-sms
   ```
   Again, use `screen ./trade.js <options>` to keep running over longer periods of time. Remove `--disable-sms` to enable notifications via Twilio to your phone. Note that Twilio fees can be significant if you are monitoring e.g. 60s or 1m candles and have settings that frequently signal tradability. There is a circuit break that stops Twilio messages if more than 50 messages is sent in an hour, this can catch coding errors that would otherwise lead to excessive charges. Can be adjusted by setting `MAX_MESSAGES_PER_INTERVAL` in `twilio.js`.
1. Get some ticker data that you can analyse in your Excel or your favorite tool
   ```
   ./trade.js prices ADA-EUR --periods 20 --granularity 86400 --ema1 12 --ema2 26 --movavgperiods 10
   ```
   This will output the last 20 daily candles with calculated simple moving average over 10 periods for close, low, and high prices, as well as Exponential Moving Average on close for 12 and 26 periods (days). The output can be pasted into Excel for further analysis. Use `--raw` to get output in JSON format. This function is retrieving data live from Coinbase, so you are restricted to 300 periods until a future version where data will be pulled from the database.
1. Sync price history to the database.
   ```
   ./prices.js sync ETH-EUR --granularity 900 --startDate 2021-1-1
   ```
   This will download 15m candles for all of 2021 into the `pricehistory` table in postgres. Keep this up-to-date by running `./prices.js sync ETH-EUR --granularity 900` which will run an incremental update, you can e.g. sync once a day or every quarter to have "live data". You can now connect to the database from your favorite tools to run custom analysis. Downloading e.g. 1 minute candles for the entire history of Bitcoin will take significant time, so make sure you use `screen`. The bot handles throttling to not overload the Coinbase limits; do not run multiple price syncs simultaneously as this will exhaust your request limit and lead to Coinbase blocking your ip-address for some time.
1. Learn how to reconnect to a running process with screen to see your server (that is running in the background since step 6 of this tutorial).
   ```
   screen -list
   screen -r <id>
   ```
1. Monitor console output and log*.json for details. Set up some system for log monitoring, use `tail -f log.json` at first.

_Hint:_ Use cron or at to schedule e.g. price sync or trading

_Hint:_ Read the source code before using `auto` mode. Implement your algorithm, the provided one "catches falling knives" (read some trading books to learn what it means). Consider highly experimental at this time.



## Notes

Currently the tools do not optimize for Coinbase's maker/taker fee structure. This is to avoid risk - by placing the stoploss order at the exchange and replacing with sell order when market price reaches price target. This effectively makes every sell order a taker order, incurring higher fees at Coinbase. Most likely OK for most users at current Coinbase fee structure, but large volume traders must evaluate. Considering future optimizations here, so that both limit buy and target sell orders have higher chances of becoming maker orders - giving you 0% fees at volumes > $50M/30 days.

If trades fail, the system aborts with unhandled exceptions. Most regularly called functions have failbacks to handle e.g. connection issues or the like, and Redis is used to cache information to avoid frequent api-calls and therefore possible connection issues. Do monitor log files using your preferred system and keep Coinbase app on you to clean up asap should anything go wrong. It is useful to follow your bot using the exchange web interface or mobile app. You can manually cancel stoploss orders, effectively turning buy into HODL until target is reached.

If you are using the auto or monitor modes, place your server in Amazon US East N. Virginia (us-east-1) region for lowest possible latency.



## Contributing

Can't code or no time, but want me to keep running this project? Coffee keeps me awake, coding away. Litecoin (LTC) donations welcome to MT51Zx5i6iPm13ikJM7taPctRxungu4BP3 to keep my caffeine intake high.

Can code, test, write docs? Small or big, all contributions are welcome. Simply submit PRs.


## Use at your own risk

This project comes with _*zero warranties*_. Use at your own risk and with funds you can afford to lose, also due to technical errors like bugs, hickups, system faults, upgrades, iaas failures, lightning strikes, act of god. This system is designed for speed+performance, utilizes high resiliency architecture to cope with common problems, but will fail if your server falls over.


The system is not 'in-a-box', and needs experienced administrators caring for the system to keep it live. If you don't know what this is, please don't use this project. I recommend skimming the source files; if you do not fully understand what it takes to maintain the system then please walk away now.



## License

This project is released under the MIT License. Copyright 2021 dfient@protonmail.ch.



## Questions

Questions, ideas, feedback? Check out Issues and Wiki here at GitHub first, email at dfient@protonmail.ch for direct contact, optionally encrypted with [my PGP key](https://gist.github.com/dfient/ee3c204f9d4fb1aab17536a530639ded).
