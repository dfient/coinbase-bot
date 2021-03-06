# known issues

* The websocket connections drops every now and then. It is unclear if this is a client-side, network, or server-side issue. This is the reason server.js is running with child-processes, and will restart a process immediately if the child exits. The websocket listener has a heartbeat detector, and will kill itself if a new message has not been received for n seconds (look up n in the source code).
In the event that such a connection issue or restart happens at the same time as an order is posted, filled, or canceled the listener will miss these messages, leaving orders and positions in undefined states, possibly requiring manual cleanup. There are several possible improvements to resiliently handle this which will have to wait for future versions. (Double-check that received message is posted to redis at time of order, if not, take steps. Watch sequence numbers in messages, if any message missed take steps to validate state. Use order:open and order:completed sets to fetch order status for known orders. Post to order:new when placing order to inform server of new orders. And possibly more.)



---
Back to [Table of Content](index.md). MIT License - Copyright (c) 2021 dfient@protonmail.ch; https://github.com/dfient/coinbase-bot