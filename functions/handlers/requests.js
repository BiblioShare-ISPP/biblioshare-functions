const { db } = require('../util/admin');

//Get all requests by book
exports.requestsByBook = (req, res) => {
    db.collection('requests')
    .where('bookId', '==', req.params.bookId)
    .orderBy('createdAt', 'desc')
    .get()
    .then(data => {
        let requests = [];
        data.forEach(doc => {
            requests.push({
                bookId: doc.data().bookId,
                bookOwner: doc.data().bookOwner,
                userHandle: doc.data().userHandle,
                status: doc.data().status,
                createdAt: doc.data().createdAt
            });
        });
        return res.json(requests);
    })
    .catch(err => console.error(err));
};

//Get all requests by user
exports.requestsByUser = (req, res) => {
    db.collection('requests')
    .where('bookOwner', '==', req.params.handle)
    .orderBy('createdAt', 'desc')
    .get()
    .then(data => {
        let requests = [];
        data.forEach(doc => {
            requests.push({
                bookId: doc.data().bookId,
                bookOwner: doc.data().bookOwner,
                userHandle: doc.data().userHandle,
                status: doc.data().status,
                createdAt: doc.data().createdAt
            });
        });
        return res.json(requests);
    })
    .catch(err => {
        console.error(err);
    });
};

//Accept request
exports.acceptRequest = (req, res) => {
    db.doc(`/requests/${req.params.requestId}`).get()
    .then(doc => {
        if(!doc.exists){
            return res.status(404).json({ error: 'Request not found'});
        }
        if(doc.status !== "pending"){
            return res.status(409).json({ error: 'You can only accept pending requests'});
        }
        return doc.ref.update({ status: "accepted"});
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({ error: 'Something went wrong'});
    });
};

//Decline request
exports.declineRequest = (req, res) => {
    db.doc(`/requests/${req.params.requestId}`).get()
    .then(doc => {
        if(!doc.exists){
            return res.status(404).json({ error: 'Request not found'});
        }
        if(doc.status !== "pending"){
            return res.status(409).json({ error: 'You can only decline pending requests'});
        }
        return doc.ref.update({ status: "declined"});
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({ error: 'Something went wrong'});
    });
};