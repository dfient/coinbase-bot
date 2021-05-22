# assumptions

Recording assumptions made in the development of the bot here.

1. Every product we work with have a ticker at least every 15 minutes (we cache in redis up to 15 minutes, functions built on the analysis framework will throw if the key expires, as they are configured to not make trading decisions or recommendations on stale data).
1. `server.js` must be running for other modules to function. The server publishes a heartbeat through redis, and `trade.js` uses this to verify that the server is running, but will fail at this for 60 seconds after the server quit (until the server.heartbeat key in redis expires). This could be made more intense, but keeping at this low level for the moment, should be good enough for most scenarios.
1. When displaying approximate results in `trade.js list-positions open`, we consider buy_fee*2 since we do not yet know what sales price will be and the fee structure that will apply. The approximate price is indicated by a tilde (~) after the price in the result column.