const { db } = require('../util/admin');


//Get all offers
exports.getAllOffers = (req, res) => {
    db.collection('offers')
    .get()
    .then(data => {
        let offers = [];
        data.forEach(doc => {
            offers.push({
                customer: doc.data().customer,
                items: doc.data().items,
                total: doc.data().total,
                imageUrl: doc.data().imageUrl
            });
        });
        return res.json(offers);
    })
    .catch(err => console.error(err));
};