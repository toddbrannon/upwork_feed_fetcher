const express = require('express');
const Parser = require('rss-parser');
const session = require('express-session');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const app = express();
const parser = new Parser();
const schedule = require('node-schedule');
const moment = require('moment-timezone');
require('dotenv').config();

// Set the default timezone
moment.tz.setDefault('Pacific/Honolulu');

// Set the views directory and view engine
app.set('views', './views');
app.set('view engine', 'ejs');

// Add middleware to serve static files from the public directory
app.use(express.static('public'));

// Set up body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Set up session middleware
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: false
  }));

// Set up Mongoose connection
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
    console.log('Connected to MongoDB:', db.name);
});

app.use(express.json());

// Define the schema with explicit collection name
const jobFeedSchema = new mongoose.Schema({
    title: String,
    url: String,
}, { collection: 'job_feed' });

// Create the JobFeed model using the schema
const JobFeed = mongoose.model('JobFeed', jobFeedSchema);

const feedAccountSchema = new mongoose.Schema({
    email: String,
    username: String,
    ip: String
});

// Create the FeedAccount model using the schema
const FeedAccount = mongoose.model('FeedAccount', feedAccountSchema);

// Set up nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail',
                auth: {
                    user: process.env.EMAIL_USERNAME, // Your Gmail username
                    pass: process.env.APP_SPEC_PASSWORD // Your Gmail password
                }
});

// Middleware function to check if user is logged in
function requireLogin(req, res, next) {
    if (req.session.isLoggedIn) {
      // User is logged in, so proceed to the next middleware function
      next();
    } else {
      // User is not logged in, so redirect to the index page
      res.redirect('/');
    }
  }
  
  // Route handler for the root route
//   app.get('/', (req, res) => {
    // if (req.session.isLoggedIn) {
    //   User is logged in, so render the dashboard page
    //   res.render('dashboard');
    // } else {
    //   User is not logged in, so render the index page
    //   res.render('index');
    // }
    // res.render('dashboard');
//   });

app.get('/', (req, res) => {
    req.session.isLoggedIn = false; // Set isLoggedIn to true
    res.locals.isLoggedIn = req.session.isLoggedIn; // Pass isLoggedIn to the template
    res.locals.currentRoute = req.originalUrl; // Pass currentRoute to the template
    console.log("index rendering");
    res.render('index', { isLoggedIn: res.locals.isLoggedIn });
  });



app.get('/dashboard', (req, res) => {
    req.session.isLoggedIn = true; // Set isLoggedIn to true
    res.locals.isLoggedIn = req.session.isLoggedIn; // Pass isLoggedIn to the template
    res.locals.currentRoute = req.originalUrl; // Pass currentRoute to the template
    console.log("dashboard rendering");
    res.render('dashboard', { isLoggedIn: res.locals.isLoggedIn });
  });

// Route to render the getting_started view
app.get('/getting_started', (req, res) => {
    req.session.isLoggedIn = false; // Set isLoggedIn to false
    res.locals.isLoggedIn = req.session.isLoggedIn; // Pass isLoggedIn to the template
    res.locals.currentRoute = req.originalUrl; // Pass currentRoute to the template
    res.render('getting_started', { isLoggedIn: res.locals.isLoggedIn });
});

// Route to handle form submission and send confirmation email
app.post('/send_confirmation_email', (req, res) => {
    const email = req.body.email;

// Include the header partial
app.get('*', (req, res, next) => {
    res.locals.isLoggedIn = req.session.isLoggedIn; // Pass isLoggedIn to the template
    res.locals.currentRoute = req.originalUrl; // Pass currentRoute to the template
    res.locals.includeHeader = true; // Set includeHeader to true
    next();
});

    // Insert email into MongoDB collection
    const feedAccount = new FeedAccount({
        email: email
    });
    feedAccount.save();

    // Send confirmation email
    const mailOptions = {
        from: 'your_email@gmail.com',
        to: email,
        subject: 'Confirm your email',
        html: `
            <p>Hi ${email}!</p>
            <p>Please click the button below to confirm your email:</p>
            <a href="http://localhost:8000/confirm_email?email=${email}" target="_blank" style="display: inline-block; background-color: #007bff; color: #fff; padding: 10px 20px; border-radius: 5px; text-decoration: none;">Confirm Email</a>
        `
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });

    // Render the email_sent view
    res.render('email_sent', { email: email });
});

// Route to render the email_confirmed view
app.get('/email_confirmed', (req, res) => {
    res.render('email_confirmed');
});

// Route to render the feed_setup view
app.get('/feed_setup', (req, res) => {
    req.session.isLoggedIn = true; // Set isLoggedIn to true
    res.render('feed_setup');
});

app.get('/check-new-jobs-email', async (req, res) => {
    try {
        // Call the fetchAndSendJobAlerts function
        await fetchAndSendJobAlertsEmail();

        res.json({ message: 'Job checking completed' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Function to fetch and send job alerts
async function fetchAndSendJobAlertsEmail() {
    try {
        const feed = await parser.parseURL(process.env.RSS_FEED_URL);
        const newJobs = []; // Store new job listings

        // Retrieve existing job listings from the database
        const existingJobListings = await JobFeed.find({}, 'title');
        const existingTitles = existingJobListings.map(listing => listing.title);

        // Collect new job titles and URLs (limit to 20)
        const maxJobs = 20;
        for (let i = 0; i < Math.min(maxJobs, feed.items.length); i++) {
            const item = feed.items[i];
            const title = item.title;
            const url = item.link;

            if (!existingTitles.includes(title)) {
                newJobs.push({ title, url });
            }
        }

        // Save new job listings to MongoDB
        if (newJobs.length > 0) {
            const insertedJobListings = await JobFeed.insertMany(newJobs);
            console.log('Successfully saved', insertedJobListings.length, 'new job listings to MongoDB');

            // Rest of the code for sending email using Nodemailer...
        } else {
            console.log('No new job listings to save.');
        }
        if (newJobs.length > 0) {
            // Set up Nodemailer transporter
            const transporter = nodemailer.createTransport({
                service: 'Gmail',
                auth: {
                    user: process.env.EMAIL_USERNAME, // Your Gmail username
                    pass: process.env.APP_SPEC_PASSWORD // Your Gmail password
                }
            });

            const messageBody = newJobs
                .map(job => `${job.title}\n${job.url}`)
                .join('\n\n'); // Combine job titles and URLs

            // Set up email data
            const mailOptions = {
                from: process.env.EMAIL_USERNAME, // Sender's email address
                to: process.env.RECIPIENT_EMAIL, // Recipient's email address
                subject: 'New Job Listings', // Email subject
                text: messageBody // Email body
            };

            // Send the email
            const info = await transporter.sendMail(mailOptions);
            console.log('Email sent:', info.response);
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
    
}


const cronExpression = '*/15 7-19 * * *'; // Every 15 minutes from 7 AM to 7 PM
schedule.scheduleJob(cronExpression, fetchAndSendJobAlertsEmail);


app.listen(8000, () => {
    console.log('Server is running on port 8000');
});
