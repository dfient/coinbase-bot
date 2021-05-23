# monitor products for tradability

You can monitor a single or all products for tradability. The example below uses the `all` parameter, you can replace this with i.e. `BTC-EUR`.


   ```
   ./trade.js monitor all --periods 100 --granularity 60 --disable-sms
   ```

To customize the monitoring, use the following parameters:

1. `--volatility 2.5` - this requires a difference of >=2.5% between average low and average high to consider a product tradable.
1. `--sma 10` - this sets the period for the simple moving average
1. `--ema1 12` - this sets the period for the (short) exponential moving average on close, which is used for trend calculation
1. `--ema2 26` - this sets the period for the (long) exponential moving average on close, which is used for trend calculation


__Trend:__ When --ema1 > --ema2, the bot considers us to be in a positive, tradable trend.

If you want to see how these paramters play out in data, use `trade.js list-prices` with the same parameters and pull this into Excel for analysis.

If you need this to be running over longer periods of time, remember to use `screen ./trade.js <options>` to ensure the script continues to run even if your terminal is disconnected.


__SMS Notifications:__ Remove `--disable-sms` to enable notifications via Twilio to your phone. Note that Twilio fees can be significant if you are monitoring e.g. 60s or 1m candles and have settings that frequently signal tradability. 

There is a circuit break that stops Twilio messages if more than 50 messages is sent in an hour, this can catch coding errors that would otherwise lead to excessive charges. Can be adjusted by setting `MAX_MESSAGES_PER_INTERVAL` in `twilio.js`.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot