const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const model = require('./model');
const db = require('./dbHelpers');
const connection = require('./db-mysql');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const keys = require('../public/config.js');
const fileUpload = require('express-fileupload');
const app = express();
const cloudinary = require('cloudinary');
cloudinary.config({
  cloud_name: 'dsl0njnpb',
  api_key: '699437861478522',
  api_secret: 'jLZRElTaxWs30ckTcPwwGQ_rFCU'
});

const path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
//Google cloud vision setup:
const gVision = require('./api/vision.js');
var localStorage = {};

app.use( bodyParser.json() );
app.use(cors());
app.use(express.static(__dirname + '/../public/dist'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(fileUpload());

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('cookie-parser')());
app.use(require('express-session')({
  secret: process.env.SESSION_SECRET || 'thisCouldBeAnything',
  resave: true,
  saveUninitialized: true
}));

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});


passport.use(new FacebookStrategy({
  clientID: process.env.FB_CLIENT_ID || '178117606038161',
  clientSecret: process.env.FB_CLIENT_SECRET || '46b97d04d73253dcbcb443a6b3741ccb',
  callbackURL: '/auth/facebook/callback',
  profileFields: ['name', 'email','id','picture'],
},

  function(accessToken, refreshToken, profile, cb) {
    process.nextTick(function () {
      let userInfo = {
        name: profile._json.first_name + " " + profile._json.last_name,
        fb_id: profile._json.id,
        token: accessToken,
        email: profile._json.email,
        picture: profile._json.picture.data.url
      };

      console.log('====================== user name', profile._json, '-----type of', typeof profile)
      console.log(')))((((((()))))))', userInfo)

      localStorage.user.picture = userInfo.picture;
      localStorage.user.email = userInfo.email;

      db.createNewUser(userInfo);
      return cb(null, userInfo);
    });
  }
));

// route middleware to make sure a user is logged in
checkAuthentication = (req, res, next) => {
  if (req.isAuthenticated()) {
    //if user is loged in, req.isAuthenticated() will return true
    next();
  } else {
    res.redirect('/login');
  }
};

authHelper = (req, res, next) => {
  localStorage.isAuthenitcated = req.isAuthenticated();
  localStorage.user = req.user || {};
  next();
};

// route for facebook authentication and login
app.get('/auth/facebook',
  passport.authenticate('facebook', { scope: ['email']}));

// handle the callback after facebook has authenticated the user
app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  });

// // test database functions
// app.get('/', db.getAllUsers);
app.get('/newUser', db.createNewUser);
app.get('/newTrip', db.createNewTrip);
app.get('/addMembersToTrip', db.addMembersToTrip);
app.get('/addReceipt', db.addReceipt);
app.get('/storeItems', db.storeReceiptItems);
// app.get('/assignItems', db.assignItemsToMembers);

app.get('/getUsersFromFacebook', function(req, res) {
    console.log('received req');
    db.getUsersFromFacebook( function(err, results){
      if(err) {
        res.sendStatus(500);
      } else {
        res.send(results);
      }
    })
});
app.get('/login', authHelper, (req, res) => {
  console.log('wtf1--==\n\n\n\n');
  if (req.isAuthenticated()) {
    res.redirect('/');
  } else {
    res.sendFile(path.resolve(__dirname, '..', 'public', 'dist', 'index.html'));
  }
});

app.get('/logout', authHelper, function(req, res) {
  req.logout();
  res.redirect('/');
});

app.get('/verify', authHelper, function(req, res) {
  let userInfo = {
    isAuthenitcated: localStorage.isAuthenitcated,
    name: localStorage.user.name,
    fb_id: localStorage.user.fb_id,
    picture: localStorage.user.picture,
    email: localStorage.user.email
  };
  res.send(userInfo);
});

app.get('/recent', (req, res) => {
  console.log('hi test');
  db.getRecent(res);
  // console.log(db.getReceiptsAndTrips());
  // .then( (results) => {
  //   res.send(results);
  // });
});

app.get('*', checkAuthentication, authHelper, (req, res) => {
  console.log('wtf=======\n\n\n\n\n\n\n');
  if (!req.user) {
    res.redirect('/login');
  } else {
    // res.sendFile(path.resolve(__dirname, '..', 'public', 'dist', 'index.html'));
  }
});

//To be used for testing and seeing requests
//
app.post('/createTripName', function(req, res) {
  //With the received request, use model function to submit the tripname to the database

  let params = [
    req.body.submittedTripName,
    localStorage.user.name,
    req.body.submittedTripDesc,
    localStorage.user.fb_id
  ];

  db.createNewTrip(params);
  res.redirect('/upload-receipt');
});

let uploadCloud = () => {
  cloudinary.uploader.upload(__dirname + '/temp/filename.jpg', function(data) {
  });
};
app.post('/upload', function(req, res) {
  if (!req.files) {
    return res.status(400).send('No files were uploaded.');
  }
  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  let sampleFile = req.files.sampleFile;
  // console.log(sampleFile);
  // Use the mv() method to place the file somewhere on your server
  sampleFile.mv(__dirname + '/temp/filename.jpg', function(err) {
    if (err) {
      return res.status(500).send(err);
    }
    let image = __dirname + '/temp/filename.jpg';
    gVision.promisifiedDetectText(image)
    .then(function(results) {
      let allItems = results[0];
      // uploadCloud();
      res.send(gVision.spliceReceipt(allItems.split('\n')));
    })
    .error(function(e) {
      console.log('Error received in appPost, promisifiedDetectText:', e);
    });
  });
});


app.post('/upload/delete', function(req, res) {
  //req.body should include receipt name, total, receipt_link;
  //should be a delete query
});

app.post('/summary', (req, res) => {
  db.createMemberSummary(req.body);
});

// this will duplicate with Duy's /recent


//gVision.spliceReceipt produces an object of item : price pairs
app.post('/vision', function(req, res) {
  let testNumber = 4;
  let image = req.body.receipt || __dirname + `/api/testReceipts/test${testNumber}.jpg`;
  gVision.promisifiedDetectText(image)
  .then(function(results) {
    let allItems = results[0];
    fs.writeFileAsync(`server/api/testResults/test${testNumber}.js`, JSON.stringify(gVision.spliceReceipt(allItems.split('\n'))));
    res.send(gVision.spliceReceipt(allItems.split('\n')));
    // console.log('Successfully created /test.js with:', gVision.spliceReceipt(allItems.split('\n')));
  })
  .error(function(e) {
    console.log('Error received in appPost, promisifiedDetectText:', e);
  });
});



const port = process.env.PORT || 5000;
app.listen(port, function() {
  console.log(`Listening on ${port}`);
});