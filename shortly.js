var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var Promise = require('bluebird');
var bcrypt = Promise.promisifyAll(require('bcrypt'), {
  filter: function(name){
    console.log(name, name.slice(-4));
    if (name.slice(-4) === 'Sync'){
      return false;
    }
  }
});
var cookieParser = require('cookie-parser');
var session = require('express-session');
var morgan = require('morgan');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

var sess = {
  secret: '9cB&y89ZgBmjUCQ8kY>B',
  cookie: {}
};

if (app.get('env') === 'production'){
  app.set('trust proxy', 1);
  sess.cookie = {secure: true};
}

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.use(morgan('dev'));
app.use(session(sess));
app.use(partials());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname + '/public'));

var checkUser = function(req, res, next){
  if (req.session.user){
    next();
  } else {
    req.session.error = 'Access Denied';
    res.redirect('/login');
  }
};

app.get('/',
function(req, res) {
  if(req.session && req.session.user) {
    res.render('index');
  } else {
    res.redirect('/login');
  }
});

app.get('/create', checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links', checkUser,
function(req, res) {
  new User({id: req.session.user.id})
      .fetch({require: true})
      .then(function(user){
        return user.links().fetch();
      })
      .then(function(links){
        res.send(200, links.models);
      })
      .catch(function(err){
        throw err;
      });
});

app.post('/links', checkUser,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri, user_id: req.session.user.id }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin,
          user_id: req.session.user.id
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/login', function(req, res){
  res.render('login', {error: req.session.error || ''});
});

app.post('/login', function(req, res){
  var username = req.body.username;
  var password = req.body.password;

  if (!req.body.username || !req.body.password){
    throw new Error('Both username and password are required');
  }

  new User({username: username.toLowerCase().trim()})
      .fetch({require: true})
      .tap(function(user){
        return bcrypt
            .compareAsync(password, user.get('password'));
      })
      .then(function(user) {
        req.session.user = user.omit('password');
        req.session.save();
        res.redirect('/');
      })
      .catch(function(err){
        req.session.error = 'Invalid username or password';
        res.redirect('/login');
      });
});


app.get('/signup', function(req, res){
  res.render('signup', {error: req.session.error || ''});
});

app.post('/signup', function (req, res){
  var username = req.body.username;
  var password = req.body.password;

  if (!req.body.username || !req.body.password){
    throw new Error('Both username and password are required');
  }

  new User({username: username.toLowerCase().trim()})
      .fetch({require: true})
      .then(function(){
        req.session.error = 'Username already exists';
        res.redirect('/signup');
      })
      .catch(function(){
        new User({username: username, password: password})
            .save()
            .then(function(user){
              req.session.user = user.omit('password');
              req.session.save();
              res.redirect('/');
            })
            .catch(function(err){
              throw err;
            });
      });
});

app.get('/signout', function(req, res){
  req.session.destroy(function(){
    res.redirect('/');
  });
});
/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
module.exports = app;