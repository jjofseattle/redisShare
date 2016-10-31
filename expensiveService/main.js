var express = require('express');
var jsonFile = require('./zips.json');

var app = express();

app.get('/expensiveOperation',  function(req, res) {
    //console.log('new request');
    var start = Date.now();
    reqHandler(req,res);

    function reqHandler(req, res) {
        //console.log(req.query.iter);
        req.query.iter--;
        if(req.query.iter === 0) {
            var duration = Date.now() - start;
            console.log('duration', duration);
            res.send({'duration': duration});
        }
        else {
            var jsonString = JSON.stringify(jsonFile);
            jsonFile = JSON.parse(jsonString);
            jsonFile['iter' + req.query.iter] = jsonFile;
            setTimeout(reqHandler.bind(null, req, res), 1);
        }
    }
});

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});
