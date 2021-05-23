# coinbase trading bot

Command-line tool to assist with trading on Coinbase.

This tool is designed to mitigate some weaknesses in Coinbase Pro, and add tools to help you make profitable trades, plus track your results to make tax reporting easier.

It exposes functionality for trading from the command line, which for some is faster and easier than using the Coinbase Pro web interface or mobile application.

The goal of coinbase-bot is to make it easier to trade multiple crypto products, provide clear signals to help you maintain a consistent trading strategy, plus tools to automate parts of the trade to make it viable to execute intraday or swing trading without being present 100% of the time.



## Features

New features in Alpha 2:

1. Track positions. Every opened position is tracked in the database with buy price, and later sell price and result. Positions make trading multiple crypto products easier, helps with tracking results, and is a framework for tax reporting.
1. Command-line buy/sell (as opposted to trades that try to take profit and without tracking the position)
1. Included first version of proper [Documentation](./docs/index.md)
1. Improved stability, logging and error handling
1. Note: System now relies on Redis and Postgres and server.js to be running for stability, durability, flexibility


Features from Alpha 1:

1. Automate trading, e.g. buy every morning at 7 for dollar cost averaging in or out of a crypto product
1. Place OCO (one cancels other) orders: Cancels stoploss and replaces with buy at target price. Coinbase Pro does not support OCO orders, this functionality makes it easier to successfully execute intraday or swing trade strategies.
1. Monitor multiple products' price and trend and get buy signals via SMS to your phone
1. Download price (ticker) history to PostgreSQL for local analysis e.g. in Excel, Tableau or PowerBI
1. Framework for auto-trading, e.g. using exponential moving averages or other signals


To learn all the options, run `./trade.js --help`.

Read the Getting Started section below before you execute any of the commands documented here in the Features section.



### Trading and tracking positions

If you trade actively, positions will help you track your trades across multiple products, better track your gains/losses, and have a framework for tax reporting on your results. Positions can be opened and closed manually, you can set take profit and/or stop loss levels, or a time at which the position will be closed automatically (e.g. end of trading day).

![Screenshot showing list of positions](https://github.com/dfient/coinbase-bot/raw/main/docs/img/list-positions.png "List of positions")
 
You can run individual trades and manual buy/sell operations in addition to your positions, but take care to not touch the part of your account currently 'owned' by open positions. Best practice is to use positions only.

`./trade.js open market ADA-EUR --name my-first-cardano --budget 10` will buy ADA for €10 and hodl.

If --name is not specified, the bot will create a short unique identifier, e.g. `41xzipduq`

`./trade.js list-positions all` will list your positions and results according to current market price.

`./trade.js adjust my-first-cardano --take-profit 10%` will set a take-profit target on the Cardano position you just created.

`./trade.js adjust my-first-cardano --stop-loss 25%` will set a stop-loss on the Cardano position you just created.

`./trade.js close market my-first-cardano` will close (sell) the position at market price.

`./trade.js panic` will close (sell) all open positions at market price, must be run with `--force` to execute the sells.

You can also easily export your trade history and all results by using `./trade.js list-positions closed` and use the data to create your tax reports.

I recommend using positions over untracked buy/sell or the Coinbase UI, as you will get a much improved overview of your current exposure in the market. It is especially useful if you trade multiple products.

List exports support pretty print (default), CSV and JSON with the `--csv` and `--raw` options.

Read [more about positions in the documentation](./docs/positions.md)




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

The bot will only take one position at a time, spending the full budget (specified as a parameter and does not need to be your full account balance). If multiple products hit the price target at the same time, it will take a position in the product with the highest volatility. Also note that the current version does not track positions, so you cannot see auto-trading activity using `list-positions`.

__Important: The included algorithm is too weak and must be enhanced; in many cases it "catches falling knives". Edit the code and add your own algorithm if you want to use `auto`. Future updates will have more signals and indicators and object oriented abstractions in the code to make implementing your favorite algorithm easier (e.g. buying ema crossovers, using an RSI strategy, or similar).__

I highly recommend using `monitor` and then manual technical analysis before acting on the signal manually (instead of `auto` mode).



### Trading (without tracking positions)

You can also trade from the command-line without tracking your positions, [read more about this in the documentation](./docs/index.md).



## Coming: Alpha 3 version

Incorporating TA-Lib to enhance the `./trade.js analyze ADA-EUR` function with more signals and indicators. Building UI to monitor positions with easy
overview of important indicators; also making the `monitor` and `auto` (trading bot) modes easier to use to leverage advanced
indicators, plus a much improved technical architecture for durability.



## Planned: Alpha 4 version

Implementing trailing-stop loss, which lets you follow an upwards trend and sell once the trend reverses a set certain percentage points.

Implementing `open soft` for positions. This will not place a buy order at the exchange, but monitor the currency for the price target. If the price drops below the set limit, a buy order is placed with the exchange, provided there are sufficient funds in the account. This lets you place orders to "buy the dip" for multiple currencies at the same time (because funds are not put in hold by the exchange), and buy the first product that matches your criteria. Others 'soft opened' orders will be left pending until funds are available in the account, e.g. after your first soft open meets its profit target and closes.)

Implementing `--open-at` for positions, making it possible to place buy orders into the future, e.g. at a specific date and time. This can be used as part of a dollar-cost-averaging strategy. It can be combined with --close-at to automatically sell the position at a later time - e.g. buying at market price every day at 7 AM, selling at 3 PM.

Smaller improvements: More notifications and extensibility in the platform to help you ensure it runs well and to help you code your own extensions.



## Getting started

You can find a [step-by-step getting started guide in the documentation](./docs/gettingstarted.md).



## Requirements

* Coinbase Pro account and API Keys
* Linux server wtih Node.JS, Redis, Postgres
* Twilio Account for SMS notifications

[See full details in the documentation](./docs/systemrequirements.md)



## Components

|Script|Description|
|---|---|
|server.js|Monitors tickers, orders, and products and publishes information through Redis cache and pub/sub. Must be running. Start with `node server.js start`|
|trade.js|Execute trade with take profit and stoploss, monitor products for tradability, auto-trade with your own algo (requires coding). Run `node trade.js --help` for instructions.|
|prices.js|Fetches price history and stores in postgres for analysis. Run `node price.js --help` for instructions.|

[See full details in the documentation](./docs/components.md)



## Contributing

Can't code or no time, but want me to keep running this project? Coffee keeps me awake, coding away. Litecoin (LTC) donations welcome to MT51Zx5i6iPm13ikJM7taPctRxungu4BP3 to keep my caffeine intake high.

Can code, test, write docs? Small or big, all contributions are welcome. Simply submit PRs.


## Use at your own risk

This project comes with _*zero warranties*_. Use at your own risk and with funds you can afford to lose, also due to technical errors like bugs, hickups, system faults, upgrades, iaas failures, lightning strikes, act of god. This system is designed for speed+performance, utilizes high resiliency architecture to cope with common problems, but will fail if your server falls over.


The system is not 'in-a-box', and needs experienced administrators caring for the system to keep it live. If you don't know what this is, please don't use this project. I recommend skimming the source files; if you do not fully understand what it takes to maintain the system then please walk away now. (This may change as the project matures.)



## License

This project is released under the MIT License. Copyright 2021 dfient@protonmail.ch.



## Questions

Questions, ideas, feedback? Check out Issues and Wiki here at GitHub first, email at dfient@protonmail.ch for direct contact, optionally encrypted with [my PGP key](https://gist.github.com/dfient/ee3c204f9d4fb1aab17536a530639ded).
