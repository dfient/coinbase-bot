# getting started

1. Log in to your Linux server. coinbase-bot is developed and tested on Ubuntu, and the instructions below may differ for other distributions. Here are some alternatives:
    1. Spin up an Ubuntu server in Azure, AWS, GCP or DigitalOcean
    1. On Windows 10, install WSL and Ubuntu on your own box
    1. Use a Raspberry Pi 4
1. Make sure redis, postgres, screen, and nodejs is installed
   ```
   sudo apt install redis
   sudo apt install postgres
   sudo apt install screen

   # install nvm and then node.js
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
   nvm install node
   ```
1. Clone this repository and download dependencies (if you haven't already)
   ```
   git clone https://github.com/dfient/coinbase-bot.git
   cd ./coinbase-bot
   npm install
   ```
1. Create a database and setup the schema in postgres
   ```
   psql -c "create database coinbasebot"
   psql -d coinbasebot -f ./schema/pricehistory.psql
   psql -d coinbasebot -f ./schema/positions.psql
   ```
1. Configure the system with api-keys, twilio and database settings
   ```
   cp apikeys_template.js apikeys.js
   nano apikeys.js
   ```
1. Give execute permissions to the scripts for convenience
   ```
   chmod +x server.js prices.js trade.js calc.js
   ```
1. Start the server to connect to Coinbase' websocket and cache info in Redis. The server must be running at all times.
   ```
   screen ./server.js start
   # hit Ctrl-D A to disconnect from the screen and the app continues in the background.
   ```
   Advanced users may want to install this as a daemon that auto-starts upon system restarts.
1. Learn how to use ./trade.js
   ```
   ./trade.js --help
   ```
1. Open your first position with a very small budget
   ```
   ./trade.js open market XLM-EUR --budget 10.00 --name my-first
   ```
   You will now have an open position for XLM in your account, and you are a command-line hodl'er :)
1. View your positions
   ```
   ./trade.js list-positions all
   ```
   This lets you see how your position is fairing. The result column takes fees into account, and estimated results assume the same sell fees and buy fees. I.e. result is an approximate net (vs gross) result.
1. Adjust your position with stop-loss and profit target
   ```
   ./trade.js adjust my-first --take-profit 10% --stop-loss 25%
   ```
   Now, the server will watch your position. If the market price reaches the take-profit or stop-loss levels, your position will be closed.
1. Force a close of the position
   ```
   ./trade.js close market my-first
   ```
   This will close the position at market price (disregarding the set take-profit and stop-loss parameters).
1. Check out the `./trade.js panic` option, which will close all pending orders and in split seconds sell every position you have at market price. Good for those days you have tons of positions open and you get a hunch it all collapses.
1. Try analyzing a single product
   ```
   ./trade.js analyze XLM-EUR --periods 30 --granularity 86400
   ```
1. Set up monitoring of all your products on the minute candlesticks
   ```
   ./trade.js monitor all --periods 100 --granularity 60 --disable-sms
   ```
   Again, use `screen ./trade.js <options>` to keep running over longer periods of time. Remove `--disable-sms` to enable notifications via Twilio to your phone. Note that Twilio fees can be significant if you are monitoring e.g. 60s or 1m candles and have settings that frequently signal tradability. There is a circuit break that stops Twilio messages if more than 50 messages is sent in an hour, this can catch coding errors that would otherwise lead to excessive charges. Can be adjusted by setting `MAX_MESSAGES_PER_INTERVAL` in `twilio.js`.
1. Get some ticker data that you can analyse in your Excel or your favorite tool
   ```
   ./trade.js list-prices ADA-EUR --periods 20 --granularity 86400 --ema1 12 --ema2 26 --sma 10
   ```
   This will output the last 20 daily candles with calculated simple moving average over 10 periods for close, low, and high prices, as well as Exponential Moving Average on close for 12 and 26 periods (days). The output can be pasted into Excel for further analysis. Use `--raw` to get output in JSON format. This function is retrieving data live from Coinbase, so you are restricted to 300 periods until a future version where data will be pulled from the database.
1. Sync price history to the database.
   ```
   ./prices.js sync ETH-EUR --granularity 900 --startDate 2021-1-1
   ```
   This will download 15m candles for all of 2021 into the `pricehistory` table in postgres. Keep this up-to-date by running `./prices.js sync ETH-EUR --granularity 900` which will run an incremental update, you can e.g. sync once a day or every quarter to have "live data". You can now connect to the database from your favorite tools to run custom analysis. Downloading e.g. 1 minute candles for the entire history of Bitcoin will take significant time, so make sure you use `screen`. The bot handles throttling to not overload the Coinbase limits; do not run multiple price syncs simultaneously as this will exhaust your request limit and lead to Coinbase blocking your ip-address for some time.
1. Learn how to reconnect to a running process with screen to see your server (that is running in the background since step 6 of this tutorial).
   ```
   screen -list
   screen -r <id>
   ```
1. Monitor console output and log*.json for details. Set up some system for log monitoring, use `tail -f log.json` at first.

_Hint:_ Use cron or at to schedule e.g. price sync or trading

_Hint:_ Read the source code before using `auto` mode. Implement your algorithm, the provided one "catches falling knives" (read some trading books to learn what it means). Consider highly experimental at this time.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot
