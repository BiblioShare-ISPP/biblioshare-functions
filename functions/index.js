const functions = require('firebase-functions');
var express = require('express');
const FBAuth = require('./util/fbAuth');
const FBAuthHall = require('./util/fbAuthHall');

var cors = require('cors');
var app = express();
app.use(cors({ origin: true}));


const { db } = require('./util/admin');
const config = require('./util/config');
const firebase = require('firebase');
const nodemailer = require('nodemailer');

const {
    getAllBooks,
    getAllBooksByLocation,
    postOneBook,
    getBook,
    commentOnBook,
    requestBook,
    cancelRequestBook,
    deleteBook,
    getBooksByUser,
    uploadCover,
    findBooks,
    changeToAvailable
} = require('./handlers/books');
const { 
    signup, 
    login, 
    uploadImage, 
    addUserDetails,
    getAuthenticatedUser,
    getUserDetails,
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
    addUserToHall,
    uploadHallAdd,
    uploadAdImage,
    buyAccounts,
    booksPerMember,
    uploadHallImage
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
app.post('/ad', FBAuthHall, uploadHallAdd);
app.post('/adImage', FBAuthHall, uploadAdImage);
app.post('/accounts/:accounts', FBAuthHall, buyAccounts);
app.get('/booksPerMember', FBAuthHall, booksPerMember);
app.post('/hall/image',FBAuthHall, uploadHallImage);


//Request routes
app.get('/requestsByBook/:bookId', FBAuth, requestsByBook);
app.get('/requestsByUser/:handle', FBAuth, requestsByUser);
app.get('/request/:requestId/accept', FBAuth, acceptRequest);
app.get('/request/:requestId/decline', FBAuth, declineRequest);

//Books routes
app.get('/search/:query', findBooks);
app.get('/books', getAllBooks);
app.get('/location', FBAuth, getAllBooksByLocation);
app.post('/book', FBAuth, postOneBook);
app.get('/book/:bookId', getBook);
app.delete('/book/:bookId', FBAuth, deleteBook);
app.get('/book/:bookId/request', FBAuth, requestBook);
app.get('/book/:bookId/available', FBAuth, changeToAvailable);
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

/*
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
*/
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
                    batch.update(user, {tickets: doc.data().tickets - change.after.data().price});
                }
                if(doc.id == change.after.data().bookOwner){
                    batch.update(user, {tickets: doc.data().tickets + change.after.data().price});
                }
            });
            return batch.commit();
        });
    }else return true;
});

//Se envia correo a los involucrados
exports.sendEmail = functions.region('europe-west1').firestore.document('requests/{id}')
.onUpdate(async (change) => {
    if(change.after.data().status === 'accepted'){
        let requestInfo = change.after.data();
        let ownerEmail = await db.doc(`/users/${change.after.data().bookOwner}`).get()
        .then((data) => {
            return data.data().email;
        })
        let handleEmail = await db.doc(`/users/${change.after.data().userHandle}`).get()
        .then((data) => {
            return data.data().email;
        })
        console.log(ownerEmail);
        console.log(handleEmail);
        var transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: `${config.user}`,
                pass: `${config.pass}`
            }
        });
        var mailOptionsOwner = {
            from: `${config.user}`,
            to: `${ownerEmail}`,
            subject: 'BiblioShare - Request accepted',
            html: `You have accepted the request for <b>${requestInfo.title}</b>, please contact with <b>${requestInfo.userHandle}</b> at ${handleEmail}.`
        };
        var mailOptionsHandle = {
            from: `${config.user}`,
            to: `${handleEmail}`,
            subject: 'BiblioShare - Request accepted',
            html: `Your request for <b>${requestInfo.title}</b> has been accepted, please contact with the book owner <b>${requestInfo.bookOwner}</b> at ${ownerEmail}.`
        };
        transporter.sendMail(mailOptionsOwner, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
        transporter.sendMail(mailOptionsHandle, function(error, info){
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent: ' + info.response);
            }
        });
        return true;
    }else return true;
});

//Se borran la notificación de request al cambiar de estado
exports.markNotificationsReadOnChange = functions.region('europe-west1').firestore.document('requests/{id}')
.onUpdate(async (change) => {
    if(change.before.data().status !== change.after.data().status ){
        //Se busca la notificación y se marca como leida
        let userHandle = change.before.data().userHandle;
        let bookId = change.before.data().bookId;
        const batch = db.batch();
        return db.collection('notifications').get()
        .then((data) => {
            data.forEach(doc => {
                const notification = db.doc(`/notifications/${doc.id}`);
                if((doc.data().sender === userHandle) && (doc.data().bookId === bookId)){
                    batch.delete(notification);
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
    if(change.after.data().members !== change.before.data().members){
        const array = change.after.data().members;
        const lastIndex = array.length - 1;
        let lastHandle = change.after.data().members[lastIndex];
        const batch = db.batch();
        return db.collection('users').where("handle", "==", lastHandle).get()
        .then((data) => {
            data.forEach(doc => {
                const user = db.doc(`/users/${doc.id}`);
                batch.update(user, {tickets: doc.data().tickets + 5});
            });
            return batch.commit();
        });
    }else return true
});

//Quitar usuario de member si cambia de localización
exports.removeMemberLocationChange = functions.region('europe-west1').firestore.document('/users/{userId}')
.onUpdate((change) => {
    console.log(change.before.data());
    console.log(change.after.data());
    if(change.before.data().location !== change.after.data().location){
        console.log('Location has changed');
        return db.doc(`/halls/${change.before.data().location}`).get()
        .then((data) => {
            if(data.exists){
                const arrayMembers = data.data().members;
                if(arrayMembers.includes(change.before.data().handle)){
                    arrayMembers.remove(change.before.data().handle);
                    return db.doc(`/halls/${data.data().location}`).update({
                        members: arrayMembers 
                    });
                }
            }
        });
    }else return true;
});

Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length){
        what = a[--L];
        while((ax = this.indexOf(what)) !== -1){
            this.splice(ax, 1);
        }
    }
    return this;
};