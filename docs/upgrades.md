# upgrading from alpha-1

If you are currently running Alpha 1, you must update your database with the table required for tracking positions: `psql -d <databasename> -f ./schema/positions.psql`.



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot