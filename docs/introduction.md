# introduction

coinbase-bot is developed in Javascript on NodeJS, and is a command line utility.

It exposes functionality for trading from the command line, which for some is faster and easier than using the Coinbase Pro web interface or mobile application.

coinbase-bot is self hosted. You can run it on your own laptop or on a virtual private server in the cloud. You do not have to share your API keys with anyone.

The goal of coinbase-bot is to make it easier to trade multiple crypto products, provide clear signals to help you maintain a consistent trading strategy, plus tools to automate parts of the trade to make it viable to execute intraday or swing trading without being present 100% of the time. 

Personally, I am using coinbase-bot to frequently execute relatively safe*, small-margin trades that would otherwise be unprofitable if I had to watch the markets continously; I simply do not trade large enough volumes to give up my dayjob and other obligations.

*) Cryptocurrency is not safe. All trading is associated with risk and you should not invest funds you cannot afford to lose. This, or any other information in this documentation, is not financial advice. Now, that's said.


## Audience

coinbase-bot is not for the faint of heart. You must like command line applications and have a fair bit of technical savviness to use it. If you're like me, you're faster on the command line and know your way around a linux server. If this resonates, coinbase-bot may be something for you.

Depending on interest, this may change in the future. E.g. a prepackaged container image and a web ui would make coinbase-bot available to many more people. I'd be more than happy to hear your thoughts on the future of coinbase-bot.


## Trading (buying and selling)

At the core of coinbase-bot is positions. A postion track a matching pair of orders, the buy and the sell order. This makes it very easy to track your trading activity, see your results, and can be used as a basis for tax reporting.

coinbase-bot also offers One Cancel Other (OCO) orders, which are not natively supported on Coinbase Pro. An OCO order lets you place a stop-loss and a take-profit (limit sell) order at the same time, and whichever executes first will cancel the other. While coinbase-bot cannot mimic this entirely from other exchanges, it places the stoploss order at the exchange, and then watches the market price in real time, and when/if it reaches the taret price, will cancel the stop-loss order and place a sell order at the target price.*

A future version will feature Trailing Stop Loss, which means you can track the price upwards and sell to secure profit once it drops a set amount.

*) Note: This means that your sell order will execute as a taker order, which can incur higher fees for high-volume traders. A future version will let you prioritize the take-profit order so that it is placed as a maker order, and then replace with the stoploss order should market prices drop. (Stoploss orders always turn into taker orders on Coinbase anyway.)


## Analysing trends and prices

coinbase-bot lets you syncronize price history from Coinbase Pro to a local PostgreSQL database. This makes it easy to analyse trends and prices using your favorite tools, such as Excel, Tabeleau, PowerBI, Python or any other tool.


## Monitoring multiple products

coinbase-bot lets you mobitor multiple products, and get buy signals via text message to your mobile. It monitors products for the right volatility, trend, and price and lets you know when it is time to consider to take a position. This tool is designed for intraday or swing traders that switch between products to take profit on upward trends. 

## Automatic trading

coinbase-bot contains a very experimental auto-trading bot that will most likely ruin your streak. Developers can use the included tools to implement their own trading strategy, and save quite a bit of effort over coding from scratch.

The Coinbase API has quite severe request throttling thresholds, and coinbase-bot has a framework that frees up (almost) all capacity for order management api calls.

Unlike many easily available bot products, coinbase-bot works with real-time data.


## Safety mechanisms

coinbase-bot also implements some safety mechanisms, such as stopping you from placing limit orders on the wrong (losing) side of the market price, which can be useful during hectic periods.

It also offers a 'panic button' which takes you entirely out of the market in split seconds should you get that bad hunch...



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot






