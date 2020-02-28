const { admin, db } = require('../util/admin');

const config = require('../util/config');

const { validateBookData } = require('../util/validators');

//Get all books
exports.getAllBooks = (req, res) => {
    db.collection('books')
    .orderBy('userPostDate', 'desc')
    .get()
    .then(data => {
        let books = [];
        data.forEach(doc => {
            books.push({
                bookId: doc.id,
                author: doc.data().author,
                cover: doc.data().cover,
                title: doc.data().title,
                userPostDate: doc.data().userPostDate,
                owner: doc.data().owner,
                ownerImage: doc.data().ownerImage,
                location: doc.data().location
            });
        });
        return res.json(books);
    })
    .catch(err => console.error(err));
};

//Post a book
exports.postOneBook = (req, res) =>{
    const newBook = {
        author: req.body.author,
        cover: req.body.cover,
        title: req.body.title,
        userPostDate: new Date().toISOString(),
        owner: req.user.handle,
        location: (req.user.location == null) ? "" : req.user.location,
        ownerImage: req.user.imageUrl,
        requestCount: 0,
        commentCount: 0
    };

    const { valid, errors } = validateBookData(newBook);

    if(!valid) return res.status(400).json(errors);

    db
    .collection('books')
    .add(newBook)
    .then((doc) => {
        const resBook = newBook;
        resBook.bookId = doc.id;
        res.json(resBook);
    })
    .catch((err) => {
        res.status(500).json({error: 'something went wrong'});
        console.error(err);
    });
};

//Fetch a book
exports.getBook = (req, res) =>{
    let bookData = {};
    db.doc(`/books/${req.params.bookId}`).get()
    .then((doc) => {
        if(!doc.exists){
            return res.status(404).json({ error: 'Book not found'})
        }
        bookData = doc.data();
        bookData.bookId = doc.id;
        return db.collection('comments').orderBy('createdAt', 'desc').where('bookId', '==', req.params.bookId).get();
    })
    .then((data) => {
        bookData.comments = [];
        data.forEach((doc) => {
            bookData.comments.push(doc.data())
        });
        return res.json(bookData);
    })
    .catch((err) => {
        console.error(err);
        res.status(500).json({ error: err.code})
    });
};

//Comment on a book
exports.commentOnBook = (req, res)=>{
    if(req.body.body.trim() === '') return res.status(400).json({ comment: 'Comment must not be empty'});

    const newComment = {
        body: req.body.body,
        createdAt: new Date().toISOString(),
        bookId: req.params.bookId,
        userHandle: req.user.handle,
        userImage: req.user.imageUrl
    };

    db.doc(`/books/${req.params.bookId}`).get()
    .then(doc => {
        if(!doc.exists){
            return res.status(404).json({ error: 'Book not found'});
        }
        return doc.ref.update({ commentCount: doc.data().commentCount + 1});
    })
    .then(() => {
        return db.collection('comments').add(newComment);
    })
    .then(() => {
        res.json(newComment);
    })
    .catch(err => {
        console.log(err);
        res.status(500).json({ error: 'Something went wrong'});
    })
};

//Request a book
exports.requestBook = (req, res) =>{
    const requestDocument = db.collection('requests').where('userHandle', '==', req.user.handle)
    .where('bookId', '==', req.params.bookId).limit(1);

    const bookDocument = db.doc(`/books/${req.params.bookId}`);

    let bookData;

    bookDocument.get()
    .then(doc => {
        if(doc.exists){
            bookData = doc.data();
            bookData.bookId = doc.id;
            return requestDocument.get();
        }else{
            return res.status(404).json({ error: 'Book not found'});
        }
    })
    .then(data => {
        if(data.empty){
            return db.collection('requests').add({
                bookId: req.params.bookId,
                bookOwner: bookData.owner,
                userHandle: req.user.handle,
                status: "pending",
                createdAt: new Date().toISOString()
            })
            .then(()=> {
                bookData.requestCount++;
                return bookDocument.update({ requestCount: bookData.requestCount })
            })
            .then(() => {
                return res.json(bookData);
            });
        } else {
            return res.status(400).json({ error: 'Book already requested'});
        }
    })
    .catch(err => {
        console.error(err);
        res.status(500).json({ error: err.code});
    })
};

//Cancel a book request
exports.cancelRequestBook = (req, res) => {
    const requestDocument = db.collection('requests').where('userHandle', '==', req.user.handle)
    .where('bookId', '==', req.params.bookId).limit(1);

    const bookDocument = db.doc(`/books/${req.params.bookId}`);

    let bookData;

    bookDocument.get()
    .then(doc => {
        if(doc.exists){
            bookData = doc.data();
            bookData.bookId = doc.id;
            return requestDocument.get();
        }else{
            return res.status(404).json({ error: 'Book not found'});
        }
    })
    .then(data => {
        if(data.empty){
            return res.status(400).json({ error: 'Book not requested'});
        } else {
            return db.doc(`/requests/${data.docs[0].id}`).delete()
            .then(()=>{
                bookData.requestCount--;
                return bookDocument.update({ requestCount: bookData.requestCount});
            })
            .then(()=>{
                res.json(bookData);
            })
        }
    })
    .catch(err => {
        console.error(err);
        res.status(500).json({ error: err.code});
    })
};

//Delete a book
exports.deleteBook = (req, res) => {
    const document = db.doc(`/books/${req.params.bookId}`);
    document.get()
    .then((doc) => {
        if(!doc.exists){
            return res.status(404).json({ error: 'Book not found'});
        }
        if(doc.data().owner !== req.user.handle){
            return res.status(403).json({ error: 'Unauthorized'});
        }else{
            return document.delete();
        }
    })
    .then(() => {
        res.json({ message: 'Book deleted successfully'});
    })
    .catch(err => {
        console.error(err);
        return res.status(500).json({ error: err.code});
    });
};

//Get all books posted by user
exports.getBooksByUser = (req, res) => {
    db.collection('books')
    .where('owner', '==', req.params.handle)
    .orderBy('userPostDate', 'desc')
    .get()
    .then(data => {
        let books = [];
        data.forEach(doc => {
            books.push({
                bookId: doc.id,
                author: doc.data().author,
                cover: doc.data().cover,
                title: doc.data().title,
                userPostDate: doc.data().userPostDate,
                owner: doc.data().owner,
                ownerImage: doc.data().ownerImage,
                location: doc.data().location
            });
        });
        return res.json(books);
    })
    .catch(err => console.error(err));
};

// TODO
exports.postFromISBN = (req, res) => {
    const newBook = {
        author: req.body.author,
        cover: imageUrl,
        title: req.body.title,
        userPostDate: new Date().toISOString(),
        owner: req.user.handle,
        location: (req.user.location == null) ? "" : req.user.location,
        ownerImage: req.user.imageUrl,
        requestCount: 0,
        commentCount: 0
    };

    const { valid, errors } = validateBookData(newBook);

    if(!valid) return res.status(400).json(errors);

    db
    .collection('books')
    .add(newBook)
    .then((doc) => {
        const resBook = newBook;
        resBook.bookId = doc.id;
        res.json(resBook);
    })
    .catch((err) => {
        res.status(500).json({error: 'something went wrong'});
        console.error(err);
    });
};
