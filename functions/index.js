const functions = require('firebase-functions');
const app = require('express')();
const FBAuth = require('./util/fbAuth');
const FBAuthHall = require('./util/fbAuthHall');

const cors = require('cors');
app.use(cors({ origin: true }));

const { db } = require('./util/admin');

const firebase = require('firebase');

const {
    getAllBooks,
    postOneBook,
    getBook,
    commentOnBook,
    requestBook,
    cancelRequestBook,
    deleteBook,
    getBooksByUser,
    uploadCover,
    findBooks
} = require('./handlers/books');
const { 
    signup, 
    login, 
    uploadImage, 
    addUserDetails,
    getAuthenticatedUser,
    getUserDetails,
    markNotificationsRead,
    buyTickets
} = require('./handlers/users');

const {
    requestsByBook,
    requestsByUser,
    acceptRequest,
    declineRequest
} = require('./handlers/requests');

const {
    hallSignup,
    hallLogin,
    getAuthenticatedHall,
    getUsersByLocation,
    addUserToHall
} = require('./handlers/halls');

const {
    getAllOffers
} = require('./handlers/offers');

//Offers routes
app.get('/offers', getAllOffers);

//Hall routes
app.post('/hall/signup', hallSignup);
app.post('/hall/login', hallLogin);
app.get('/hall', FBAuthHall, getAuthenticatedHall);
app.get('/users/:location', getUsersByLocation);
app.post('/hall/:location/:handle', FBAuthHall, addUserToHall);

//Request routes
app.get('/requestsByBook/:bookId', FBAuth, requestsByBook);
app.get('/requestsByUser/:handle', FBAuth, requestsByUser);
app.get('/request/:requestId/accept', FBAuth, acceptRequest);
app.get('/request/:requestId/decline', FBAuth, declineRequest);

//Books routes
app.get('/search/:query', findBooks);
app.get('/books', getAllBooks);
app.post('/book', FBAuth, postOneBook);
app.get('/book/:bookId', getBook);
app.delete('/book/:bookId', FBAuth, deleteBook);
app.get('/book/:bookId/request', FBAuth, requestBook);
app.get('/book/:bookId/cancelRequest', FBAuth, cancelRequestBook);
app.post('/book/:bookId/comment', FBAuth, commentOnBook);
app.get('/books/:handle', getBooksByUser);
app.post('/book/image', FBAuth, uploadCover);

//Users routes
app.post('/signup', signup);
app.post('/login', login);
app.post('/user/image',FBAuth, uploadImage);
app.post('/user', FBAuth, addUserDetails);
app.get('/user', FBAuth, getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.post('/notifications', FBAuth, markNotificationsRead);
app.post('/user/:handle/:tickets', FBAuth, buyTickets);

exports.api = functions.region('europe-west1').https.onRequest(app);

//Notifications
exports.createNotificationOnRequest = functions.region('europe-west1').firestore.document('requests/{id}')
    .onCreate((snapshot) => {
        return db.doc(`/books/${snapshot.data().bookId}`).get()
            .then((doc) => {
                if(doc.exists && doc.data().userHandle !== snapshot.data().userHandle){
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createdAt: new Date().toISOString(),
                        recipient: doc.data().owner,
                        sender: snapshot.data().userHandle,
                        type: 'request',
                        read: false,
                        bookId: doc.id
                    });
                }
            })
            .catch(err => console.error(err));

});

exports.deleteNotificationOnCancelRequest = functions.region('europe-west1').firestore.document('requests/{id}')
.onDelete((snapshot) => {
    return db.doc(`/notifications/${snapshot.id}`)
    .delete()
    .catch(err => {
        console.error(err);
        return;
    });

});

exports.createNotificationOnComment = functions.region('europe-west1').firestore.document('comments/{id}')
.onCreate((snapshot) => {
    return db.doc(`/books/${snapshot.data().bookId}`).get()
    .then((doc) => {
        if(doc.exists && doc.data().userHandle !== snapshot.data().userHandle){
            return db.doc(`/notifications/${snapshot.id}`).set({
                createdAt: new Date().toISOString(),
                recipient: doc.data().owner,
                sender: snapshot.data().userHandle,
                type: 'comment',
                read: false,
                bookId: doc.id
            });
        }
    })
    .catch(err => {
        console.error(err);
        return;
    });
});

