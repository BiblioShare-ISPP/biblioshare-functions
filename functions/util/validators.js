const isEmail = (email) =>{
    const regEx = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (email.match(regEx)) return true;
    else return false;
}

const isEmpty = (string) => {
    if(string.trim() === '') return true;
    else return false;
}

const legalString = (userInput) =>{
    const regEx = /^[a-zA-Z0-9]+$/;
    if (userInput.match(regEx)) return true;
    else return false;
} 

exports.validateSignupData = (data) => {
    let errors = {};

    if(isEmpty(data.email)){
        errors.email = 'Must not be empty';
    }else if(!isEmail(data.email)){
        errors.email = 'Email must be a valid email address';
    }else if(isEmpty(data.location)){
        errors.location = 'Wrong location';
    }

    if(isEmpty(data.password)) errors.password = 'Must not be empty';
    if(data.password !== data.confirmPassword) errors.confirmPassword = 'Password must match';
    if(isEmpty(data.handle)) errors.handle = 'Must not be empty';
    if(!legalString(data.handle)) errors.handle = 'Handle can not containt special characters';

    return{
        errors, 
        valid: Object.keys(errors).length === 0 ? true : false 
    }
};

exports.validateBookData = (data) => {
    let errors = {};
    if(isEmpty(data.author)) errors.author = 'Must not be empty';
    if(isEmpty(data.title)) errors.title = 'Must not be empty';
    if(isEmpty(data.location)) errors.location = 'Must add a location in your profile before post a book';
    return{
        errors, 
        valid: Object.keys(errors).length === 0 ? true : false 
    }
};

exports.validateLoginData = (data) => {
    
    let errors = {};

    if(isEmpty(data.email)) errors.email = 'Must not be empty';
    if(isEmpty(data.password)) errors.password = 'Must not be empty';

    return{
        errors, 
        valid: Object.keys(errors).length === 0 ? true : false 
    }

};

exports.reduceUserDetails = (data) =>{
    let userDetails = {};

    if(!isEmpty(data.bio.trim())) userDetails.bio = data.bio;
    if(!isEmpty(data.location.trim())) userDetails.location = data.location;

    return userDetails;
};