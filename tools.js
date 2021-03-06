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

Module:         Misc tool functions used by other modules

Usage:          See individually exported functions

*/



module.exports.sleep = function sleep(ms) 
{
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}



module.exports.keypress = async function()
{
  process.stdin.resume();
  
  return new Promise(resolve => process.stdin.once('data', () => 
  {
    process.stdin.pause();
    resolve();
  }
  ));
}



module.exports.countDecimals = function(number)
{
  const strnum = number.toString();
  const lastPeriod = strnum.lastIndexOf('.');
  return lastPeriod == -1 ? 0 : strnum.length - lastPeriod - 1;
}



module.exports.getCurrencySymbolFromProduct = function(str)
{
  return str.indexOf( "-EUR" ) > 0 ? '€' : '$';
}



module.exports.zeroPad = function(num, places) 
{
  return String(num).padStart(places, '0');
}



module.exports.now = function()
{
  return new Date();
}