exports.onUserImageChange = functions.region('europe-west1').firestore.document('/users/{userId}')
.onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());
    if(change.before.data().imageUrl !== change.after.data().imageUrl){
        console.log('image has changed');
        const batch = db.batch();
        return db.collection('books').where('owner', '==',change.before.data().handle).get()
        .then((data) => {
            data.forEach(doc => {
                const book = db.doc(`/books/${doc.id}`);
                batch.update(book, { ownerImage: change.after.data().imageUrl});
            });
            return batch.commit();
        });
    }else return true;
});

exports.onUserLocationChange = functions.region('europe-west1').firestore.document('/users/{userId}')
.onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());
    if(change.before.data().location !== change.after.data().location){
        console.log('Location has changed');
        const batch = db.batch();
        return db.collection('books').where('owner', '==',change.before.data().handle).get()
        .then((data) => {
            data.forEach(doc => {
                const book = db.doc(`/books/${doc.id}`);
                batch.update(book, { location: change.after.data().location});
            });
            return batch.commit();
        });
    }else return true;
});

exports.onBookDelete = functions.region('europe-west1').firestore.document('/books/{bookId}')
.onDelete((snapshot, context) => {
    const bookId = context.params.bookId;
    const batch = db.batch();
    return db.collection('comments').where('bookId', '==', bookId).get()
    .then((data) => {
        data.forEach((doc) => {
            batch.delete(db.doc(`/comments/${doc.id}`));
        })
        return db.collection('requests').where('bookId', '==', bookId).get();
    })
    .then((data) => {
        data.forEach((doc) => {
            batch.delete(db.doc(`/requests/${doc.id}`));
        })
        return db.collection('notification').where('bookId', '==', bookId).get();
    })
    .then((data) => {
        data.forEach((doc) => {
            batch.delete(db.doc(`/notifications/${doc.id}`));
        })
        return batch.commit();
    })
    .catch((err) => console.error(err));
});

//Se rechazan las otras peticiones
exports.onAcceptRequest = functions.region('europe-west1').firestore.document('requests/{id}')
.onUpdate((change) => {
    if(change.after.data().status === 'accepted'){
        const batch = db.batch();
        return db.collection('requests').where('bookId', '==',change.before.data().bookId).where('status', '==', 'pending').get()
        .then((data) => {
            data.forEach(doc => {
                const requests = db.doc(`/requests/${doc.id}`);
                batch.update(requests, { status: 'rejected'});
            });
            return batch.commit();
        });
    }else return true;
});

//El libro pasa a prestado
exports.changeBookStatus = functions.region('europe-west1').firestore.document('requests/{id}')
.onUpdate((change) => {
    if(change.after.data().status === 'accepted'){
        const batch = db.batch();
        return db.collection('books').get()
        .then((data) => {
            data.forEach(doc => {
                const book = db.doc(`/books/${doc.id}`);
                if(doc.id === change.after.data().bookId){
                    batch.update(book, {availability: 'provided'});
                }
            });
            return batch.commit();
        });
    }else return true;
});

//Quitar el ticket
exports.exchangeTickets = functions.region('europe-west1').firestore.document('requests/{id}')
.onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());
    if(change.after.data().status === 'accepted'){
        let users = [];
        users.push(change.after.data().bookOwner);
        users.push(change.after.data().userHandle);
        const batch = db.batch();
        return db.collection('users').where("handle", "in", users).get()
        .then((data) => {
            data.forEach(doc => {
                const user = db.doc(`/users/${doc.id}`);
                if(doc.id == change.after.data().userHandle){
                    batch.update(user, {tickets: doc.data().tickets - 1});
                }
                if(doc.id == change.after.data().bookOwner){
                    batch.update(user, {tickets: doc.data().tickets + 1});
                }
            });
            return batch.commit();
        });
    }else return true;
});


//---------------- HALLS --------------------
//Dar cuentas a un usuario una vez añadido al ayuntamiento
exports.ticketsToNewUser = functions.region('europe-west1').firestore.document('halls/{location}')
.onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());
    if(change.after.data().members !== change.before.data().members){
        let arrayLenght = change.after.data().members.lenght();
        let lastHandle = change.after.data().members[arrayLenght];

        const batch = db.batch();
        return db.collection('users').where("handle", "===", lastHandle).get()
        .then((data) => {
            data.forEach(doc => {
                const user = db.doc(`/users/${doc.id}`);
                batch.update(user, {tickets: doc.data().tickets + 5});
            });
            return batch.commit();
        });
    }else return true
});