
# trading with positions

The Positions feature is at the center of coinbase-bot (and the main feature of Alpha 2). This is the recommended way to use coinbase-bot.

A position is a database entry in the `positions` table in postgres. It tracks a trading pair: one buy and a matching sell order of the same quantity. Positions let you track your trades and see how each trade performs. When a position is closed (sold), both the buy and sell price is kept in the database record, which means you can use this to track
your results of each trade, which may help with tax reporting.

You can use positions entirely manually, issuing both the buy and sell actions on the command line. You can also associate a position with a take-profit and/or stop-loss percentage. coinbase-bot will then monitor the current market price and close (sell) the position if either of those price targets are reached. (Future versions will offer a trailing stop-loss, which makes it easier to follow a product as it increases in price, and sell once it drops back a set percentage.)

If you trade multiple currencies, positions come to their full right. They then give you an overview of performance of all your trades across all currencies in one single view, which is cumbersome in the Coinbase Pro interface.

Finally, positions give you a Panic button. If you get that hunch or read that tweet that tells you the market is collapsing, executing the panic command will sell you out of all positions in a split second.

The documentation below is intended to give an introduction to using positions and an overview of the concepts. For full details, use `./trade.js <command> --help`.


## Opening a position (buying)

`./trade.js open market ADA-EUR --name my-first-cardano --budget 10` will buy ADA for €10 and hodl.

You can also set closing parameters:

`--take-profit 10%` - will set a take profit level 10% above the buy price. You can also specify a set price, which is useful for `limit` mode. I find it easier to work with percentages, as they are comparable between products and easier for products where prices are fractions of a dollar or euro.

`--stop-loss 25%` - will set a stop loss at 25% below the buy price.

`--close-at 2021-12-31 23:59:59` - sets a time for closing the position. This will disregard the take-profit and stop-loss parameters, and close the position at market price at the set time.


## Adjusting a position

You can set, change, or remove your `--take-profit`, `--stop-loss` and `--close-at` parameters at any time for positions that are in the `new` or `open` status modes.

`./trade.js adjust my-first-cardano --take-profit 50%` - sets or changes the take-profit level to 50% above the buy price.

`./trade.js adjust my-first-cardano --stop-loss` - removes the stop-loss from the specified position

The same principle applies to all three parameters.


## Viewing your positions and their performance

`./trade.js list-positions all` will list all positions, and their final or estimated results based on market price.

You can filter the list using `all`, `new`, `open`, `closed` parameters.

__Formats:__ Output is by default in human readable form (pretty printed table). You can output in CSV format for export to Excel by adding `--csv` or get the raw data in JSON format by using `--raw`.

## Closing a position (selling)

A position can be closed manually in market or limit mode. Executing a close command will disregard any take-profit or stop-loss parameters already set on the position.

`./trade.js close market my-first-cardano` - closes the position at current market price. If there is already a limit sell order pending, it will be canceled and replaced by the market sell order.

`./trade.js close limit my-first-cardano --limit 125.00` will place a limit sell order at €125.

There is currently no way to split a position, closing a position will always sell the entire position.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot
