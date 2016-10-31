var fs = require('fs');
var express = require('express');
var requestPromise = require('request-promise');
var redis = require('redis');
var bluebird = require('bluebird');
bluebird.config({
    warnings: false
});
bluebird.promisifyAll(redis.RedisClient.prototype);
bluebird.promisifyAll(redis.Multi.prototype);

var redisClient = redis.createClient();

var app = express();

var luaScript = fs.readFileSync('./fetchTime.lua', { encoding: 'utf8' });
console.log(luaScript);

app.get('/expensiveOperation',  function(req, res) {
    reqHandler(req,res);

    function reqHandler(req, res) {
        var key = 'expensiveOperation|iter|' + req.query.iter;
        var fetchingTimeKey = key + '|fetchingTime';
        
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
                return redisClient.evalAsync(luaScript, 1, fetchingTimeKey, Date.now())
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
                        return redisClient.setAsync(key + '|fetchingTime', Date.now())
                            .then(result => { return requestPromise('http://localhost:3000/expensiveOperation?iter=' + req.query.iter); })
                            .then(function(response) {
                                console.log('get result', response);
                                return redisClient.setAsync(key, response)
                                    .then(result => { redisClient.expire(key, 10); })
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
