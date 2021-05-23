# components

|Script|Description|
|---|---|
|server.js|Monitors tickers, orders, and products and publishes information through Redis cache and pub/sub. Must be running. Start with `node server.js start`|
|trade.js|Execute trade with take profit and stoploss, monitor products for tradability, auto-trade with your own algo (requires coding). Run `node trade.js --help` for instructions.|
|prices.js|Fetches price history and stores in postgres for analysis. Run `node price.js --help` for instructions.|
|calc.js|A very simple command line calculator.|


_Note:_ The codebase is currently a bit unorganized. This started as a very small test project, and has grown quite a bit. A future version will organize the code into `./src` and `./src/lib` directories to make it easier to navigate the source code.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot