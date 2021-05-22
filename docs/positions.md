
# Buy and Sell with Positions

The Positions feature is at the center of coinbase-bot (and the main feature of Alpha 2). This is the recommended 
way to use coinbase-bot.

A position is a database entry in the `positions` table in postgres. It tracks a trading pair: one buy and a matching 
sell order of the same quantity. Positions let you track your trades and see how each trade performs. When a position
is closed (sold), both the buy and sell price is kept in the database record, which means you can use this to track
your results of each trade, which may help with tax reporting.

You can use positions entirely manually, issuing both the buy and sell actions on the command line. You can also
associate a position with a take-profit and/or stop-loss percentage. coinbase-bot will then monitor the current market
price and close (sell) the position if either of those price targets are reached. (Future versions will offer a
trailing stop-loss, which makes it easier to follow a product as it increases in price, and sell once it drops back a
set percentage.)

If you trade multiple currencies, positions come to their full right. They then give you an overview of performance
of all your trades across all currencies in one single view, which is cumbersome in the Coinbase Pro interface.

Finally, positions give you a Panic button. If you get that hunch or read that tweet that tells you the market is
collapsing, executing the panic command will sell you out of all positions in a split second.


## Opening a position (buying)

## Closing a position (selling)

## Viewing your positions and their performance

## Adjusting take-profit and/or stop-loss limits

