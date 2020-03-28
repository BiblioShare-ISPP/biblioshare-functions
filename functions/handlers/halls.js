const { admin, db } = require('../util/admin');

const firebase = require('firebase');
const config = require('../util/config');

const { validateSignupDataHall, validateLoginData, validateAddDetails } = require('../util/validators');

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
            description: 'Anuncio',
            image: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/AdImage.png?alt=media`,
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
    let results = [];
    let handles = db.collection('users').get()
    .then(data => {
        data.forEach(doc =>{
            if(doc.data().location.toLowerCase() === location.toLowerCase()){
                results.push({
                    handle: doc.data().handle,
                    imageUrl: doc.data().imageUrl
                });
            }
        })
        return results;
    })
    .then(users => {
        return res.json(users);
    })
};

//Add a user to a hall
exports.addUserToHall = (req, res) => {
    let handle = req.params.handle;
    let location = req.params.location;
    //Añadir a miembro
    db.doc(`/halls/${location}`).get()
    .then((data) => {
        let hallDataBefore = data.data();
        hallDataBefore.members.push(handle);
        hallDataBefore.accounts = hallDataBefore.accounts- 1;
        data.ref.update(hallDataBefore);
        return hallDataBefore;
    })
    .then((result) => {
        return res.status(200).json(result);
    })
    .catch((error) => {
        console.error(error);
    });    
};


//Subida de anuncio
exports.uploadHallAdd = (req, res) => { 
    const location = req.hall.location;
    const newAdd ={
        description: req.body.description,
        image: req.body.image
    };
    
    const { valid, errors } = validateAddDetails(newAdd);

    if(!valid) return res.status(400).json(errors);

    db.doc(`/halls/${location}`).update(newAdd)
    .then(() => {
      return res.json(newAdd);
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({error: err.code})
    });
};


// Upload a image for hall ad
exports.uploadAdImage = (req, res) => {
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
          const image = `https://firebasestorage.googleapis.com/v0/b/${
            config.storageBucket
          }/o/${imageFileName}?alt=media`;
          return res.json({image: image});
        })
        .catch((err) => {
          console.error(err);
          return res.status(500).json({ error: 'something went wrong' });
        });
    });
    busboy.end(req.rawBody);
};

//Buy accounts
exports.buyAccounts = (req, res) => {
    db.doc(`/halls/${req.hall.location}`).get()
    .then((doc) => {
      if(doc.exists){
        let total = parseInt(doc.data().accounts) + parseInt(req.params.accounts)
        doc.ref.update({ accounts: total })
      }else{
        return res.status(404).json({ error: 'Hall not found'});
      }
    })
    .then(() => {
      return res.status(200).json("Compra realizada con éxito");
    });
};

//Update hall profile image
exports.uploadHallImage = (req, res) => {
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
        return db.doc(`/halls/${req.hall.location}`).update({ imageUrl });
      })
      .then(() => {
        return res.json({ message: 'image uploaded successfully' });
      })
      .catch((err) => {
        console.error(err);
        return res.status(500).json({ error: 'something went wrong' });
      });
  });
  busboy.end(req.rawBody);
};

//Number of books by member
exports.booksPerMember = async (req, res) => {
  const members = req.hall.members;
  const doc = await db.doc(`/halls/${req.hall.location}`).get();

  if (!doc) console.err('No existe la referencia indicada');

    let stats = [];

    for (const member of members) {
      const snap = await db.collection('/books').where('owner', '==', member).get();

      if (!snap) {
        console.err('Otro error con la descripción que quieras');
        continue;
      }
      
      stats = [...stats, { user: member, books: snap.size }]; 
    }
    return res.json(stats);
};