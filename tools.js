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