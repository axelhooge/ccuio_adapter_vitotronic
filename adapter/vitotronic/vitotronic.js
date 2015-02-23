/* Includes */
var settings    = require(__dirname + '/../../settings.js');
var logger      = require(__dirname+'/../../logger.js');
var net         = require('net');
var io          = require('socket.io-client');

/* Settings für diesen Adapter */
var vitotronicSettings = settings.adapters.vitotronic.settings;
/* Alle commands aus der vcontrold Konfiguration */
var commands= vitotronicSettings.config.datapoints;
/* Alle commands, die geloggt werdne sollen */
var toPoll = [];
/* Index aus toPoll Array des aktuell abzufragenden commands */
var actual = -1;
/* Hilfsreferenz */
var commandMap = {};
/* Verbindung zu vcontrold */
var telnetSocket;
/* Log Mode */
var log = vitotronicSettings.log;
/* Buffer für Schreib-Commands */
var writeBuffer = [];

if (!settings.adapters.vitotronic || !settings.adapters.vitotronic.enabled) {
    process.exit();
}
 
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

connectVcontrol();
function connectVcontrol() {
    telnetSocket = net.createConnection({
        port: vitotronicSettings.config.port,
        host: vitotronicSettings.host
    }, function() {
        // Erste Eingabe führt immer zu einem Fehler
        telnetSocket.write('dummy\n');
    });
}
telnetSocket.on('close', function () {
    myLog("adapter vitotronic disconnected from vcontrold");
});

telnetSocket.on('data', function (data) {
    // Eingabeaufforderung von vcontrold können wir ignorieren
    if(data == 'vctrld>') return;

    if(actual == -1 || (""+data).substring(0,3) == 'ERR') {
       
        if(actual != -1) {
            toPoll[actual].lastPoll = Date.now();
            myLog("vcontrold send error: " +toPoll[actual].name + ":"  + data);
        } else {
            myLog("vcontrol send message: " + data);
        }
        stepPolling();
        return;
    }
    
    data = (""+data).replace('vctrld>', '');
    
    // Einheit (z.B. "Grad Celcius") aus der Antwort entfernen
    if(vitotronicSettings.config.units[toPoll[actual].unit]) {
        data = (""+data).replace(vitotronicSettings.config.units[toPoll[actual].unit].entity, '').trim();	
    }
    
    myLog("adapter vitotronic get data from vcontrold: " +toPoll[actual].name + ":"  + data);
    
    // Wert in ccu.io speichern
    if(toPoll[actual]) {    
        socket.emit("setObject", toPoll[actual].id, {
            Name: toPoll[actual].name,
            DPInfo: toPoll[actual].description,
            TypeName: "VARDP"
        }, function() {
            toPoll[actual].value = data;
            toPoll[actual].lastPoll = Date.now();
            socket.emit("setState", [toPoll[actual].id, data]);
            stepPolling();
        });
    }       
    
});

//Wird aufgerufen bei Connect zu CCU.IO
socket.on('connect', function () {
    myLog("adapter vitotronic connected to ccu.io ");
});
//Wird aufgerufen bei disconnect zu CCU.IO
socket.on('disconnect', function () {
    myLog("adapter vitotronic disconnected from ccu.io");
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
        if(typeof(commands[commandMap[id]]) != 'undefined' && val != commands[commandMap[id]].value) {
            if(commands[commandMap[id]].access & 2) {
                var cmd = 'set' + commands[commandMap[id]].name + ' ' + val;
                myLog('getting set command: ' + cmd);
                writeBuffer.push(cmd);
            } else {
                myLog("adapter vitotronic changed NOT WRITEABLE data " + commandMap[id] + " " + val + " " + commands[commandMap[id]].value);
            }
        }
    }
});

/* zu loggende commands ermitteln */
Object.keys(commands).forEach(function(key) {
    var c = commands[key];
    commandMap[c.id] = key;
    if(c.pollInterval > -1) {
        toPoll.push(c);
    }
});

/* Nächsten Wert zum Loggen holen */
function stepPolling() {
    actual = -1;
    if(writeBuffer.length > 0) {
        var cmd = writeBuffer.shift();
        myLog('calling set command '+cmd);
        
        telnetSocket.write(cmd+"\n");
        return;
    }
    
    var actualMinWaitTime = 1000000;
    var time = Date.now();

    for(var i = 0; i < toPoll.length; i++) {
        if(typeof(toPoll[i].lastPoll) == 'undefined') {
            toPoll[i].lastPoll = 0;
        }
        
        var nextRun = toPoll[i].lastPoll + (toPoll[i].pollInterval * 1000)
        var nextDiff = nextRun - time;

        if(time < nextRun) {
            actualMinWaitTime = nextDiff;
            continue;
        }
        
        if(nextDiff < actualMinWaitTime) {
            actualMinWaitTime = nextDiff;
            actual = i;
        }
    }
    
    if(actual === -1) {
        setTimeout(function () {
            stepPolling();
        }, actualMinWaitTime);

    } else {
	myLog("Step to "+toPoll[actual].name);
        telnetSocket.write('get' + toPoll[actual].name + '\n');
    }
}

function myLog(message) {
    if(log) {
        logger.info(message);
    }
}