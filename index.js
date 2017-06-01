require('colors');

fs = require('fs');
yaml = require('js-yaml')
_ = require('lodash')
var debug = require('debug')('app-config')
log = console.log;

var config = require('./config.js')

module.exports = {
  config: config,
  read: config.read,
  validate: config.validate,
  regex: {
    string: /(string|str|s)/,
    object: /(object|obj|o)/,
    float: /(float|fl|f)/,
    integer: /(integer|int|i)/,
    boolean: /(b|bool|boolean)/,
  }
}

// this gets called by matrix cli sometimes, lets not turn on debug for no reason
if (process.argv[2] === 'test' && process.argv[1].indexOf('matrix-app-config-helper') !== -1) {
  process.env['DEBUG'] = "*";
  console.log(require('util').inspect(config.validate(config.read(process.argv[3])), { depth: null }));
}

// var msg;
// var info = JSON.parse(require('fs').readFileSync(__dirname + '/package.json'));
// var currentVersion = info.version;
// require('https').get(
//   'https://raw.githubusercontent.com/matrix-io/matrix-app-config-helper/master/package.json',
//   function(res) {
//     var write = "";
//     res.on('data', function(c) {
//       write += c;
//     });
//     res.on('end', function(e) {
//       var remoteVersion = JSON.parse(write).version;
//       var msg = "";
//       if (currentVersion === remoteVersion) {
//         module.exports.current = true;
//         msg = '(current)'.grey;
//       } else {
//         module.exports.current = false;
//         msg = '(can upgrade to '.yellow + remoteVersion + ')'.yellow
//       }
//       debug('📐  [ MATRIX ] App Config Helper v'.green + currentVersion.grey, msg)
//     });
//   }).on('error', function(e) {
//   console.error('Upgrade Check Error: ', e)
// })