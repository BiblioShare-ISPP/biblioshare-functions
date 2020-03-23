const { admin, db} = require('./admin');

module.exports = (req, res, next) => {
    let idToken;
    if(req.headers.authorization && req.headers.authorization.startsWith('Hall ')){
        idToken = req.headers.authorization.split('Hall ')[1];
    } else {
        console.error('No token found');
        return res.status(403).json({ error: 'Unauthorized'});
    }

    admin.auth().verifyIdToken(idToken)
    .then(decodedToken => {
        req.hall = decodedToken;
        console.log(decodedToken);
        return db.collection('halls')
        .where('hallId', '==', req.hall.uid)
        .limit(1)
        .get();
    })
    .then(data => {
        req.hall.location = data.docs[0].data().location;
        req.hall.imageUrl = data.docs[0].data().imageUrl;
        req.hall.accounts = data.docs[0].data().accounts;
        req.hall.members = data.docs[0].data().members;
        return next();
    })
    .catch(err => {
        console.error('Error while verifying token', err);
        return res.status(403).json(err);
    })
    
};