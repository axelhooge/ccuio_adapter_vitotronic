var settings = require(__dirname + '/../../settings.js');
var net = require('net');
var logger = require(__dirname+'/../../logger.js');
var io     = require('socket.io-client');

logger.info("adapter vitotronic started");
if (!settings.adapters.vitotronic || !settings.adapters.vitotronic.enabled) {
    process.exit();
}
 
var vitotronicSettings = settings.adapters.vitotronic.settings;

if (settings.ioListenPort) {
	var socket = io.connect("127.0.0.1", {
		port: settings.ioListenPort
	});
} else if (settings.ioListenPortSsl) {
	var socket = io.connect("127.0.0.1", {
		port: settings.ioListenPortSsl,
		secure: true
	});
} else {
	process.exit();
}

var telnetSocket;

connectVcontrol();

function connectVcontrol() {
	telnetSocket = net.createConnection({
		port: vitotronicSettings.config.port,
		host: vitotronicSettings.host
	}, function() {
		telnetSocket.write('dummy\n');
  	});
}

telnetSocket.on('close', function () {
    logger.info("adapter vitotronic disconnected from vcontrold");
  });

telnetSocket.on('data', function (data) {
if(data == 'vctrld>') return;
if(actual == -1) {
startPolling();
return;
}
if((""+data).substring(0,3) == 'ERR') {
	 actual++;
 if(actual < toPoll.length) {
    logger.info("Stepping because of ERR " + data);
	stepPolling();
	} else {
    logger.info("END because of ERR " + data);
	endPolling();
	}
return;
}
data = (""+data).replace('vctrld>', '');

if(vitotronicSettings.config.units[toPoll[actual].unit]) {
data = (""+data).replace(vitotronicSettings.config.units[toPoll[actual].unit].entity, '').trim();	
}
    logger.info("adapter vitotronic get data from vcontrold: " +toPoll[actual].name + ":"  + data);
if(toPoll[actual]) {
socket.emit("setObject", toPoll[actual].id, {
                Name: toPoll[actual].name,
                DPInfo: toPoll[actual].description,
                TypeName: "VARDP"
            }, function() {
                socket.emit("setState", [toPoll[actual].id, data]);
 actual++;
    logger.info("Response from set Object " + actual + " " + toPoll.length);
     if(actual < toPoll.length) {
    logger.info("callStep");
	stepPolling();
	} else {
    logger.info("callEnd");
	endPolling();
	}
            });
}
    
});

//Wird aufgerufen bei Connect zu CCU.IO
socket.on('connect', function () {
    logger.info("adapter vitotronic connected to ccu.io ");
});

//Wird aufgerufen bei disconnect zu CCU.IO
socket.on('disconnect', function () {
    logger.info("adapter vitotronic disconnected from ccu.io");
});


//Wird aufgerufen bei Änderungen von Objekten in CCU.IO. 
socket.on('event', function (obj) {
    if (!obj || !obj[0]) {
        return;
    }

    //ID des geänderten Objektes
    var id = obj[0];
    //Wert des geaenderten Objektes
    var val = obj[1];
    //Timestamp letzte Aenderung
    var ts = obj[2];
    //ACKnowledge letzte Aenderung
    var ack = obj[3];
	
    if(id >= vitotronicSettings.firstId && id < vitotronicSettings.firstId + 300) {
	logger.info("adapter vitotronic changed data");
    }
});

var toPoll = [];
var actual = -1;
commands= vitotronicSettings.config.datapoints;
Object.keys(commands).forEach(function(key) {
	var c = commands[key];
	if(c.log) {
		toPoll.push(c);
	}
});

var start = 0;
function startPolling() {
    actual = 0;
    logger.info("start Poll Data");
    start = Date.now();
    stepPolling()
}

function stepPolling() {
    logger.info("Step to "+toPoll[actual].name);
	telnetSocket.write('get' + toPoll[actual].name + '\n');
}

function endPolling() {
	
	var duration = Date.now() - start;
	var next = -1;//(1000 * vitotronicSettings.pollIntervalSec) - duration;
    logger.info("end  Poll Data");
	if(next <= 0) {
		startPolling();
	} else {
		setTimeout(startPolling, next);
		startPolling();
	}
}
