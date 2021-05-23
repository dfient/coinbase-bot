# system requirements

coinbase-bot is developed in Javascript and Node.JS, and should therefore run nicely on all systems, Linux, Mac, and Windows. 

However, I am developing and testing only on Linux; there may be cross-platform issues though I have given my best in avoiding this. All documentation is certainly slightly incorrect and need simple adjustments for Windows users on the syntax to execute a script.

I recommend running coinbase-bot on a virtual private server using Ubuntu LTS. Get a server e.g. in Azure, Amazon, GCP, or DigitalOcean. For lowest possible latency place your server in Amazon US East N. Virginia (us-east-1) region, which is where Coinbase runs its servers.

coinbase-bot does not require a lot of system resources. I run it nicely on a Raspberry Pi 4 for testing purposes. Network connection and latency is important. Make sure you have sufficient memory for Redis, and note that Redis will need a very tiny bit of more memory for every order you place.

If you download the entire price history for many products, Postgres will require disk space and memory accordingly. 3 years worth of 60 second candles for Bitcoin is about 300MB. Postgres will also grow (however little) with every position.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot