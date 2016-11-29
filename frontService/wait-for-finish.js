var fs = require('fs');
var express = require('express');
var requestPromise = require('request-promise');
var redis = require('redis');
var bluebird = require('bluebird');
var uuid = require('node-uuid');
var Etcd = require('node-etcd');
bluebird.config({
    warnings: false
});
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

var redisClient = redis.createClient();

var app = express();

var luaScript = fs.readFileSync('./fetchTime.lua', { encoding: 'utf8' });
console.log(luaScript);

app.get('/expensiveOperation*',  function(req, res) {
    reqHandler(req,res);

    function reqHandler(req, res) {
        var key = 'expensiveOperation|iter|' + req.query.iter;
        var fetchingTimeKey = key + '|fetchingTime';
        var etcdKey = key + '|etcdKey';
        var etcd = new Etcd();
        var etcdKeyToWait = uuid.v1();
        
        redisClient.getAsync(key)
            .then(function(result) {
                if(result) {
                    console.log('found in cache', result);
                    res.status(200).send(result);
                }
                else {
                    doFetching();
                }
            })
            .catch(function(err) {
                doFetching();
            });

            function doFetching() {
                console.log('not in cache');
                return redisClient.evalAsync(luaScript, 2, fetchingTimeKey, etcdKey, Date.now(), etcdKeyToWait)
                    .then(function(result) {
                        if(!result) {
                            console.log('waiting');
                            return waitForResult();
                        }
                        else {
                            console.log('fetching');
                            return remoteCall();
                        }
                    });

                    function waitForResult() {
                        return redisClient.getAsync(key)
                            .then(function(result) {
                                if(result) {
                                    console.log('finally in cache while waiting', result);
                                    res.status(200).send(result);
                                }
                                else {
                                    setTimeout(waitForResult, 1000);
                                }
                            })
                            .catch(function(err) {
                                setTimeout(waitForResult, 1000);
                            });
                    }

                    function remoteCall() {
                         requestPromise('http://localhost:3000' + req.path + '?iter=' + req.query.iter)
                            .then(function(response) {
                                console.log('get result', response);
                                return redisClient.setAsync(key, response)
                                    //.then(setEtcdValue)
                                    .then(result => { redisClient.expire(key, 60); })
                                    .then(result => { res.status(200).send(response); })
                                    .catch(function(err) {
                                        console.log(err, err.trace);
                                    });
                            })
                            .catch(function(err) {
                                console.log(err, err.trace);
                                res.status(err.statusCode).send(err.message);
                            })
                    }
            }
    }
});

app.listen(3001, function () {
  console.log('Example app listening on port 3001!');
});
