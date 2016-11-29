var Etcd = require('node-etcd');
var etcd = new Etcd();
//etcd.set("key", "value");
etcd.get("key1", {wait: true, waitIndex: 1}, console.log);
//etcd.get("key", console.log);
