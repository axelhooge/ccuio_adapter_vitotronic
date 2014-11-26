/* Includes */
var fs          = require('fs');
var settings    = require(__dirname + '/../../settings.js');
var xml2js      = 	require("xml2js");

var arguments = process.argv.splice(2);
if (arguments.length) {
} else {
    process.exit(-1);
}
/* Classes */
function Dpoint() {
	this.access = 0;
	this.name = '';
	this.description = '';
	this.unit = '';
}
Dpoint.READ = 1;
Dpoint.WRITE = 2;
function Unit() {
	this.abbrev = '';
	this.name = '';
	this.type = '';
	this.entity = '';
}
/* Commands aus vito.xml */
var datapoints = {};
/* units aus vcontrold.xml */
var units = {};
/* Port auf dem vcontrold läuft */
var port = 0;
/* Pfad zur XML Datei */
var path = arguments[0];

fs.readFile(path + 'vcontrold.xml', function (err, data) {
    if(err) {
        process.send("Pfad nicht korrekt oder lesbar!");
        process.exit(-1);
    }
    var options = {
        explicitArray: false,
        mergeAttrs: true
    };
    var parser = new xml2js.Parser(options);
    parser.parseString(data, function (err, result) {
        if(err) {
            process.send("Konnte vcontrold.xml nicht parsen!");
            process.exit(-1);
        }

        port = result["V-Control"].unix.config.net.port;

        var xmlunits = result["V-Control"].units.unit;
        for (var i = 0; i < xmlunits.length; i++) {
            var u = xmlunits[i];

            var unit = new Unit();

            unit.name = u.name;
            unit.abbrev = u.abbrev;
            unit.type = u.type;
            unit.entity = u.entity;
            units[u.abbrev] = unit;	
        }

        getVito();
    }); 
});

function getVito() {
    fs.readFile(path + 'vito.xml', function (err, data) {
	if(err) {
            process.send("Pfad nicht korrekt oder lesbar!");
            process.exit(-1);
	}
	var options = {
            explicitArray: false,
            mergeAttrs: true
	};
	var parser = new xml2js.Parser(options);
	parser.parseString(data, function (err, result) {
            if(err) {
                process.send("Konnte XML nicht parsen!");
                process.exit(-1);
            }
            var commands = result.vito.commands.command;
            for (var i = 0; i < commands.length; i++) {
                var c = commands[i];
                if(c.name.substring(0,3) != 'get' && c.name.substring(0,3) != 'set') {
                    continue;
                } 
                var name = c.name.substring(3);
                var unit = typeof c.unit == 'undefined' ? '' : c.unit;
                if(name.length == 0) continue;

                if(typeof(datapoints[name]) == 'undefined') {
                    var dp = new Dpoint();
                    dp.id = settings.adapters.vitotronic.settings.firstId + i;
                    dp.name = name;
                    dp.description = c.description;
                    dp.unit = unit;
                    datapoints[name] = dp;	
                }

                if(c.protocmd == 'getaddr') {
                    datapoints[name].access |= Dpoint.READ;
                } else {
                    datapoints[name].access |= Dpoint.WRITE;
                }

            }

            process.send({datapoints:datapoints, units:units, port:port});
            process.exit();
	});
    });
}