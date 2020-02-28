const functions = require('firebase-functions');
const app = require('express')();
const FBAuth = require('./util/fbAuth');

const { db } = require('./util/admin');

const {
    getAllBooks,
    postOneBook,
    getBook,
    commentOnBook,
    requestBook,
    cancelRequestBook,
    deleteBook,
    getBooksByUser
} = require('./handlers/books');
const { 
    signup, 
    login, 
    uploadImage, 
    addUserDetails,
    getAuthenticatedUser,
    getUserDetails,
    markNotificationsRead
} = require('./handlers/users');

const {
    requestsByBook,
    acceptRequest,
    declineRequest
} = require('./handlers/requests');

//Request routes
app.get('/requests/:bookId', FBAuth, requestsByBook);
//app.get('/request/:requestId/accept', FBAuth, acceptRequest);
app.get('/request/:requestId/decline', FBAuth, declineRequest);

//Books routes
app.get('/books', getAllBooks);
app.post('/book', FBAuth, postOneBook);
app.get('/book/:bookId', getBook);
app.delete('/book/:bookId', FBAuth, deleteBook);
app.get('/book/:bookId/request', FBAuth, requestBook);
app.get('/book/:bookId/cancelRequest', FBAuth, cancelRequestBook);
app.post('/book/:bookId/comment', FBAuth, commentOnBook);
app.get('/books/:handle', getBooksByUser);

//Users routes
app.post('/signup', signup);
app.post('/login', login);
app.post('/user/image',FBAuth, uploadImage);
app.post('/user', FBAuth, addUserDetails);
app.get('/user', FBAuth, getAuthenticatedUser);
app.get('/user/:handle', getUserDetails);
app.post('/notifications', FBAuth, markNotificationsRead);

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
