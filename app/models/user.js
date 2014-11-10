var db = require('../config');
var Promise = require('bluebird');
var bcrypt = Promise.promisifyAll(require('bcrypt'));
var Link = require('./link');

var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: true,
  links: function(){
    return this.hasMany(Link)
  },
  initialize: function() {
    this.on('creating', function (model, attrs, options) {
      if (model.get('password')) {
        return bcrypt.genSaltAsync(10).then(function (salt) {
          return bcrypt.hashAsync(model.get('password'), salt)
        }).then(function (hash) {
          return model.set('password', hash);
          //return model.save();
        }).then(function(user){
          console.log(user.get('username'), user.get('password'));
          return user;
        }).catch(function(err){
          throw err;
        });
      }
    });
  }
});

module.exports = User;