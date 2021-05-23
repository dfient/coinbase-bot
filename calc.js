#!/usr/bin/env node

/* MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot */

const mathjs = require('mathjs');
const yargs = require('yargs');

main();

function main()
{
    var argv = parseCommandLine();
}

function parseCommandLine()
{
    const argv = require('yargs/yargs')(process.argv.slice(2))
    .command(['eval <expression>', '$0 <expression>'], 'evaluate expression', () => {}, (argv) => {
        calculator( argv.expression );
    })
    .help()
    .alias('help', 'h')
    .argv

    return argv;
}

function calculator( expression )
{
    var math = mathjs.create( mathjs.all, {} );
    var res = math.evaluate( expression );
    console.log( res );
}