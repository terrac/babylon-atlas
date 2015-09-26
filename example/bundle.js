(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/* global BABYLON */


// set up standard sort of scene
var vec3 = BABYLON.Vector3
var cv = document.getElementById('canvas')
var engine = new BABYLON.Engine(cv)
var scene =  new BABYLON.Scene(engine)
scene.clearColor = new BABYLON.Color3(0.8, 0.85, 0.9)
var camera = new BABYLON.ArcRotateCamera('camera', -1, 1.2, 6, new vec3(0,1,0), scene)
var light = new BABYLON.HemisphericLight('light', new vec3(0.1,1,0.3), scene )
camera.attachControl(cv)
var plane = BABYLON.Mesh.CreateGround('ground', 5, 5, 1, scene)


// atlas constructor
var createAtlas = require('../')

// make an atlas for a given image+JSON
var myAtlas = createAtlas('sprites.png', 'sprites.json', scene, BABYLON)
window.atlas = myAtlas

var mesh = myAtlas.makeSpriteMesh()
mesh.position.y = 1.2
mesh.scaling.x = 1.5
mesh.scaling.y = 2


// in this demo sprites need full alpha - not true of all textures
mesh.material.opacityTexture = mesh.material.diffuseTexture


// cycle through frames
var num = 0
setInterval(function() {
  if (!myAtlas.frames.length) return // json not loaded yet
  num = (num+1) % myAtlas.frames.length
  
  myAtlas.setMeshFrame(mesh, myAtlas.frames[num])
  // or just: myAtlas.setMeshFrame(mesh, num)
}, 500)



// make a second and third mesh from the same atlas
var mesh2 = myAtlas.makeSpriteMesh( 'sprites instance 10003' )
mesh2.position.y = 1.2
mesh2.position.z = 1
mesh2.position.x = 1

var mesh3 = BABYLON.Mesh.CreatePlane('m3', 1, scene)
mesh3.material = new BABYLON.StandardMaterial('mat', scene)
mesh3.material.specularColor = new BABYLON.Color3(0,0,0)
mesh3.material.emissiveColor = new BABYLON.Color3(1,1,1)
mesh3.material.backFaceCulling = false
mesh3.material.diffuseTexture = myAtlas.getTexture('sprites2 instance 10002')

mesh3.position.y = .8
mesh3.position.z = -1
mesh3.position.x = -1



// render the scene
function render() {
  scene.render()
  requestAnimationFrame(render)
}
render()


},{"../":2}],2:[function(require,module,exports){
/* global BABYLON */

module.exports = Atlas

var loader = require('load-json-xhr')




// Atlas constructor - keeps the json data and a base texture

function Atlas(imgURL, jsonURL, scene, BAB, noMip, sampling) {
  if (!(this instanceof Atlas)) {
    return new Atlas(imgURL, jsonURL, scene, BAB, noMip, sampling)
  }

  this._ready = false
  this._scene = scene
  this._BABYLON = BAB
  this._data = null
  this._texcache = {}

  this.frames = []

  var dataReady = false
  var texReady = false
  var self = this

  // json loader and event
  loader(jsonURL, function(err, data) {
    if (err) throw err
    self._data = data
    dataReady = true
    if (texReady) initSelf(self);
  })

  // texture loader and event
  this._baseTexture = new BAB.Texture(imgURL, scene, noMip, true, sampling, function() {
    texReady = true
    if (dataReady) initSelf(self);
  })

  // atlas will almost always need alpha
  this._baseTexture.hasAlpha = true
}

// called once json + image are both loaded
/* Expects json like:
      {"frames":{
        "frame_001": {"frame": {"x":0, "y":32,"w":22,"h":18} },
        "frame_002": {"frame": {"x":53,"y":0, "w":22,"h":21} }
      }}
*/
function initSelf(self) {
  for (var s in self._data.frames) {
    self.frames.push(s)
  }
  self._ready = true
}


// Get a texture with the right uv settings for a given frame

Atlas.prototype.getTexture = function(frame) {
  if (this._texcache[frame]) return this._texcache[frame]
  
  var tex = this._baseTexture.clone()
  setTextureSettings(this, frame, tex)
  this._texcache[frame] = tex
  return tex
}


// set an existing texture's offsets etc.
Atlas.prototype.setTextureToFrame = function(tex, frame) {
  setTextureSettings(this, frame, tex)
}



Atlas.prototype.makeSpriteMesh = function(frame, material) {
  var BAB = this._BABYLON
  if (!frame)    frame = 0
  
  // make a material unless one was passed in
  if (!material) {
    material = new BAB.StandardMaterial('spriteMat', this._scene)
    material.specularColor = new BAB.Color3(0,0,0)
    material.emissiveColor = new BAB.Color3(1,1,1)
    material.backFaceCulling = false
  }

  // plane mesh and setup
  var mesh = this._BABYLON.Mesh.CreatePlane('atlas sprite', 1, this._scene)
  mesh.material = material
  material.diffuseTexture = this._baseTexture.clone()
  // decoration property used by this module
  mesh._currentAtlasFrame = null

  setFrame(this, mesh, frame)
  return mesh
}


// public accessor
Atlas.prototype.setMeshFrame = function(mesh, frame) {
  setFrame(this, mesh, frame)
}




// Set a mesh's texture to show a given frame of the altas.
// Also decorates mesh object with property to track current atlas frame

function setFrame(self, mesh, frame) {
  if (frame === mesh._currentAtlasFrame) return

  setTextureSettings(self, frame, mesh.material.diffuseTexture)

  mesh._currentAtlasFrame = frame
}


// function where the main magic is
// defers own call if json/texture data is still loading

function setTextureSettings(self, frame, tex) {
  if (!self._ready) {
    setTimeout(function() { setTextureSettings(self, frame, tex) }, 10)
    return
  }
  
  var framestr = (typeof frame === 'number') ? self.frames[frame] : frame
  var dat = self._data.frames[framestr]
  if (!dat) {
    throw new Error('babylon-atlas: frame "'+framestr+'" not found in atlas')
  }
  
  var size = self._baseTexture.getSize()
  var w = dat.frame.w
  var h = dat.frame.h
  var x = dat.frame.x
  var y = dat.frame.y
  var sw = size.width
  var sh = size.height

  // in Babylon 2.2 and below:
  // tex.uScale = w/sw
  // tex.vScale = h/sh
  // tex.uOffset = ( sw /2 - x)/w - 0.5
  // tex.vOffset = (-sh/2 + y)/h + 0.5
  
  // Babylon 2.3 and above:
  tex.uScale =   w / sw
  tex.vScale =   h / sh
  tex.uOffset =  x / sw
  tex.vOffset =  (sh-y-h)/sh
}



// dispose method - disposes babylon objects

Atlas.prototype.dispose = function() {
  this._baseTexture.dispose()
  this._data = null
  this._scene = null
  this._BABYLON = null
  this.frames.length = 0  
  this._texcache.length = 0
}



},{"load-json-xhr":3}],3:[function(require,module,exports){
var xhr = require("xhr");

module.exports = function getJSON(opt, cb) {
  cb = typeof cb === 'function' ? cb : noop;

  if (typeof opt === 'string')
    opt = { uri: opt };
  else if (!opt)
    opt = { };

  // if (!opt.headers)
  //   opt.headers = { "Content-Type": "application/json" };

  var jsonResponse = /^json$/i.test(opt.responseType);
  return xhr(opt, function(err, res, body) {
    if (err)
      return cb(err);
    if (!/^2/.test(res.statusCode))
      return cb(new Error('http status code: ' + res.statusCode));

    if (jsonResponse) { 
      cb(null, body);
    } else {
      var data;
      try {
        data = JSON.parse(body);
      } catch (e) {
        cb(new Error('cannot parse json: ' + e));
      }
      if(data) cb(null, data);
    }
  })
}

function noop() {}
},{"xhr":4}],4:[function(require,module,exports){
"use strict";
var window = require("global/window")
var once = require("once")
var parseHeaders = require("parse-headers")


var XHR = window.XMLHttpRequest || noop
var XDR = "withCredentials" in (new XHR()) ? XHR : window.XDomainRequest

module.exports = createXHR

function createXHR(options, callback) {
    function readystatechange() {
        if (xhr.readyState === 4) {
            loadFunc()
        }
    }

    function getBody() {
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = undefined

        if (xhr.response) {
            body = xhr.response
        } else if (xhr.responseType === "text" || !xhr.responseType) {
            body = xhr.responseText || xhr.responseXML
        }

        if (isJson) {
            try {
                body = JSON.parse(body)
            } catch (e) {}
        }

        return body
    }
    
    var failureResponse = {
                body: undefined,
                headers: {},
                statusCode: 0,
                method: method,
                url: uri,
                rawRequest: xhr
            }
    
    function errorFunc(evt) {
        clearTimeout(timeoutTimer)
        if(!(evt instanceof Error)){
            evt = new Error("" + (evt || "unknown") )
        }
        evt.statusCode = 0
        callback(evt, failureResponse)
    }

    // will load the data & process the response in a special response object
    function loadFunc() {
        clearTimeout(timeoutTimer)
        
        var status = (xhr.status === 1223 ? 204 : xhr.status)
        var response = failureResponse
        var err = null
        
        if (status !== 0){
            response = {
                body: getBody(),
                statusCode: status,
                method: method,
                headers: {},
                url: uri,
                rawRequest: xhr
            }
            if(xhr.getAllResponseHeaders){ //remember xhr can in fact be XDR for CORS in IE
                response.headers = parseHeaders(xhr.getAllResponseHeaders())
            }
        } else {
            err = new Error("Internal XMLHttpRequest Error")
        }
        callback(err, response, response.body)
        
    }
    
    if (typeof options === "string") {
        options = { uri: options }
    }

    options = options || {}
    if(typeof callback === "undefined"){
        throw new Error("callback argument missing")
    }
    callback = once(callback)

    var xhr = options.xhr || null

    if (!xhr) {
        if (options.cors || options.useXDR) {
            xhr = new XDR()
        }else{
            xhr = new XHR()
        }
    }

    var key
    var uri = xhr.url = options.uri || options.url
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var timeoutTimer

    if ("json" in options) {
        isJson = true
        headers["Accept"] || (headers["Accept"] = "application/json") //Don't override existing accept header declared by user
        if (method !== "GET" && method !== "HEAD") {
            headers["Content-Type"] = "application/json"
            body = JSON.stringify(options.json)
        }
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = loadFunc
    xhr.onerror = errorFunc
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    xhr.ontimeout = errorFunc
    xhr.open(method, uri, !sync)
    //has to be after open
    xhr.withCredentials = !!options.withCredentials
    
    // Cannot set timeout with sync request
    // not setting timeout on the xhr object, because of old webkits etc. not handling that correctly
    // both npm's request and jquery 1.x use this kind of timeout, so this is being consistent
    if (!sync && options.timeout > 0 ) {
        timeoutTimer = setTimeout(function(){
            xhr.abort("timeout");
        }, options.timeout+2 );
    }

    if (xhr.setRequestHeader) {
        for(key in headers){
            if(headers.hasOwnProperty(key)){
                xhr.setRequestHeader(key, headers[key])
            }
        }
    } else if (options.headers) {
        throw new Error("Headers cannot be set on an XDomainRequest object")
    }

    if ("responseType" in options) {
        xhr.responseType = options.responseType
    }
    
    if ("beforeSend" in options && 
        typeof options.beforeSend === "function"
    ) {
        options.beforeSend(xhr)
    }

    xhr.send(body)

    return xhr


}


function noop() {}

},{"global/window":5,"once":6,"parse-headers":10}],5:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],6:[function(require,module,exports){
module.exports = once

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })
})

function once (fn) {
  var called = false
  return function () {
    if (called) return
    called = true
    return fn.apply(this, arguments)
  }
}

},{}],7:[function(require,module,exports){
var isFunction = require('is-function')

module.exports = forEach

var toString = Object.prototype.toString
var hasOwnProperty = Object.prototype.hasOwnProperty

function forEach(list, iterator, context) {
    if (!isFunction(iterator)) {
        throw new TypeError('iterator must be a function')
    }

    if (arguments.length < 3) {
        context = this
    }
    
    if (toString.call(list) === '[object Array]')
        forEachArray(list, iterator, context)
    else if (typeof list === 'string')
        forEachString(list, iterator, context)
    else
        forEachObject(list, iterator, context)
}

function forEachArray(array, iterator, context) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            iterator.call(context, array[i], i, array)
        }
    }
}

function forEachString(string, iterator, context) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        iterator.call(context, string.charAt(i), i, string)
    }
}

function forEachObject(object, iterator, context) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            iterator.call(context, object[k], k, object)
        }
    }
}

},{"is-function":8}],8:[function(require,module,exports){
module.exports = isFunction

var toString = Object.prototype.toString

function isFunction (fn) {
  var string = toString.call(fn)
  return string === '[object Function]' ||
    (typeof fn === 'function' && string !== '[object RegExp]') ||
    (typeof window !== 'undefined' &&
     // IE8 and below
     (fn === window.setTimeout ||
      fn === window.alert ||
      fn === window.confirm ||
      fn === window.prompt))
};

},{}],9:[function(require,module,exports){

exports = module.exports = trim;

function trim(str){
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  return str.replace(/\s*$/, '');
};

},{}],10:[function(require,module,exports){
var trim = require('trim')
  , forEach = require('for-each')
  , isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    }

module.exports = function (headers) {
  if (!headers)
    return {}

  var result = {}

  forEach(
      trim(headers).split('\n')
    , function (row) {
        var index = row.indexOf(':')
          , key = trim(row.slice(0, index)).toLowerCase()
          , value = trim(row.slice(index + 1))

        if (typeof(result[key]) === 'undefined') {
          result[key] = value
        } else if (isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [ result[key], value ]
        }
      }
  )

  return result
}
},{"for-each":7,"trim":9}]},{},[1]);
