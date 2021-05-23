# assumptions

Recording assumptions made in the development of the bot here.

1. Every product we work with have a ticker at least every 15 minutes (we cache in redis up to 15 minutes, functions built on the analysis framework will throw if the key expires, as they are configured to not make trading decisions or recommendations on stale data).
1. `server.js` must be running for other modules to function. The server publishes a heartbeat through redis, and `trade.js` uses this to verify that the server is running, but will fail at this for 60 seconds after the server quit (until the server.heartbeat key in redis expires). This could be made more intense, but keeping at this low level for the moment, should be good enough for most scenarios.
1. When displaying approximate results in `trade.js list-positions open`, we consider buy_fee*2 since we do not yet know what sales price will be and the fee structure that will apply. The approximate price is indicated by a tilde (~) after the price in the result column.
1. Currently the tools do not optimize for Coinbase's maker/taker fee structure. This is to avoid risk - by placing the stoploss order at the exchange and replacing with sell order when market price reaches price target. This effectively makes every sell order a taker order, incurring higher fees at Coinbase. Most likely OK for most users at current Coinbase fee structure, but large volume traders must evaluate. Considering future optimizations here, so that both limit buy and target sell orders have higher chances of becoming maker orders - giving you 0% fees at volumes > $50M/30 days.
1. If trades fail, the system aborts with unhandled exceptions. Most regularly called functions have failbacks to handle e.g. connection issues or the like, and Redis is used to cache information to avoid frequent api-calls and therefore possible connection issues. Do monitor log files using your preferred system and keep Coinbase app on you to clean up asap should anything go wrong. It is useful to follow your bot using the exchange web interface or mobile app. You can manually cancel stoploss orders, effectively turning buy into HODL until target is reached.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot