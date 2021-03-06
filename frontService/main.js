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
//var etcd = new Etcd('localhost:2379', { timeout: 500000 });
var etcd = new Etcd();

var app = express();
var count  = 0;

var luaScript = fs.readFileSync('./fetchTime.lua', { encoding: 'utf8' });
console.log(luaScript);

app.get('/expensiveOperation*',  function(req, res) {
    reqHandler(req,res);

    function reqHandler(req, res) {
        var key = 'expensiveOperation|iter|' + req.query.iter;
        var fetchingTimeKey = key + '|fetchingTime';
        var etcdKey = key + '|etcdKey';
        var etcdKeyToWait = uuid.v4();
        
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
                // console.log('not in cache');
                return redisClient.evalAsync(luaScript, 2, fetchingTimeKey, etcdKey, Date.now(), etcdKeyToWait)
                    .then(function(result) {
                        if(!result) {
                            //console.log('waiting');
                            return waitForResult();
                        }
                        else {
                            console.log('fetching');
                            return remoteCall();
                        }
                    });

                    function waitForResult() {
                        return redisClient.getAsync(etcdKey)
                                .then(etcdPromise)
                                .then(function(response) {
                                    console.log('get it from etcd', response);
                                    res.status(response.statusCode).send(response.message);
                                });
                                

                        function etcdPromise(value) {
                            return new bluebird(getResponse);
                            function getResponse(resolve, reject) {
                                etcd.get(value, {wait: true, waitIndex: 1}, function(err, response) {
                                    if(err) reject(err);
                                    else resolve(JSON.parse(response.node.value));
                                });
                            }
                        }
                    }

                    function remoteCall() {
                         requestPromise('http://localhost:3000' + req.path + '?iter=' + req.query.iter)
                            .then(function(response) {
                                console.log('get result', response);
                                return redisClient.setAsync(key, response)
                                    .then(result => { redisClient.expire(key, 60); })
                                    .then(result => { res.status(200).send(response); })
                                    .then(etcdPromise)
                                    .catch(function(err) {
                                        console.log(err, err.trace);
                                    });

                            function etcdPromise(value) {
                                return new bluebird(setEtcdValue);
                                function setEtcdValue(resolve, reject) {
                                    var message = {
                                        statusCode: 200,
                                        message: response 
                                    };
                                    console.log('JJJJ', etcdKeyToWait);
                                    
                                    etcd.set(etcdKeyToWait, JSON.stringify(message), { ttl: 60 }, function(err, response) {
                                        if(err) {
                                            reject(err);
                                        }
                                        else  {
                                            console.log('set response', response);
                                            resolve();
                                        }
                                    });
                                }
                            }
                            })
                            .catch(function(err) {
                                console.log(err.statusCode);
                                var message = {
                                    statusCode: err.statusCode,
                                    message: err.message 
                                };
                                etcd.set(etcdKeyToWait, JSON.stringify(message),{ ttl: 60 }, console.log);

                                res.status(err.statusCode).send(err.message);
                            })
                    }
            }
    }
});

app.listen(3001, function () {
  console.log('Example app listening on port 3001!');
});
