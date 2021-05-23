# download ticker (price) history

There are two ways to get price history from Coinbase using coinbase-bot. First, you can do this interactively using `trade.js`. This is (currently) using a live connection to the Coinbase public API, and is therefore limited to 300 candles, but is an easy way to get the latest price data into e.g. Excel for analysis:

   ```
   ./trade.js list-prices ADA-EUR --periods 180 --granularity 86400 --ema1 12 --ema2 26 --movavgperiods 10
   ```

This will output the last 6 months daily candles with calculated simple moving average over 10 periods for close, low, and high prices, as well as Exponential Moving Average on close for 12 and 26 periods (days). 

The output can be pasted into Excel for further analysis. 

Use `--raw` to get output in JSON format.


## Importing price data into Postgres

`prices.js` will download historical price data and store it in the Postgres database, in the `pricehistory` table. It uses the `syncstatus` table to keep track of runs, and will incrementally update the database with new data every time it is run.


   ```
   ./prices.js sync ETH-EUR --granularity 900 --startDate 2021-1-1
   ```

This will download 15 minute candles for all of 2021 into the `pricehistory` table in postgres. 

Keep this up-to-date by running `./prices.js sync ETH-EUR --granularity 900` which will run an incremental update, you can e.g. sync once a day or every quarter to have "live data". 

You can now connect to the database from your favorite tools to run custom analysis, e.g using Excel or Python with TA-Lib.

Downloading e.g. 1 minute candles for the entire history of Bitcoin will take significant time, so make sure you use `screen`. The bot handles throttling to not overload the Coinbase limits; do not run multiple price syncs simultaneously as this will exhaust your request limit and lead to Coinbase blocking your ip-address for some time. The bot __does not__ gracefully recover if it encounters errors during the price sync, so you may need to clean up the database and rerun the sync.

__Note:__ The first time you run a price sync, you set a baseline through the --startDate parameter. If you ever want older data than that, you must manually delete the data from the tables and rerun the sync.

   ```
   psql -c "delete from pricehistory where product='PRODUCT' and granularity='GRANULARITY'"
   psql -c "delete from syncstatus where product='PRODUCT' and granularity='GRANULARITY'"
   ```

Now, rerun `prices.js` with the intended start date set.

You can also use this if price sync fails due to e.g. connection erorrs and you are left with partial data in the database.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot