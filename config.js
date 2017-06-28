var util = require('./helpers.js');
var _ = require('lodash')

var dl = require('debug')
dl.log = console.log.bind(console);
var debug = new dl('config-helper')


var dataTypeRegex = /^(string|str|s|object|obj|o|float|fl|f|integer|int|i|b|bool|boolean)$/;
var dataTypeKeyRegex = /^([a-z0-9_]+)$/i; //Case insensitive alphanumeric and _
var stringRegex = /^(string|str|s)$/;
var objectRegex = /^(object|obj|o)$/;
var floatRegex = /^(float|fl|f)$/;
var integerRegex = /^(integer|int|i)$/;
var booleanRegex = /^(b|bool|boolean)$/;

var sensorRegex = /^(mic|temperature|gyroscope|magnetometer|humidity|altitude|microphone|camera|pressure|accelerometer|compass|uv)$/;

module.exports = {
  /**
   * Creates a schema string for bigquery
   * @param {String}  key dataType key from config
   * @param {String} format what type of data is it?
   * @return {String} "key:format"
   */
  encodeQueryString: function(key, format) {
    var suffix = ':';

    if (format.match(/^(b|bool|boolean)$/)) {
      suffix += 'boolean'
    } else if (format.match(/^(i|int|integer)$/)) {
      suffix += 'integer'
    } else if (format.match(/^(f|fl|float)$/)) {
      suffix += 'float'
    } else if (format.match(/^(s|str|string)$/)) {
      suffix += 'string';
    } else {
      console.error(key, 'has an invalid format', format);
    }

    return key + suffix;
  },
  parsePolicyFromConfig: function(config) {
    // get rid of non config related info
    var write = {};
    var s = _.pick(config, ['sensors', 'integrations', 'services', 'events']);
    _.each(s, function(items, title) {
      write[title] = {};
      if (!Array.isArray(items)) { //Fix for inner json in services
        //BUG: There will be collisions if different services have the same type name
        items = _.map(items, 'type');
      }
      console.log(title.grey, ':', items.join(' '));
      _.each(items, function(item) {
        write[title][item] = false;
      })
    })

    return write;
  },
  read: function(fileName) {
    fileName = fileName || 'config.yaml';
    var config;
    try {
      config = yaml.safeLoad(fs.readFileSync(fileName));
    } catch (e) {
      console.error('Config Read Error')
    }

    return config;
  },

  validate: validate

}

// Validates keys and values matching their corresponding RegExps
function validateDataTypeStructure(root) {
  var result = true;

  if (_.isObject(root)) { // If it has nested values go over those
    _.each(root, function(value, key) {
      debug('Checking key: ', key);
      if (!key.toString().match(dataTypeKeyRegex)) {
        console.error('Invalid key: ', key, ' Data types must only be named using letters, numbers and "_".');
        result = false;
      }
      if (!validateDataTypeStructure(root[key], key, value)) {
        result = false; //Recurse to check values, if any nested match fails, update result
      }
    });
  } else {
    debug('Checking value: ', root);
    if (!root.toString().match(dataTypeRegex)) {
      console.error('Invalid value: ', root, ' Please provide a valid data type.');
      result = false;
    }
  }

  return result;
}


function validate(config) {
  debug('validate');
  try {
    var reqKeys = ['name', 'configVersion', 'description'];
    var errorKeys = [];
    _.each(reqKeys, function(k) {
      if (!_.has(config, k)) {
        errorKeys.push(k);
      }
    })
    if (errorKeys.length > 0) {
      throw new Error('configuration has no '.red + errorKeys.join(', '))
    }

    debug('Name:', config.name);
    debug('Desc:', config.description);
    debug('Version:', config.configVersion);
    debug('Keywords:', config.keywords);
    //some apps just don't make data
    if (_.has(config, 'dataTypes')) {
      if (_.isArray(config.dataTypes) ||  _.isString(config.dataTypes)) {
        throw new Error('dataTypes can not be a string nor an array.');
      }

      debug('DataTypes:', config.dataTypes);
      if (!validateDataTypeStructure(config.dataTypes)) {
        // bail on bad data type
        throw new Error('Invalid Data Type');
      }

      function standardizeValue(input) {
        var out = (!_.isNull(input.match(stringRegex))) ? 'string' :
          (!_.isNull(input.match(integerRegex))) ? 'integer' :
          (!_.isNull(input.match(booleanRegex))) ? 'boolean' :
          (!_.isNull(input.match(floatRegex))) ? 'float' : 'null'
        if (out === 'null') {
          throw new Error('Invalid Data Type Format', input);
        }
        return out;
      }

      config.schemaStrings = {};

      // populate schema string for bq
      _.each(config.dataTypes, function(value, key) {

        // In case of dataTypes: 
        //              foo: integer
        // => { foo: "foo:integer" }
        if (_.isString(value)) {
          config.schemaStrings[key] = key + ':' + standardizeValue(value);
        } else {
          // standard use
          config.schemaStrings[key] = _.map(value, function(format, name) {
            return name + ':' + format;
          }).join(',')
        }
      });

    }

    // debug(config.widgets);
    // check that all screens are widgets
    if (_.has(config, 'widgets')) {
      debug('Validating Widgets');

      var Widget = require('./Widget.js');

      // check widgets for things
      _.forIn(config.widgets, function(w, name) {
        debug('Widget ' + name + ': ');
        new Widget(name, w);
      })

      if (_.has(config, 'screens')) {

        var widgetList = Object.keys(config.widgets);

        var screens = module.exports.screens = config.screens || {};
        var widgets = module.exports.widgets = config.widgets || {};
        var services = module.exports.services = config.services || {};
        var filters = module.exports.filters = config.filters || {};

        module.exports.serviceNames = Object.keys(services);
        module.exports.filterNames = Object.keys(filters);
        module.exports.widgetNames = Object.keys(widgets);
        module.exports.screenNames = Object.keys(screens);

        var screenWidgetList = module.exports.screenWidgetList = _.flatten(_.map(screens, function(v, k) {
          return _.flattenDeep(v);
        }));
        //
        // debug(screenWidgetList);
        var widgetDiff = _.difference(screenWidgetList, widgetList);
        // debug(widgetDiff)
        if (widgetDiff.length > 0) {
          throw new Error('Screens Missing Widget Definition: ' + widgetDiff.join(', '))
        }

      }
    }

    //#end widget block

    if (_.has(config, 'services')) {
      _.each(config.services, function(s) {
        if (_.has(s, 'engine')) {
          // standardize zone to zones
          if (_.has(s, 'engineParams.zone')) {
            s.engineParams.zones = s.engineParams.zones || []
            s.engineParams.zones.push(s.engineParams.zone);
          }
          // check for misspelling
          if(!_.has(s, 'type') && s.engine !== 'voice'){
            throw new Error('Service type required on config.yaml! Please check for misspelling! ', s);
          }

          // add voice default
          if ( s.engine === 'voice' && s.phrase !== 'matrix'){
            s.phrase === 'matrix';
          }
        }
      })
    }

    if (_.has(config, 'sensors')) {
      _.each(config.sensors, function(s, i) {
        if (_.isNull(s.match(sensorRegex))) {
          console.warn(s, 'is not a proper sensor');
          config.sensors = _.without(config.sensors, s);
        }
      })
    }

    config.validated = true;
    debug('=========== CONFIG VALIDATE ============='.blue)

    return config;

  } catch (e) {
    console.error('Config Validation Error', e.message);
    debug(e.stack);
    return false;
  }
}