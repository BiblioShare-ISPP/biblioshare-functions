const { admin, db } = require('../util/admin');

const config = require('../util/config');

const firebase = require('firebase');
firebase.initializeApp(config);

const { validateSignupData, validateLoginData, reduceUserDetails } = require('../util/validators')

//Sign up
exports.signup = (req, res) => {
    const newUser ={
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        handle: req.body.handle,
        location: req.body.location,
        tickets: 100
    };
     
    const { valid, errors } = validateSignupData(newUser);

    if(!valid) return res.status(400).json(errors);

    const noImg = 'no-image.png';

    let token, userId;
    db.doc(`/users/${newUser.handle}`).get()
    .then(doc =>{
        if(doc.exists){
            return res.status(400).json({ handle: 'this handle is already taken'});
        } else{
           return firebase.auth().createUserWithEmailAndPassword(newUser.email, newUser.password)
        }
    })
    .then(data => {
        userId = data.user.uid;
        return data.user.getIdToken();
    })
    .then(idToken => {
        token = idToken;
        const userCredentials = {
            handle: newUser.handle,
            email: newUser.email,
            createdAt: new Date().toISOString(),
            imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
            tickets: newUser.tickets,
            location: newUser.location,
            userId
        };
        return db.doc(`/users/${newUser.handle}`).set(userCredentials);
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
exports.login = (req, res) => {
    const user = {
        email: req.body.email,
        password: req.body.password
    }

    const { valid, errors } = validateLoginData(user);
    if(!valid) return res.status(400).json(errors);

    db.collection('users').get()
    .then((data) => {
      let result = false;
      data.forEach((us) => {
        if(us.data().email === user.email){
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
        return res.status(403).json({ general: 'There is not a user account with this email'});
      }
    });
};

//Add user details
exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);
  console.log(userDetails)
  db.doc(`/users/${req.user.handle}`).update(userDetails)
  .then(() => {
    return res.json(userDetails);
  })
  .catch(err => {
    console.error(err);
    return res.status(500).json({error: err.code})
  });
};

//Get any user's details
exports.getUserDetails = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.handle}`).get()
  .then((doc) => {
    if(doc.exists){
      userData.user = doc.data();
      return db.collection('books').where('owner', '==', req.params.handle)
      .orderBy('userPostDate', 'desc')
      .get();
    }else{
      return res.status(404).json({ error: 'User not found'});
    }
  })
  .then((data) => {
    userData.books = [];
    data.forEach((doc) => {
      userData.books.push({
        author: doc.data().author,
        commentCount: doc.data().commentCount,
        cover: doc.data().cover,
        owner: doc.data().owner,
        ownerImage: doc.data().ownerImage,
        requestCount: doc.data().requestCount,
        title: doc.data().title,
        userPostDate: doc.data().userPostDate,
        availability: doc.data().availability,
        location: doc.data().location,
        bookId: doc.id
      });
    });
    return res.json(userData);
  })
  .catch((err) => {
    console.error(err);
    return res.status(500).json({ error: err.code });
  });
};

//Get own user details
exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.handle}`).get()
  .then(doc => {
    if(doc.exists){
      userData.credentials = doc.data();
      userData.isHallMember = false;
      db.doc(`/halls/${doc.data().location}`).get()
      .then((docHall) => {
        if(docHall.exists){
          if(docHall.data().members.includes(userData.credentials.handle)){
            userData.isHallMember = true;
            userData.hallImage = docHall.data().imageUrl;
            userData.description = docHall.data().description;
            userData.image = docHall.data().image;
          }
        }
      })
      
      return db.collection('requests').where('userHandle', '==', req.user.handle).get()
    }
  })
  .then(data => {
    userData.requests = [];
    data.forEach(doc => {
      userData.requests.push(doc.data());
    });
    return db.collection('notifications').where('recipient', '==', req.user.handle)
    .orderBy('createdAt', 'desc').limit(10).get();
  })
  .then(data => {
    userData.notifications = [];
    data.forEach(doc => {
      userData.notifications.push({
        recipient: doc.data().recipient,
        sender: doc.data().sender,
        read: doc.data().read,
        createdAt: doc.data().createdAt,
        type: doc.data().type,
        notificationId: doc.id
      })
    });
    return res.json(userData);
  })
  .catch(err => {
    console.error(err);
    return res.status(500).json({ error: err.code});
  });
};

// /functions npm install --save busboy
// Upload a profile image for user
exports.uploadImage = (req, res) => {
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');
  
    const busboy = new BusBoy({ headers: req.headers });
  
    let imageToBeUploaded = {};
    let imageFileName;
  
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
      console.log(fieldname, file, filename, encoding, mimetype);
      if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
        return res.status(400).json({ error: 'Wrong file type submitted' });
      }
      // my.image.png => ['my', 'image', 'png']
      const imageExtension = filename.split('.')[filename.split('.').length - 1];
      // 32756238461724837.png
      imageFileName = `${Math.round(
        Math.random() * 1000000000000
      ).toString()}.${imageExtension}`;
      const filepath = path.join(os.tmpdir(), imageFileName);
      imageToBeUploaded = { filepath, mimetype };
      file.pipe(fs.createWriteStream(filepath));
    });
    busboy.on('finish', () => {
      admin
        .storage()
        .bucket(`${config.storageBucket}`)
        .upload(imageToBeUploaded.filepath, {
          resumable: false,
          metadata: {
            metadata: {
              contentType: imageToBeUploaded.mimetype
            }
          }
        })
        .then(() => {
          const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${
            config.storageBucket
          }/o/${imageFileName}?alt=media`;
          return db.doc(`/users/${req.user.handle}`).update({ imageUrl });
        })
        .then(() => {
          const image = `https://firebasestorage.googleapis.com/v0/b/${
            config.storageBucket
          }/o/${imageFileName}?alt=media`;
          return res.json({ imageUrl: image });
        })
        .catch((err) => {
          console.error(err);
          return res.status(500).json({ error: 'something went wrong' });
        });
    });
    busboy.end(req.rawBody);
};

exports.markNotificationsRead = (req, res) =>{
  let batch = db.batch();
  req.body.forEach(notificationId => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true});
  });
  batch.commit()
  .then(()=>{
    return res.json({message: 'Notifications marked read'});
  })
  .catch(err => {
    console.error(err);
    return res.status(500).json({ error: err.code});
  });
};

exports.buyTickets = (req, res) => {
  db.doc(`/users/${req.params.handle}`).get()
  .then((doc) => {
    if(doc.exists){
      let total = parseInt(doc.data().tickets) + parseInt(req.params.tickets)
      doc.ref.update({ tickets: total })
    }else{
      return res.status(404).json({ error: 'User not found'});
    }
  })
  .then(() => {
    return res.status(200).json("Compra realizada con éxito");
  });
};