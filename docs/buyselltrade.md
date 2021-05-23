# untracked buy, sell, and trade

You can use coinbase-bot without using positions. This effectively gives you a command line interface to the features
you have in the Coinbase Pro UI, but with the convenience and speed of the command line, and not at least an
easy way to script your trades.

For example, a dollar cost averaging strategy is easily implemented with crontab or at. You can e.g. buy more crypto
every 1st of the month, every day at 7 AM or every 4th hour.


## buying

Buy a product in `market` or `limit` mode, e.g.:

`trade.js buy limit ADA-EUR --limit 0.1 --budget 10`

This will place a limit buy order at the exchange. No further action is taken by coinbase-bot when/if the order executes. (If you want e.g. a stoploss order placed once the buy order executes, use [positions](positions.md) or single trades as described below.)


## selling

Sell a product in `market` or `limit` mode, e.g.:

`trade.js sell limit ADA-EUR --size 10 --limit 125.00`

This will place a sell order at the exchange for 10 ADAs to be sold at 125 €.


## canceling orders

When an order executes, the `buy` and `sell` modes output an order id, on the form of `43816b9a-e997-4cc2-92e6-96b77116f4e7`. You can cancel such an order using

`trade.js cancel 43816b9a-e997-4cc2-92e6-96b77116f4e7`

You can also find and cancel your orders on the Coinbase website or mobile app.


## single trades

A single trade is a script that places a buy order, then watches the market to take profit or stop loss. This was the first feature of coinbase-bot, and is now replaced by [positions](positions.md) which are far superior. I do not recommend using this functionality anymore.

```
 screen ./trade.js market ADA-EUR -t 1.0 -s 1.0 -b 10
```

This will buy ADA for 10 €, then sell it again if it increases or drops by 1.0%.

The script places a stop-loss order at the exchange. If you do not want the stop-loss, you can cancel this through the Coinbase website or mobile app.

If the script is stopped, the sell order will not execute, and you have turned this into a HODL.

Again, I highly recommend using [positions](positions.md).



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot