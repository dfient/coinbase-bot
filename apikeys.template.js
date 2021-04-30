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