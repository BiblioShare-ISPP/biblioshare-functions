const { admin, db } = require('../util/admin');

const config = require('../util/config');

const { validateBookData } = require('../util/validators');

//Find books
exports.findBooks = (req, res) => {
    let query = req.params.query;
    var stringSimilarity = require('string-similarity');

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
                price: doc.data().price,
                title: doc.data().title,
                userPostDate: doc.data().userPostDate,
                owner: doc.data().owner,
                ownerImage: doc.data().ownerImage,
                location: doc.data().location,
                availability: doc.data().availability
            });
        });

        let results = [];
        console.log(req.params.query);
        books.forEach(book => {
            var distanceTitle = 0;
            var distanceAuthor = 0;
            var total = 0;
            var queryArray = query.toLowerCase().split(/(\s+)/);
            var titleArray = book.title.toLowerCase().split(/(\s+)/);
            var authorArray = book.author.toLowerCase().split(/(\s+)/);
            for(var i = 0; i < queryArray.length; i++){
                for(var j = 0; j < titleArray.length; j++){
                    var auxDistanceTitle = stringSimilarity.compareTwoStrings(queryArray[i], titleArray[j]);
                    distanceTitle = auxDistanceTitle > distanceTitle ? auxDistanceTitle : distanceTitle;
                }
                for(var j = 0; j < authorArray.length; j++){
                    var auxDistanceAuthor = stringSimilarity.compareTwoStrings(queryArray[i], authorArray[j]);
                    distanceAuthor = auxDistanceAuthor > distanceAuthor ? auxDistanceAuthor : distanceAuthor;
                }
            }
            total = distanceTitle > distanceAuthor ? distanceTitle : distanceAuthor;
            results.push({
                book: book,
                distance: total
            });
        });
        results.sort(function(a, b){
            return b.distance - a.distance;
        });
        
        let filteredResults = [];
        results.forEach(book => {
            if(book.distance > 0.4){
                filteredResults.push(
                    book.book
                )
            }
        });
        return res.json(filteredResults);
    })
    .catch(err => console.error(err));
};

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
                price: doc.data().price,
                title: doc.data().title,
                userPostDate: doc.data().userPostDate,
                owner: doc.data().owner,
                ownerImage: doc.data().ownerImage,
                location: doc.data().location,
                availability: doc.data().availability
            });
        });
        return res.json(books);
    })
    .catch(err => console.error(err));
};

//Get all books by user location
exports.getAllBooksByLocation = (req, res) => {
    db.collection('books')
    .where('location', '==', req.user.location)
    .orderBy('userPostDate', 'desc')
    .get()
    .then(data => {
        let books = [];
        data.forEach(doc => {
            books.push({
                bookId: doc.id,
                author: doc.data().author,
                cover: doc.data().cover,
                price: doc.data().price,
                title: doc.data().title,
                userPostDate: doc.data().userPostDate,
                owner: doc.data().owner,
                ownerImage: doc.data().ownerImage,
                location: doc.data().location,
                availability: doc.data().availability
            });
        });
        return res.json(books);
    })
    .catch(err => console.error(err));
};

//Post a book
exports.postOneBook = async(req, res) =>{
    console.log(req.body);
    const newBook = {
        author: req.body.author,
        cover: req.body.cover,
        title: req.body.title,
        price: 1,
        userPostDate: new Date().toISOString(),
        owner: req.user.handle,
        geo: req.user.geo,
        location: (req.user.location == null) ? "" : req.user.location,
        ownerImage: req.user.imageUrl,
        requestCount: 0,
        commentCount: 0,
        availability: "available"
    };

    if(newBook.cover.trim() === ''){
        newBook.cover = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/no-cover.jpg?alt=media`;
    }

    const { valid, errors } = validateBookData(newBook);

    if(!valid) return res.status(400).json(errors);

    const Url = 'https://www.googleapis.com/books/v1/volumes?q='+newBook.title+'&country=US';
    await fetch(Url)
    .then(async function(data){
        return await data.json();
    })
    .then((res)=>{
        console.log(res);
        var publishedDate = 1900;
        console.log("Total items:" + res.totalItems);
        if(res.totalItems > 0){
            console.log("Items length:" + res.items.length);
            if(res.items.length > 0){
                publishedDate = res.items[0].volumeInfo.publishedDate.substring(0, 4);
            }else{
                publishedDate = 1900;
            } 
        }else{
            publishedDate = 1900;
        }
        console.log(publishedDate);
        return publishedDate;
    })
    .then((year)=>{
        if(new Date().getFullYear()-year <= 1){
            newBook.price = 2;
        }
        console.log("Calculo del precio:" + newBook.price)
        return newBook;
    })
    .then((newBook)=>{
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
    if(req.body.body.trim() === '') return res.status(400).json({ body: 'Comment must not be empty'});

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
                title: bookData.title,
                cover: bookData.cover,
                price: bookData.price,
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

//Add book to desired
exports.addBookToDesired = (req, res) =>{
    const requestDocument = db.collection('desireds').where('userHandle', '==', req.user.handle)
    .where('bookId', '==', req.params.bookId).limit(1);

    const bookDocument = db.doc(`/books/${req.params.bookId}`);

    let bookData;

    bookDocument.get()
    .then(doc => {
        if(doc.exists){
            bookData = doc.data();
            if(bookData.availability === "available"){
                return res.status(404).json({ error: 'You can only add to desired books with provided status'});
            }
            bookData.bookId = doc.id;
            return requestDocument.get();
        }else{
            return res.status(404).json({ error: 'Book not found'});
        }
    })
    .then(data => {
        if(data.empty){
            return db.collection('desireds').add({
                bookId: req.params.bookId,
                bookOwner: bookData.owner,
                userHandle: req.user.handle,
                title: bookData.title,
                author: bookData.author,
                ownerImage: bookData.ownerImage,
                cover: bookData.cover,
                createdAt: new Date().toISOString()
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
exports.removeBookDesired = (req, res) => {
    const requestDocument = db.collection('desireds').where('userHandle', '==', req.user.handle)
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
            return res.status(400).json({ error: 'Book not desired'});
        } else {
            return db.doc(`/desireds/${data.docs[0].id}`).delete()
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

//Change book to available again
exports.changeToAvailable = (req, res) =>{
    const bookDocument = db.doc(`/books/${req.params.bookId}`);

    bookDocument.get()
    .then(doc => {
        if(doc.data().availability === 'provided'){
            return bookDocument.get();
        }else{
            return res.status(404).json({ error: 'Book must be provided'});
        }
    })
    .then(() => {
        return bookDocument.update({ availability: 'available' });
    })
    .then(() => {
        return db.collection('requests').where('bookId', '==', req.params.bookId).get().then(function(querySnapshot) {
            querySnapshot.forEach(function(doc) {
              doc.ref.delete();
            });
          });
    
    })
    .then(()=>{
        return res.json(req.params.bookId);
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
                price: doc.data().price,
                cover: doc.data().cover,
                title: doc.data().title,
                userPostDate: doc.data().userPostDate,
                owner: doc.data().owner,
                ownerImage: doc.data().ownerImage,
                location: doc.data().location,
                availability: doc.data().availability
            });
        });
        return res.json(books);
    })
    .catch(err => console.error(err));
};

//Upload a cover
exports.uploadCover = (req, res) => {
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
          return res.json({ coverURL: imageUrl });
        })
        .catch((err) => {
          console.error(err);
          return res.status(500).json({ error: 'something went wrong' });
        });
    });
    busboy.end(req.rawBody);
};

