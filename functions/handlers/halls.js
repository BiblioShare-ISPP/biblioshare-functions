const { db } = require('../util/admin');

const firebase = require('firebase');
const config = require('../util/config');

const { validateSignupDataHall, validateLoginData  } = require('../util/validators');

//Sign up
exports.hallSignup = (req, res) => {
    const newHall ={
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        location: req.body.location,
        accounts: 200
    };
     
    const { valid, errors } = validateSignupDataHall(newHall);

    if(!valid) return res.status(400).json(errors);

    const noImg = 'no-image.png';

    let token, userId;
    db.doc(`/halls/${newHall.location}`).get()
    .then(doc =>{
        if(doc.exists){
            return res.status(400).json({ location: 'There is a hall for this location already'});
        } else{
           return firebase.auth().createUserWithEmailAndPassword(newHall.email, newHall.password)
        }
    })
    .then(data => {
        hallId = data.user.uid;
        return data.user.getIdToken();
    })
    .then(idToken => {
        token = idToken;
        const hallCredentials = {
            email: newHall.email,
            createdAt: new Date().toISOString(),
            imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
            accounts: newHall.accounts,
            location: newHall.location,
            members: [],
            hallId
        };
        return db.doc(`/halls/${newHall.location}`).set(hallCredentials);
    })
    .then(() => {
        return res.status(201).json({token});
    })
    .catch(err => {
        console.error(err);
        if(err.code === 'auth/email-already-in-use'){
            return res.status(400).json({ email: 'Email is already in use'});
        }else if(err.code === 'auth/weak-password'){
          return res.status(400).json({ password: err.message});
        }else{
            return res.status(500).json({ general: 'Something went wrong, please try again'});
        }
    });
};

//Log in
exports.hallLogin = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    const { valid, errors } = validateLoginData(user);
    if(!valid) return res.status(400).json(errors);

    db.collection('halls').get()
    .then((data) => {
        let result = false;
        data.forEach((hall) => {
            if(hall.data().email === user.email){
                result = true;
            }
        })
        return result;
    })
    .then((result) => {
        if(result){
            firebase.auth().signInWithEmailAndPassword(user.email, user.password)
            .then(data => {
                return data.user.getIdToken();
            })
            .then(token => {
                return res.json({token});
            })
            .catch(err => {
                console.error(err);
                return res.status(403).json({ general: 'Wrong credentials, please try again'});
            });
        }else{
            return res.status(403).json({ general: 'There is not a hall with this email'});
        }
    });
};

//Get own hall details
exports.getAuthenticatedHall = (req, res) => {
    let hallData = {};
    db.doc(`/halls/${req.hall.location}`).get()
    .then(doc => {
      if(doc.exists){
        hallData.credentials = doc.data();
      }else{
        return res.status(403).json({ error: 'Hall not found'});
      }
    })
    .then(() => {
        return res.json(hallData);
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code});
    });
};

//Get city residents
exports.getUsersByLocation = (req, res) => {
    let location = req.params.location;
    console.log(location)
    let handles = db.collection('users').get()
    .then(data => {
        let results = [];
        data.forEach(doc =>{
            if(doc.data().location.toLowerCase() === location.toLowerCase()){
                results.push(doc.data().handle);
            }
        })
        return results;
    })
    .then(users => {
        return res.json(users);
    })
};