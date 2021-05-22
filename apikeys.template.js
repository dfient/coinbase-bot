/*

COINBASE-BOT

MIT License

Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

--

Module:         Template for apikeys.js which is the configuration store
                for the system

Description:    Fill in values below and save as apikeys.js

Usage:          No specific usage, referred to by other modules for
                configuration data.

*/

// Your base currency on Coinbase. This bot only supports trading with one
// base currency, can be USD or EUR (or else) depending on your preference and
// account abilities. [If you need two, you need to run two instances of the bot.]

module.exports.BASE_CURRENCY = "EUR";
module.exports.TRADING_PRODUCTS = ['BTC-EUR', 'ETH-EUR', 'LTC-EUR', 'ADA-EUR', 'LINK-EUR', 'SUSHI-EUR'];


// Fill in values and rename file to apikeys.js.
// apikeys.js is in .gitignore and should not be commited (and leak keys)

module.exports.API_KEY = '';
module.exports.API_PASS = '';
module.exports.API_SECRET = '';


// Use this for sandbox testing
// Hint: "Deposit" funds and create sandbox api key on https://public.sandbox.pro.coinbase.com
module.exports.API_URL = 'https://api-public.sandbox.pro.coinbase.com'

// Use this for production
//module.exports.API_URL = 'https://api.pro.coinbase.com';


// Twilio for sms notifications on completed trades

module.exports.TWILIO_SID = '';
module.exports.TWILIO_TOKEN = '';
module.exports.SMS_FROM_NUMBER = '';
module.exports.SMS_TO_NUMBER = '';


// Postgres database, used for trade and price history

module.exports.POSTGRES_SETTINGS = {
    database: '',
    user: '',
    password: ``
   };